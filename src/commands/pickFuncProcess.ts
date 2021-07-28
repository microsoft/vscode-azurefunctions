/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, RequestPrepareOptions } from '@azure/ms-rest-js';
import * as unixPsTree from 'ps-tree';
import * as vscode from 'vscode';
import { IActionContext, sendRequestWithTimeout, UserCancelledError } from 'vscode-azureextensionui';
import { hostStartTaskName } from '../constants';
import { IPreDebugValidateResult, preDebugValidate } from '../debug/validatePreDebug';
import { ext } from '../extensionVariables';
import { getFuncPortFromTaskOrProject, IRunningFuncTask, isFuncHostTask, runningFuncTaskMap, stopFuncTaskIfRunning } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';
import { delay } from '../utils/delay';
import { requestUtils } from '../utils/requestUtils';
import { taskUtils } from '../utils/taskUtils';
import { getWindowsProcessTree, IProcessInfo, IWindowsProcessTree, ProcessDataFlag } from '../utils/windowsProcessTree';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

const funcTaskReadyEmitter = new vscode.EventEmitter<vscode.WorkspaceFolder>();
export const onDotnetFuncTaskReady = funcTaskReadyEmitter.event;

export async function pickFuncProcess(context: IActionContext, debugConfig: vscode.DebugConfiguration): Promise<string | undefined> {
    const result: IPreDebugValidateResult = await preDebugValidate(context, debugConfig);
    if (!result.shouldContinue) {
        throw new UserCancelledError('preDebugValidate');
    }

    await waitForPrevFuncTaskToStop(result.workspace);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const preLaunchTaskName: string | undefined = debugConfig.preLaunchTask;
    const tasks: vscode.Task[] = await vscode.tasks.fetchTasks();
    const funcTask: vscode.Task | undefined = tasks.find(t => {
        return t.scope === result.workspace && (preLaunchTaskName ? t.name === preLaunchTaskName : isFuncHostTask(t));
    });

    if (!funcTask) {
        throw new Error(localize('noFuncTask', 'Failed to find "{0}" task.', preLaunchTaskName || hostStartTaskName));
    }

    const taskInfo = await startFuncTask(context, result.workspace, funcTask);
    return await pickChildProcess(taskInfo);
}

async function waitForPrevFuncTaskToStop(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    stopFuncTaskIfRunning(workspaceFolder);

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

async function startFuncTask(context: IActionContext, workspaceFolder: vscode.WorkspaceFolder, funcTask: vscode.Task): Promise<IRunningFuncTask> {
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
        const statusRequest: RequestPrepareOptions = { url: `http://localhost:${funcPort}/admin/host/status`, method: 'GET' };
        let statusRequestTimeout: number = intervalMs;
        const maxTime: number = Date.now() + timeoutInSeconds * 1000;
        while (Date.now() < maxTime) {
            if (taskError !== undefined) {
                throw taskError;
            }

            const taskInfo: IRunningFuncTask | undefined = runningFuncTaskMap.get(workspaceFolder);
            if (taskInfo) {
                try {
                    // wait for status url to indicate functions host is running
                    const response: HttpOperationResponse = await sendRequestWithTimeout(statusRequest, statusRequestTimeout);
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

            await delay(intervalMs);
        }

        throw new Error(localize('failedToFindFuncHost', 'Failed to detect running Functions host within "{0}" seconds. You may want to adjust the "{1}" setting.', timeoutInSeconds, `${ext.prefix}.${settingKey}`));
    } finally {
        errorListener.dispose();
    }
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
        unixPsTree(pid, (error: Error | undefined, result: unixPsTree.PS[]) => {
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
