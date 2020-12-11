/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, ServiceClient, WebResource } from '@azure/ms-rest-js';
import * as unixPsTree from 'ps-tree';
import * as vscode from 'vscode';
import { createGenericClient, IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { hostStartTaskName } from '../constants';
import { IPreDebugValidateResult, preDebugValidate } from '../debug/validatePreDebug';
import { ext } from '../extensionVariables';
import { failedFuncExecutionMap, IRunningFuncTask, isFuncHostTask, runningFuncTaskMap, stopFuncTaskIfRunning } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';
import { delay } from '../utils/delay';
import { taskUtils } from '../utils/taskUtils';
import { getWindowsProcessTree, IProcessInfo, IWindowsProcessTree, ProcessDataFlag } from '../utils/windowsProcessTree';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

export async function pickFuncProcess(context: IActionContext, debugConfig: vscode.DebugConfiguration): Promise<string | undefined> {
    const result: IPreDebugValidateResult = await preDebugValidate(context, debugConfig);
    if (!result.shouldContinue) {
        throw new UserCancelledError();
    }

    await waitForPrevFuncTaskToStop(result.workspace);

    // tslint:disable-next-line: no-unsafe-any
    const preLaunchTaskName: string | undefined = debugConfig.preLaunchTask;
    const tasks: vscode.Task[] = await vscode.tasks.fetchTasks();
    const funcTask: vscode.Task | undefined = tasks.find(t => {
        return t.scope === result.workspace && (preLaunchTaskName ? t.name === preLaunchTaskName : isFuncHostTask(t));
    });

    if (!funcTask) {
        throw new Error(localize('noFuncTask', 'Failed to find "{0}" task.', preLaunchTaskName || hostStartTaskName));
    }

    const pid: string = await startFuncTask(context, result.workspace, funcTask);
    return await pickChildProcess(pid);
}

async function waitForPrevFuncTaskToStop(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    await stopFuncTaskIfRunning(workspaceFolder);

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

async function startFuncTask(context: IActionContext, workspaceFolder: vscode.WorkspaceFolder, funcTask: vscode.Task): Promise<string> {
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
        // NOTE: Can't use taskUtils.executeIfNotActive because of this issue: https://github.com/microsoft/vscode/issues/112247
        // The "IfNotActive" part helps when the user starts, stops and restarts debugging quickly in succession. We want to use the already-active task to avoid two func tasks causing a port conflict error
        // The most common case we hit this is if the "clean" or "build" task is running when we get here. It's unlikely the "func host start" task is active, since we would've stopped it in `waitForPrevFuncTaskToStop` above
        if (!vscode.tasks.taskExecutions.find(t => taskUtils.isTaskEqual(t.task, funcTask) && !failedFuncExecutionMap.get(workspaceFolder))) {
            await vscode.tasks.executeTask(funcTask);
        }

        const intervalMs: number = 500;
        const client: ServiceClient = await createGenericClient();
        const statusRequest: WebResource = getStatusRequest(funcTask, intervalMs);
        const maxTime: number = Date.now() + timeoutInSeconds * 1000;
        while (Date.now() < maxTime) {
            if (taskError !== undefined) {
                throw taskError;
            }

            const taskInfo: IRunningFuncTask | undefined = runningFuncTaskMap.get(workspaceFolder);
            if (taskInfo) {
                try {
                    // wait for status url to indicate functions host is running
                    const response: HttpOperationResponse = await client.sendRequest(statusRequest);
                    // tslint:disable-next-line: no-unsafe-any
                    if (response.parsedBody.state.toLowerCase() === 'running') {
                        return taskInfo.processId.toString();
                    }
                } catch {
                    // ignore
                }
            }

            await delay(intervalMs);
        }

        throw new Error(localize('failedToFindFuncHost', 'Failed to detect running Functions host within "{0}" seconds. You may want to adjust the "{1}" setting.', timeoutInSeconds, `${ext.prefix}.${settingKey}`));
    } finally {
        errorListener.dispose();
    }
}

function getStatusRequest(funcTask: vscode.Task, intervalMs: number): WebResource {
    let port: string = '7071';
    if (typeof funcTask.definition.command === 'string') {
        const match: RegExpMatchArray | null = funcTask.definition.command.match(/\s+(?:"|'|)(?:-p|--port)(?:"|'|)\s+(?:"|'|)([0-9]+)/i);
        if (match) {
            port = match[1];
        }
    }

    let request: WebResource = new WebResource();
    request = request.prepare({ url: `http://localhost:${port}/admin/host/status`, method: 'GET' });
    request.timeout = intervalMs;
    return request;
}

type OSAgnosticProcess = { command: string | undefined; pid: number | string };

/**
 * Picks the child process that we want to use. Scenarios to keep in mind:
 * 1. On Windows, the rootPid is almost always the parent PowerShell process
 * 2. On Unix, the rootPid may be a wrapper around the main func exe if installed with npm
 * 3. Starting with the .NET 5 worker, Windows sometimes has an inner process we _don't_ want like 'conhost.exe'
 * The only processes we should want to attach to are the "func" process itself or a "dotnet" process running a dll, so we will pick the innermost one of those
 */
async function pickChildProcess(rootPid: string): Promise<string> {
    const children: OSAgnosticProcess[] = process.platform === 'win32' ? await getWindowsChildren(rootPid) : await getUnixChildren(rootPid);
    // tslint:disable-next-line: strict-boolean-expressions
    const child: OSAgnosticProcess | undefined = children.reverse().find(c => /(dotnet|func)(\.exe|)$/i.test(c.command || ''));
    return child ? child.pid.toString() : rootPid;
}

// Looks like this bug was fixed, but never merged:
// https://github.com/indexzero/ps-tree/issues/18
type ActualUnixPS = unixPsTree.PS & { COMM?: string };

async function getUnixChildren(pid: string): Promise<OSAgnosticProcess[]> {
    const processes: ActualUnixPS[] = await new Promise((resolve, reject): void => {
        unixPsTree(parseInt(pid), (error: Error | undefined, result: unixPsTree.PS[]) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
    return processes.map(c => { return { command: c.COMMAND || c.COMM, pid: c.PID }; });
}

async function getWindowsChildren(pid: string): Promise<OSAgnosticProcess[]> {
    const windowsProcessTree: IWindowsProcessTree = getWindowsProcessTree();
    const processes: IProcessInfo[] = await new Promise((resolve): void => {
        windowsProcessTree.getProcessList(Number(pid), resolve, ProcessDataFlag.None);
    });
    return processes.map(c => { return { command: c.name, pid: c.pid }; });
}
