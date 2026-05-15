/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';
import { spawn, type ChildProcess } from 'child_process';
import { createConnection } from 'net';
import psTree, { type PS } from 'ps-tree';
import * as vscode from 'vscode';
import { type CancellationToken, type DebugConfiguration, type WorkspaceFolder } from 'vscode';
import { hostStartTaskName, hostStartTaskNameRegExp, localhost } from '../constants';
import { ext } from '../extensionVariables';
import { runningFuncTaskMap, type IRunningFuncTask } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { delay } from '../utils/delay';
import { getWindowsProcessTree, ProcessDataFlag, type IProcessInfo, type IWindowsProcessTree } from '../utils/windowsProcessTree';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';
import { validateDelveInstalled } from './validateDelveInstalled';

export const defaultGoDebugPort: number = 2345;

export const goDebugConfig: DebugConfiguration = {
    name: localize('attachGo', 'Attach to Go Functions'),
    type: 'go',
    request: 'attach',
    mode: 'remote',
    port: defaultGoDebugPort,
    host: localhost,
    preLaunchTask: hostStartTaskName,
};

// The Go worker binary is always named `app` (or `app.exe` on Windows) by the
// Functions core tools. If core tools changes that convention, this needs to
// change too.
const goWorkerProcessName: string = 'app';

// How long to wait for the Go worker process to appear after `func host start`
// kicks off. The build step is part of `func host start`, so this needs to
// cover compile time as well.
const workerPollTimeoutMs: number = 120_000;
const workerPollIntervalMs: number = 1_000;
// How long to wait for dlv to start listening on the debug port after we spawn it.
const dlvListenTimeoutMs: number = 10_000;
const dlvListenRetryIntervalMs: number = 500;
// Brief pause to let a freed port settle after killing a stale dlv.
const stalePortFreedDelayMs: number = 1_000;

// Tracks the dlv child process we spawned per workspace folder so we can
// terminate it proactively when the matching debug session ends. Keyed by
// `WorkspaceFolder.uri.fsPath`. If a second debug session targets the same
// folder before the first ends, the previous entry is killed and replaced.
const activeDlvProcesses = new Map<string, ChildProcess>();

/**
 * Wires the dlv-cleanup-on-session-end behavior. Call once during extension
 * activation; the returned disposable should be added to context.subscriptions.
 */
export function registerGoDebugSessionCleanup(): vscode.Disposable {
    return vscode.debug.onDidTerminateDebugSession((session) => {
        if (session.type !== 'go' || !session.workspaceFolder) {
            return;
        }
        killTrackedDlv(session.workspaceFolder.uri.fsPath);
    });
}

function killTrackedDlv(folderFsPath: string): void {
    const dlv = activeDlvProcesses.get(folderFsPath);
    if (!dlv) {
        return;
    }
    activeDlvProcesses.delete(folderFsPath);
    if (dlv.pid === undefined) {
        return;
    }
    try {
        if (process.platform === 'win32') {
            // Windows has no process groups — just terminate dlv directly.
            dlv.kill();
        } else {
            // dlv was spawned with `detached: true`, which makes it the leader of a
            // new process group. Signal the whole group (negative pid) so any
            // descendants dlv may have spawned are cleaned up too.
            process.kill(-dlv.pid, 'SIGTERM');
        }
        ext.outputChannel.appendLog(localize('dlvCleanedUp', 'Cleaned up Delve process (PID {0}) for "{1}".', dlv.pid, folderFsPath));
    } catch {
        // Process already gone — fine.
    }
}

export class GoDebugProvider extends FuncDebugProviderBase {
    // Delve attaches to the worker process out-of-band. These satisfy the
    // abstract members on FuncDebugProviderBase but are never read because
    // FuncTaskProvider has no `case ProjectLanguage.Go` branch.
    public readonly workerArgKey: string = 'GOLANG_WORKER_DEBUG_FLAGS';
    protected readonly defaultPortOrPipeName: number = defaultGoDebugPort;
    protected readonly debugConfig: DebugConfiguration = goDebugConfig;

    public async getWorkerArgValue(_folder: WorkspaceFolder): Promise<string> {
        return '';
    }

