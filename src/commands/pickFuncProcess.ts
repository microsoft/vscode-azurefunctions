/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sendRequestWithTimeout, type AzExtRequestPrepareOptions } from '@microsoft/vscode-azext-azureutils';
import { callWithTelemetryAndErrorHandling, parseError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import psTree, { type PS } from 'ps-tree';
import * as vscode from 'vscode';
import { dotnetIsolatedDebugFlag, enableJsonOutputFlag, hostStartTaskName, jsonOutputFileFlag } from '../constants';
import { preDebugValidate, type IPreDebugValidateResult } from '../debug/validatePreDebug';
import { ext } from '../extensionVariables';
import { buildPathToWorkspaceFolderMap, getFuncPortFromTaskOrProject, isFuncHostTask, runningFuncTaskMap, stopFuncTaskIfRunning, type IRunningFuncTask } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';
import { delay } from '../utils/delay';
import { requestUtils } from '../utils/requestUtils';
import { taskUtils } from '../utils/taskUtils';
import { getWindowsProcessTree, ProcessDataFlag, type IProcessInfo, type IWindowsProcessTree } from '../utils/windowsProcessTree';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

const funcTaskReadyEmitter = new vscode.EventEmitter<vscode.WorkspaceFolder>();
export const onDotnetFuncTaskReady = funcTaskReadyEmitter.event;

export function disposeFuncTaskReadyEmitter(): void {
    funcTaskReadyEmitter.dispose();
}

/**
 * Result returned from starting a function host process via the API.
 */
export interface IStartFuncProcessResult {
    /**
     * The process ID of the started function host.
     */
    processId: string;
    /**
     * Whether the function host was successfully started.
     */
    success: boolean;
    /**
     * Error message if the function host failed to start.
     */
    error: string;
    /**
     * An async iterable stream of terminal output from the function host task.
     * This stream provides real-time access to the output of the `func host start` command,
     * allowing consumers to monitor host status, capture logs, and detect errors.
     *
     * The stream will be undefined if the host failed to start or if output streaming is not available.
     * Consumers should iterate over the stream asynchronously to read output lines as they are produced.
     * The stream remains active for the lifetime of the function host process.
     */
    stream: AsyncIterable<string> | undefined;
}

export async function startFuncProcessFromApi(
    buildPath: string,
    args: string[],
    env: { [key: string]: string }
): Promise<IStartFuncProcessResult> {
    const result: IStartFuncProcessResult = {
        processId: '',
        success: false,
        error: '',
        stream: undefined
    };

    let funcHostStartCmd: string = 'func host start';
    if (args) {
        funcHostStartCmd += ` ${args.join(' ')}`;
    }

    const jsonOutputFile = shouldInjectJsonOutputFile(funcHostStartCmd) ? generateJsonOutputFilePath() : undefined;
    if (jsonOutputFile) {
        funcHostStartCmd += ` ${jsonOutputFileFlag} "${jsonOutputFile}"`;
    }

    await callWithTelemetryAndErrorHandling('azureFunctions.api.startFuncProcess', async (context: IActionContext) => {
        try {
            let workspaceFolder: vscode.WorkspaceFolder | undefined = buildPathToWorkspaceFolderMap.get(buildPath);

            if (workspaceFolder === undefined) {
                workspaceFolder = {
                    uri: vscode.Uri.parse(buildPath),
                    name: buildPath,
                    index: -1
                };
            }

            await waitForPrevFuncTaskToStop(workspaceFolder);

            buildPathToWorkspaceFolderMap.set(buildPath, workspaceFolder);

            const funcTask = new vscode.Task({ type: `func  ${buildPath}` },
                workspaceFolder,
                hostStartTaskName,
                `func`,
                new vscode.ShellExecution(funcHostStartCmd, {
                    cwd: buildPath,
                    env
                }));

            // funcTask.execution?.options.cwd to get build path for later reference
            const taskInfo = await startFuncTask(context, workspaceFolder, buildPath, funcTask);
            result.processId = await pickChildProcess(taskInfo);
            result.success = true;
            result.stream = taskInfo.stream;
        } catch (err) {
            const pError = parseError(err);
            result.error = pError.message;
        }
    });

    return result;
}

export async function pickFuncProcess(context: IActionContext, debugConfig: vscode.DebugConfiguration): Promise<string | undefined> {
    const result: IPreDebugValidateResult = await preDebugValidate(context, debugConfig);
    if (!result.shouldContinue) {
        throw new UserCancelledError('preDebugValidate');
    }

    const preLaunchTaskName: string | undefined = debugConfig.preLaunchTask;
    const tasks: vscode.Task[] = await vscode.tasks.fetchTasks();
    const funcTask: vscode.Task | undefined = tasks.find(t => {
        return t.scope === result.workspace && (preLaunchTaskName ? t.name === preLaunchTaskName : isFuncHostTask(t));
    });

    if (!funcTask) {
        throw new Error(localize('noFuncTask', 'Failed to find "{0}" task.', preLaunchTaskName || hostStartTaskName));
    }

    const buildPath: string = (funcTask.execution as vscode.ShellExecution)?.options?.cwd || result.workspace.uri.fsPath;
    await waitForPrevFuncTaskToStop(result.workspace, buildPath);
    const taskToExecute = injectJsonOutputFileArgIfNeeded(funcTask);
    const taskInfo = await startFuncTask(context, result.workspace, buildPath, taskToExecute);
    return await pickChildProcess(taskInfo);
}

async function waitForPrevFuncTaskToStop(workspaceFolder: vscode.WorkspaceFolder, buildPath?: string): Promise<void> {
    await stopFuncTaskIfRunning(workspaceFolder, buildPath);

    const timeoutInSeconds: number = 30;
    const maxTime: number = Date.now() + timeoutInSeconds * 1000;
    while (Date.now() < maxTime) {
        if (!runningFuncTaskMap.has(workspaceFolder)) {
            return;
        }
        await delay(1000);
    }
    throw new Error(localize('failedToFindFuncHost', 'Failed to stop previous running Functions host within "{0}" seconds. Make sure the task has stopped before you debug again.', timeoutInSeconds));
}

async function startFuncTask(context: IActionContext, workspaceFolder: vscode.WorkspaceFolder, buildPath: string, funcTask: vscode.Task): Promise<IRunningFuncTask> {
    const settingKey: string = 'pickProcessTimeout';
    const settingValue: number | undefined = getWorkspaceSetting<number>(settingKey);
    const timeoutInSeconds: number = Number(settingValue);
    if (isNaN(timeoutInSeconds)) {
        throw new Error(localize('invalidSettingValue', 'The setting "{0}" must be a number, but instead found "{1}".', settingKey, settingValue));
    }
    context.telemetry.properties.timeoutInSeconds = timeoutInSeconds.toString();

    let taskError: Error | undefined;
    const errorListener: vscode.Disposable = vscode.tasks.onDidEndTaskProcess((e: vscode.TaskProcessEndEvent) => {
        if (e.execution.task.scope === workspaceFolder && e.exitCode !== 0) {
            context.errorHandling.suppressReportIssue = true;
            // Throw if _any_ task fails, not just funcTask (since funcTask often depends on build/clean tasks)
            taskError = new Error(localize('taskFailed', 'Error exists after running preLaunchTask "{0}". View task output for more information.', e.execution.task.name, e.exitCode));
            errorListener.dispose();
        }
    });

    try {
        // The "IfNotActive" part helps when the user starts, stops and restarts debugging quickly in succession. We want to use the already-active task to avoid two func tasks causing a port conflict error
        // The most common case we hit this is if the "clean" or "build" task is running when we get here. It's unlikely the "func host start" task is active, since we would've stopped it in `waitForPrevFuncTaskToStop` above
        await taskUtils.executeIfNotActive(funcTask);

        const intervalMs: number = 500;
        const funcPort: string = await getFuncPortFromTaskOrProject(context, funcTask, workspaceFolder);
        let statusRequestTimeout: number = intervalMs;
        const maxTime: number = Date.now() + timeoutInSeconds * 1000;
        const dotnetIsolatedDebugMode = isDotnetIsolatedDebugTask(funcTask);

        while (Date.now() < maxTime) {
            if (taskError !== undefined) {
                throw taskError;
            }

            const taskInfo: IRunningFuncTask | undefined = runningFuncTaskMap.get(workspaceFolder, buildPath);
            if (taskInfo) {
                if (dotnetIsolatedDebugMode) {
                    // Prefer the file written by func core tools via --json-output-file; if that flag
                    // isn't present (e.g., the task was already running before we could inject it),
                    // fall back to the worker PID parsed from the terminal stream by funcHostTask.
                    const newPid = (taskInfo.workerPidFile ? await getWorkerPidFromJsonOutput(taskInfo) : undefined)
                        ?? taskInfo.workerProcessId;
                    if (newPid) {
                        taskInfo.processId = newPid;
                        return taskInfo;
                    }
                } else {
                    // otherwise, we have to wait for the status url to indicate the host is running
                    for (const scheme of ['http', 'https']) {
                        const statusRequest: AzExtRequestPrepareOptions = { url: `${scheme}://localhost:${funcPort}/admin/host/status`, method: 'GET' };
                        if (scheme === 'https') {
                            statusRequest.rejectUnauthorized = false;
                        }

                        try {
                            // wait for status url to indicate functions host is running
                            const response = await sendRequestWithTimeout(context, statusRequest, statusRequestTimeout, undefined);
                            if (response.parsedBody.state.toLowerCase() === 'running') {
                                funcTaskReadyEmitter.fire(workspaceFolder);
                                return taskInfo;
                            }
                        } catch (error) {
                            if (requestUtils.isTimeoutError(error)) {
                                // Timeout likely means localhost isn't ready yet, but we'll increase the timeout each time it fails just in case it's a slow computer that can't handle a request that fast
                                statusRequestTimeout *= 2;
                                context.telemetry.measurements.maxStatusTimeout = statusRequestTimeout;
                            } else {
                                // ignore
                            }
                        }
                    }
                }
            }

            await delay(intervalMs);
        }

        throw new Error(localize('failedToFindFuncHost', 'Failed to detect running Functions host within "{0}" seconds. You may want to adjust the "{1}" setting.', timeoutInSeconds, `${ext.prefix}.${settingKey}`));
    } finally {
        errorListener.dispose();
    }
}

async function getWorkerPidFromJsonOutput(taskInfo: IRunningFuncTask): Promise<number | undefined> {
    // func core tools writes the worker PID JSON to the path passed via --json-output-file before
    // the worker waits for the debugger to attach. Read that file and parse out workerProcessId.
    if (!taskInfo.workerPidFile) {
        return;
    }

    try {
        if (!fs.existsSync(taskInfo.workerPidFile)) {
            return;
        }
        const content = fs.readFileSync(taskInfo.workerPidFile, 'utf8');
        const obj = JSON.parse(content) as Record<string, unknown>;
        if (typeof obj['workerProcessId'] === 'number') {
            return obj['workerProcessId'];
        }
    } catch {
        // file not yet written or invalid JSON - keep waiting
    }
    return;
}

/**
 * Returns true if `commandOrArgs` contains the flags that indicate the func host is being launched
 * for dotnet-isolated debugging and is configured to emit JSON output. When both are present, we
 * inject `--json-output-file <path>` so that func core tools writes the worker PID directly to a
 * file, allowing pickFuncProcess to attach the debugger before any user code runs.
 */
function shouldInjectJsonOutputFile(commandLine: string): boolean {
    return commandLine.includes(dotnetIsolatedDebugFlag)
        && commandLine.includes(enableJsonOutputFlag)
        && !commandLine.includes(jsonOutputFileFlag);
}

/**
 * Returns true if the func task is configured for dotnet-isolated debugging with JSON output. When
 * true, the picker waits for a worker PID (from --json-output-file or parsed from the terminal
 * stream) instead of polling the host status endpoint.
 */
function isDotnetIsolatedDebugTask(funcTask: vscode.Task): boolean {
    if (!(funcTask.execution instanceof vscode.ShellExecution)) {
        return false;
    }
    const flatArgs = getFlatShellArgs(funcTask.execution);
    return flatArgs.includes(dotnetIsolatedDebugFlag) && flatArgs.includes(enableJsonOutputFlag);
}

function generateJsonOutputFilePath(): string {
    return path.join(os.tmpdir(), `azfunc-worker-pid-${process.pid}-${Date.now()}.json`);
}

/**
 * If the user's func task is configured for dotnet-isolated debugging with JSON output but does not
 * already specify a `--json-output-file`, returns a wrapper task with that flag injected so that
 * func core tools writes the worker PID directly to a file we control.
 */
function injectJsonOutputFileArgIfNeeded(funcTask: vscode.Task): vscode.Task {
    const exec = funcTask.execution;
    if (!(exec instanceof vscode.ShellExecution)) {
        return funcTask;
    }

    const flatArgs = getFlatShellArgs(exec);
    const hasDebugFlag = flatArgs.includes(dotnetIsolatedDebugFlag);
    const hasEnableJsonOutput = flatArgs.includes(enableJsonOutputFlag);
    const alreadyHasOutputFile = flatArgs.includes(jsonOutputFileFlag) || flatArgs.some(a => a.startsWith(`${jsonOutputFileFlag}=`));
    if (!hasDebugFlag || !hasEnableJsonOutput || alreadyHasOutputFile) {
        return funcTask;
    }

    const jsonOutputFile = generateJsonOutputFilePath();
    let newExec: vscode.ShellExecution;
    if (exec.commandLine !== undefined) {
        newExec = new vscode.ShellExecution(`${exec.commandLine} ${jsonOutputFileFlag} "${jsonOutputFile}"`, exec.options);
    } else {
        // When constructed with command + args, both are defined; defensively coalesce to satisfy the API types.
        newExec = new vscode.ShellExecution(exec.command ?? 'func', [...(exec.args ?? []), jsonOutputFileFlag, jsonOutputFile], exec.options);
    }

    const wrapped = new vscode.Task(
        funcTask.definition,
        funcTask.scope ?? vscode.TaskScope.Workspace,
        funcTask.name,
        funcTask.source,
        newExec,
        funcTask.problemMatchers,
    );
    wrapped.isBackground = funcTask.isBackground;
    wrapped.presentationOptions = funcTask.presentationOptions;
    wrapped.group = funcTask.group;
    wrapped.runOptions = funcTask.runOptions;
    wrapped.detail = funcTask.detail;
    return wrapped;
}

function getFlatShellArgs(exec: vscode.ShellExecution): string[] {
    if (exec.commandLine !== undefined) {
        // Best-effort split for detection; quoting/escaping is preserved in the original commandLine when we re-emit.
        return exec.commandLine.split(/\s+/).filter(Boolean);
    }
    return (exec.args ?? []).map(a => (typeof a === 'string' ? a : a.value));
}

type OSAgnosticProcess = { command: string | undefined; pid: number | string };

/**
 * Picks the child process that we want to use. Scenarios to keep in mind:
 * 1. On Windows, the rootPid is almost always the parent PowerShell process
 * 2. On Unix, the rootPid may be a wrapper around the main func exe if installed with npm
 * 3. Starting with the .NET 5 worker, Windows sometimes has an inner process we _don't_ want like 'conhost.exe'
 * The only processes we should want to attach to are the "func" process itself or a "dotnet" process running a dll, so we will pick the innermost one of those
 */
async function pickChildProcess(taskInfo: IRunningFuncTask): Promise<string> {
    // Workaround for https://github.com/microsoft/vscode-azurefunctions/issues/2656
    if (!isRunning(taskInfo.processId) && vscode.window.activeTerminal) {
        const terminalPid = await vscode.window.activeTerminal.processId;
        if (terminalPid) {
            // NOTE: Intentionally updating the object so that `runningFuncTaskMap` is affected, too
            taskInfo.processId = terminalPid;
        }
    }
    const children: OSAgnosticProcess[] = process.platform === 'win32' ? await getWindowsChildren(taskInfo.processId) : await getUnixChildren(taskInfo.processId);
    const child: OSAgnosticProcess | undefined = children.reverse().find(c => /(dotnet|func)(\.exe|)$/i.test(c.command || ''));
    return child ? child.pid.toString() : String(taskInfo.processId);
}

// Looks like this bug was fixed, but never merged:
// https://github.com/indexzero/ps-tree/issues/18
type ActualUnixPS = PS & { COMM?: string };

async function getUnixChildren(pid: number): Promise<OSAgnosticProcess[]> {
    const processes: ActualUnixPS[] = await new Promise<ActualUnixPS[]>((resolve, reject): void => {
        psTree(pid, (error: Error | null, result: readonly PS[]) => {
            if (error) {
                reject(error);
            } else {
                resolve([...result] as ActualUnixPS[]);
            }
        });
    });
    return processes.map(c => { return { command: c.COMMAND || c.COMM, pid: c.PID }; });
}

async function getWindowsChildren(pid: number): Promise<OSAgnosticProcess[]> {
    const windowsProcessTree: IWindowsProcessTree = getWindowsProcessTree();
    const processes: (IProcessInfo[] | undefined) = await new Promise((resolve): void => {
        windowsProcessTree.getProcessList(pid, resolve, ProcessDataFlag.None);
    });
    return (processes || []).map(c => { return { command: c.name, pid: c.pid }; });
}

function isRunning(pid: number): boolean {
    try {
        // https://nodejs.org/api/process.html#process_process_kill_pid_signal
        // This method will throw an error if the target pid does not exist. As a special case, a signal of 0 can be used to test for the existence of a process.
        // Even though the name of this function is process.kill(), it is really just a signal sender, like the kill system call.
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}
