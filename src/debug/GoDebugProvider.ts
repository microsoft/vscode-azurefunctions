/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';
import { spawn } from 'child_process';
import { createConnection } from 'net';
import { type CancellationToken, type DebugConfiguration, type WorkspaceFolder } from 'vscode';
import { hostStartTaskName, localhost } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { delay } from '../utils/delay';
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

    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration | undefined> {
        const result = await super.resolveDebugConfiguration(folder, debugConfiguration, token);
        if (!result || result.mode !== 'remote') {
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
        void pollAndAttachDlv(port);

        return result;
    }
}

async function pollAndAttachDlv(port: number): Promise<void> {
    await callWithTelemetryAndErrorHandling('azureFunctions.go.attachDlv', async (context: IActionContext) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.properties.dlvPort = String(port);

        try {
            await killStaleDlv(port);

            const pid = await pollForGoWorkerPid(workerPollTimeoutMs);
            if (pid === undefined) {
                context.telemetry.properties.dlvAttachResult = 'workerNotFound';
                ext.outputChannel.appendLog(localize('dlvWorkerNotFound', 'Could not find Go worker process "{0}" within {1}s. Skipping dlv auto-attach.', goWorkerProcessName, workerPollTimeoutMs / 1_000));
                return;
            }
            context.telemetry.measurements.dlvWorkerPid = pid;

            // Another dlv may have started in the meantime (very fast restart).
            if (await isPortInUse(port)) {
                context.telemetry.properties.dlvAttachResult = 'portTaken';
                ext.outputChannel.appendLog(localize('dlvPortTaken', 'Port {0} is already in use; assuming dlv is already attached.', port));
                return;
            }

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
                stdio: 'ignore',
            });
            dlvProcess.unref();

            await waitForPort(port, dlvListenTimeoutMs);
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

async function pollForGoWorkerPid(timeoutMs: number): Promise<number | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const pid = await findGoWorkerPid();
        if (pid !== undefined) {
            return pid;
        }
        await delay(workerPollIntervalMs);
    }
    return undefined;
}

async function findGoWorkerPid(): Promise<number | undefined> {
    if (process.platform === 'win32') {
        const imageName = `${goWorkerProcessName}.exe`;
        const result = await cpUtils.tryExecuteCommandLine(undefined, undefined, `tasklist /FI "IMAGENAME eq ${imageName}" /FO CSV /NH`);
        if (result.code !== 0) {
            return undefined;
        }
        const match = result.cmdOutput.match(new RegExp(`"${imageName.replace('.', '\\.')}","(\\d+)"`));
        return match ? parseInt(match[1], 10) : undefined;
    }

    const result = await cpUtils.tryExecuteCommandLine(undefined, undefined, `pgrep -x ${goWorkerProcessName}`);
    if (result.code !== 0) {
        return undefined;
    }
    const pid = parseInt(result.cmdOutput.trim().split('\n')[0], 10);
    return Number.isNaN(pid) ? undefined : pid;
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

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortInUse(port)) {
            return;
        }
        await delay(dlvListenRetryIntervalMs);
    }
    throw new Error(localize('dlvListenTimeout', 'Timed out waiting for Delve to start listening on port {0} within {1}s.', port, timeoutMs / 1_000));
}