    // resolveDebugConfiguration is a hook VS Code calls every time a debug session is about to start
    // GoDebugProvider overrides FuncDebugProviderBase.resolveDebugConfiguration
    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration | undefined> {
        const result = await super.resolveDebugConfiguration(folder, debugConfiguration, token);
        if (!result || result.mode !== 'remote') {
            return result;
        }

        // Mirror the gate in FuncDebugProviderBase: only run our Functions-specific
        // dlv-attach lifecycle when the debug session is actually for a Functions
        // project (signalled by the `func: host start` preLaunchTask).
        if (!hostStartTaskNameRegExp.test(debugConfiguration.preLaunchTask as string)) {
            return result;
        }

        const port: number = (typeof result.port === 'number' ? result.port : defaultGoDebugPort);

        const delveAvailable = await callWithTelemetryAndErrorHandling('azureFunctions.go.validateDelveBeforeDebug', async (context: IActionContext) => {
            context.errorHandling.suppressDisplay = true;
            const message = localize('installDelve', 'Delve (dlv) is required to debug Go Functions. Install Delve and try again.');
            return await validateDelveInstalled(context, message, folder?.uri.fsPath);
        });

        if (!delveAvailable) {
            return undefined;
        }

        // Fire-and-forget: the preLaunchTask (`func host start`) builds and
        // launches the Go worker concurrently with this. The poller watches
        // for that worker, then spawns `dlv attach` so VS Code's Go extension
        // can connect to dlv's DAP server on `port`.
        void pollAndAttachDlv(port, folder, token);

        return result;
    }
}

