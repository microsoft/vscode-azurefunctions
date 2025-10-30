/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sendRequestWithTimeout, type AzExtRequestPrepareOptions } from '@microsoft/vscode-azext-azureutils';
import { callWithTelemetryAndErrorHandling, parseError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as unixPsTree from 'ps-tree';
import * as vscode from 'vscode';
import { hostStartTaskName } from '../constants';
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
// flag used by func core tools to indicate to wait for the debugger to attach before starting the worker
const dotnetIsolatedDebugFlag = '--dotnet-isolated-debug';
const enableJsonOutput = '--enable-json-output';

export async function startFuncProcessFromApi(
    buildPath: string,
    args: string[],
    env: { [key: string]: string }
): Promise<{ processId: string; success: boolean; error: string, stream: AsyncIterable<string> | undefined }> {
    const result: {
        processId: string;
        success: boolean;
        error: string;
        stream: AsyncIterable<string> | undefined;
    } = {
        processId: '',
        success: false,
        error: '',
        stream: undefined
    };

    let funcHostStartCmd: string = 'func host start';
    if (args) {
        funcHostStartCmd += ` ${args.join(' ')}`;
    }

    await callWithTelemetryAndErrorHandling('azureFunctions.api.startFuncProcess', async (context: IActionContext) => {
        try {
            let workspaceFolder: vscode.WorkspaceFolder | undefined = buildPathToWorkspaceFolderMap.get(buildPath);

            if (workspaceFolder === undefined) {
                workspaceFolder = {
                    uri: vscode.Uri.parse(buildPath),
                    name: buildPath,
                    index: -1
                }
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

    return result
}

export async function pickFuncProcess(context: IActionContext, debugConfig: vscode.DebugConfiguration): Promise<string | undefined> {
    const result: IPreDebugValidateResult = await preDebugValidate(context, debugConfig);
    if (!result.shouldContinue) {
        throw new UserCancelledError('preDebugValidate');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    const taskInfo = await startFuncTask(context, result.workspace, buildPath, funcTask);
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
        const funcShellExecution = funcTask.execution as vscode.ShellExecution;
        const debugModeOn = funcShellExecution.commandLine?.includes(dotnetIsolatedDebugFlag) && funcShellExecution.commandLine?.includes(enableJsonOutput);

        while (Date.now() < maxTime) {
            if (taskError !== undefined) {
                throw taskError;
            }

            const taskInfo: IRunningFuncTask | undefined = runningFuncTaskMap.get(workspaceFolder, buildPath);
            if (taskInfo) {
                if (debugModeOn) {
                    // if we are in dotnet isolated debug mode, we need to find the pid from the terminal output
                    // if there is no pid yet, keep waiting
                    const newPid = await setEventPidByJsonOutput(taskInfo);
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
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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

async function setEventPidByJsonOutput(taskInfo: IRunningFuncTask): Promise<number | undefined> {
    // if there is no stream yet or if the output doesn't include the workerProcessId yet, then keep waiting
    if (!taskInfo.stream) {
        return;
    }

    for await (const chunk of taskInfo.stream) {
        if (chunk.includes(`{ "name":"dotnet-worker-startup", "workerProcessId" :`)) {
            const matches = chunk.match(/"workerProcessId"\s*:\s*(\d+)/);
            if (matches && matches.length > 1) {
                return Number(matches[1]);
            }
        }
    }
    return;
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
        const terminalPid = await vscode.window.activeTerminal.processId
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
type ActualUnixPS = unixPsTree.PS & { COMM?: string };

async function getUnixChildren(pid: number): Promise<OSAgnosticProcess[]> {
    const processes: ActualUnixPS[] = await new Promise((resolve, reject): void => {
        unixPsTree(pid, (error: Error | null, result: unixPsTree.PS[]) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
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
