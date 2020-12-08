/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceClient, WebResource } from '@azure/ms-rest-js';
import * as unixPsTree from 'ps-tree';
import * as vscode from 'vscode';
import { createGenericClient, IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { hostStartTaskName } from '../constants';
import { IPreDebugValidateResult, preDebugValidate } from '../debug/validatePreDebug';
import { ext } from '../extensionVariables';
import { IRunningFuncTask, isFuncHostTask, runningFuncTaskMap } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';
import { delay } from '../utils/delay';
import { getWindowsProcessTree, IProcessTreeNode, IWindowsProcessTree } from '../utils/windowsProcessTree';
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
    return process.platform === 'win32' ? await getInnermostWindowsPid(pid) : await getInnermostUnixPid(pid);
}

async function waitForPrevFuncTaskToStop(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
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
        await vscode.tasks.executeTask(funcTask);

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
                    await client.sendRequest(statusRequest);
                    return taskInfo.processId.toString();
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

/**
 * Gets the innermost child pid for a unix process. This is only really necessary if the user installs 'func' with a tool like 'npm', which uses a wrapper around the main func exe
 */
async function getInnermostUnixPid(pid: string): Promise<string> {
    return await new Promise<string>((resolve: (pid: string) => void, reject: (e: Error) => void): void => {
        unixPsTree(parseInt(pid), (error: Error | undefined, children: unixPsTree.PS[]) => {
            if (error) {
                reject(error);
            } else {
                const child: unixPsTree.PS | undefined = children.pop();
                resolve(child ? child.PID : pid);
            }
        });
    });
}

/**
 * Gets the innermost child pid for a Windows process. This is almost always necessary since the original pid is associated with the parent PowerShell process.
 */
async function getInnermostWindowsPid(pid: string): Promise<string> {
    const windowsProcessTree: IWindowsProcessTree = getWindowsProcessTree();
    let psTree: IProcessTreeNode | undefined = await new Promise<IProcessTreeNode | undefined>((resolve: (p: IProcessTreeNode | undefined) => void): void => {
        windowsProcessTree.getProcessTree(Number(pid), resolve);
    });

    if (!psTree) {
        throw new Error(localize('funcTaskStopped', 'Functions host is no longer running.'));
    }

    while (psTree.children.length > 0) {
        psTree = psTree.children[0];
    }

    return psTree.pid.toString();
}