async function pollAndAttachDlv(port: number, folder: WorkspaceFolder | undefined, token: CancellationToken | undefined): Promise<void> {
    await callWithTelemetryAndErrorHandling('azureFunctions.go.attachDlv', async (context: IActionContext) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.properties.dlvPort = String(port);

        try {
            // 1. Free the port if a prior session's dlv is still listening on it.
            await killStaleDlv(port);
            if (token?.isCancellationRequested) {
                context.telemetry.properties.dlvAttachResult = 'cancelled';
                return;
            }

            // 2. Wait for `func host start` to build and launch the Go worker, then capture its PID.
            const pid = await pollForGoWorkerPid(workerPollTimeoutMs, folder, token);
            if (token?.isCancellationRequested) {
                context.telemetry.properties.dlvAttachResult = 'cancelled';
                return;
            }
            if (pid === undefined) {
                context.telemetry.properties.dlvAttachResult = 'workerNotFound';
                ext.outputChannel.appendLog(localize('dlvWorkerNotFound', 'Could not find Go worker process "{0}" within {1}s. Skipping dlv auto-attach.', goWorkerProcessName, workerPollTimeoutMs / 1_000));
                return;
            }
            context.telemetry.measurements.dlvWorkerPid = pid;

            // 3. Bail if dlv is already listening on the port. The window between killStaleDlv
            // (step 1) and our spawn is long, so a parallel poller (rapid restart, second window)
            // may have already attached. Let VS Code connect to whatever's there rather than
            // spawning a duplicate that would fail with EADDRINUSE.
            if (await isPortInUse(port)) {
                context.telemetry.properties.dlvAttachResult = 'portTaken';
                ext.outputChannel.appendLog(localize('dlvPortTaken', 'Port {0} is already in use; assuming dlv is already attached.', port));
                return;
            }

            // 4. Spawn dlv, attaching to the worker PID. Detached so it outlives this poller.
            const dlvProcess = spawn('dlv', [
                'attach', String(pid),
                '--headless',
                // --continue is required: without it, dlv pauses the worker and the
                // Functions host kills the worker for being unresponsive.
                '--continue',
                `--listen=:${port}`,
                '--api-version=2',
                '--accept-multiclient',
            ], {
                detached: true,
                // Pipe stdio so we can surface dlv errors. Without this the spawn
                // is a black box on failure.
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            // 5. Surface spawn errors and dlv's own output to the Azure Functions output channel.
            dlvProcess.on('error', (err) => {
                ext.outputChannel.appendLog(localize('dlvSpawnFailed', 'Failed to spawn Delve: {0}', err.message));
            });
            dlvProcess.stdout?.on('data', (chunk: Buffer) => {
                ext.outputChannel.append(`[dlv] ${chunk.toString()}`);
            });
            dlvProcess.stderr?.on('data', (chunk: Buffer) => {
                ext.outputChannel.append(`[dlv] ${chunk.toString()}`);
            });
            dlvProcess.unref();

            // 6. Track this dlv for proactive cleanup on session end. If a previous dlv was
            // tracked for this folder (rapid restart), kill it first so it doesn't become orphaned.
            if (folder) {
                killTrackedDlv(folder.uri.fsPath);
                activeDlvProcesses.set(folder.uri.fsPath, dlvProcess);
            }

            // 7. Block until dlv is actually listening, so VS Code's Go extension has a port to connect to.
            await waitForPort(port, dlvListenTimeoutMs, token);
            if (token?.isCancellationRequested) {
                context.telemetry.properties.dlvAttachResult = 'cancelled';
                return;
            }
            context.telemetry.properties.dlvAttachResult = 'attached';
            ext.outputChannel.appendLog(localize('dlvAttached', 'Delve attached to Go worker (PID {0}) and listening on port {1}.', pid, port));
        } catch (err) {
            context.telemetry.properties.dlvAttachResult = 'failed';
            const message = err instanceof Error ? err.message : String(err);
            ext.outputChannel.appendLog(localize('dlvAttachFailed', 'Failed to auto-attach Delve: {0}', message));
            throw err;
        }
    });
}

async function killStaleDlv(port: number): Promise<void> {
    if (!await isPortInUse(port)) {
        return;
    }

    if (process.platform === 'win32') {
        // netstat → find PID listening on port → tasklist → confirm it's dlv.exe → taskkill.
        const netstat = await cpUtils.tryExecuteCommandLine(undefined, undefined, `netstat -ano | findstr ":${port}" | findstr "LISTENING"`);
        if (netstat.code !== 0) {
            return;
        }
        const match = netstat.cmdOutput.match(/LISTENING\s+(\d+)/);
        if (!match) {
            return;
        }
        const pid = match[1];
        const taskInfo = await cpUtils.tryExecuteCommandLine(undefined, undefined, `tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
        if (taskInfo.code !== 0 || !taskInfo.cmdOutput.toLowerCase().includes('dlv.exe')) {
            return;
        }
        await cpUtils.tryExecuteCommandLine(undefined, undefined, `taskkill /PID ${pid} /F`);
    } else {
        const lsof = await cpUtils.tryExecuteCommandLine(undefined, undefined, `lsof -ti :${port}`);
        if (lsof.code !== 0) {
            return;
        }
        const pid = lsof.cmdOutput.trim().split('\n')[0];
        if (!pid) {
            return;
        }
        const psInfo = await cpUtils.tryExecuteCommandLine(undefined, undefined, `ps -p ${pid} -o comm=`);
        if (psInfo.code !== 0 || psInfo.cmdOutput.trim() !== 'dlv') {
            return;
        }
        await cpUtils.tryExecuteCommandLine(undefined, undefined, `kill -9 ${pid}`);
    }

    await delay(stalePortFreedDelayMs);
}

async function pollForGoWorkerPid(timeoutMs: number, folder: WorkspaceFolder | undefined, token: CancellationToken | undefined): Promise<number | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (token?.isCancellationRequested) {
            return undefined;
        }
        const pid = await findGoWorkerPid(folder);
        if (pid !== undefined) {
            return pid;
        }
        await delay(workerPollIntervalMs);
    }
    return undefined;
}

/**
 * Resolves the PID of *this* debug session's Go worker by walking the children
 * of the func host process tracked in `runningFuncTaskMap`. Scoping by parent
 * avoids attaching to an unrelated `app.exe` that happens to be running on the
 * machine, and naturally distinguishes between concurrent Functions debug
 * sessions in different VS Code windows (each window has its own func host).
 */
async function findGoWorkerPid(folder: WorkspaceFolder | undefined): Promise<number | undefined> {
    if (!folder) {
        return undefined;
    }
    // Use getAll instead of get(folder) because get() filters by cwd, which we
    // don't have at debug-resolve time. getAll returns every task tracked for
    // this folder; for our use case there's at most one func host per folder.
    const hostTask = runningFuncTaskMap.getAll(folder).find((t): t is IRunningFuncTask => t !== undefined);
    if (hostTask === undefined) {
        return undefined;
    }
    const children = await listDescendantProcesses(hostTask.processId);
    const goWorker = children.find(c => isGoWorkerProcess(c.name));
    return goWorker?.pid;
}

interface DescendantProcess {
    pid: number;
    name: string | undefined;
}

async function listDescendantProcesses(rootPid: number): Promise<DescendantProcess[]> {
    if (process.platform === 'win32') {
        const tree: IWindowsProcessTree = getWindowsProcessTree();
        const procs: IProcessInfo[] | undefined = await new Promise((resolve) => {
            tree.getProcessList(rootPid, resolve, ProcessDataFlag.None);
        });
        return (procs ?? []).map(p => ({ pid: p.pid, name: p.name }));
    }

    // ps-tree typings omit COMM but it's the actual field on some platforms.
    // See pickFuncProcess.ts for the same workaround.
    type ActualUnixPS = PS & { COMM?: string };
    const procs: ActualUnixPS[] = await new Promise((resolve, reject) => {
        psTree(rootPid, (err: Error | null, result: PS[]) => err ? reject(err) : resolve(result as ActualUnixPS[]));
    });
    return procs.map(p => ({ pid: parseInt(p.PID, 10), name: p.COMMAND ?? p.COMM }));
}

function isGoWorkerProcess(name: string | undefined): boolean {
    if (!name) {
        return false;
    }
    const lower = name.toLowerCase();
    return lower === goWorkerProcessName || lower === `${goWorkerProcessName}.exe`;
}

async function isPortInUse(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const socket = createConnection({ port, host: localhost });
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
    });
}

async function waitForPort(port: number, timeoutMs: number, token: CancellationToken | undefined): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (token?.isCancellationRequested) {
            return;
        }
        if (await isPortInUse(port)) {
            return;
        }
        await delay(dlvListenRetryIntervalMs);
    }
    throw new Error(localize('dlvListenTimeout', 'Timed out waiting for Delve to start listening on port {0} within {1}s.', port, timeoutMs / 1_000));
}
