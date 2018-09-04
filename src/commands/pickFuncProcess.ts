/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Task, TaskExecution } from 'vscode';
import { IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { extensionPrefix, isWindows } from '../constants';
import { validateFuncCoreToolsInstalled } from '../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../localize';
import { getFuncExtensionSetting } from '../ProjectSettings';
import { tryFetchNodeModule } from '../utils/tryFetchNodeModule';
import { funcHostTaskLabel } from './createNewProject/IProjectCreator';

export async function pickFuncProcess(actionContext: IActionContext): Promise<string | undefined> {
    if (!await validateFuncCoreToolsInstalled(true /* forcePrompt */)) {
        throw new UserCancelledError();
    }

    // Stop any running func task so that a build can access those dlls
    await stopFuncTaskIfRunning();

    const tasks: Task[] = await vscode.tasks.fetchTasks();
    const funcTask: Task | undefined = tasks.find(isFuncTask);
    if (!funcTask) {
        throw new Error(localize('noFuncTask', 'Failed to find task with label "{0}".', funcHostTaskLabel));
    }

    const pid: string = await startFuncTask(funcTask, actionContext);
    // On Mac/Linux we can leverage the pid of the task directly.
    // On Windows, the pid of the task corresponds to the parent PowerShell process and we have to drill down to get the actual func process
    return isWindows ? await getInnermostWindowsPid(pid) : pid;
}

function isFuncTask(task: Task): boolean {
    // Until this is fixed, we have to query the task's name instead of id: https://github.com/Microsoft/vscode/issues/57707
    return task.name.toLowerCase() === funcHostTaskLabel.toLowerCase();
}

async function stopFuncTaskIfRunning(): Promise<void> {
    const funcExecution: TaskExecution | undefined = vscode.tasks.taskExecutions.find((te: TaskExecution) => isFuncTask(te.task));
    if (funcExecution) {
        const waitForEndPromise: Promise<void> = new Promise((resolve: () => void): void => {
            const listener: vscode.Disposable = vscode.tasks.onDidEndTask((e: vscode.TaskEndEvent) => {
                if (isFuncTask(e.execution.task)) {
                    resolve();
                    listener.dispose();
                }
            });
        });
        funcExecution.terminate();
        await waitForEndPromise;
    }
}

async function startFuncTask(funcTask: Task, actionContext: IActionContext): Promise<string> {
    const settingKey: string = 'pickProcessTimeout';
    const settingValue: number | undefined = getFuncExtensionSetting<number>(settingKey);
    const timeoutInSeconds: number = Number(settingValue);
    if (isNaN(timeoutInSeconds)) {
        throw new Error(localize('invalidSettingValue', 'The setting "{0}" must be a number, but instead found "{1}".', settingKey, settingValue));
    }
    actionContext.properties.timeoutInSeconds = timeoutInSeconds.toString();

    const waitForStartPromise: Promise<string> = new Promise((resolve: (pid: string) => void, reject: (e: Error) => void): void => {
        const listener: vscode.Disposable = vscode.tasks.onDidStartTaskProcess((e: vscode.TaskProcessStartEvent) => {
            if (isFuncTask(e.execution.task)) {
                resolve(e.processId.toString());
                listener.dispose();
            }
        });

        const errorListener: vscode.Disposable = vscode.tasks.onDidEndTaskProcess((e: vscode.TaskProcessEndEvent) => {
            if (e.exitCode !== 0) {
                // Throw if _any_ task fails, not just funcTask (since funcTask often depends on build/clean tasks)
                reject(new Error(localize('taskFailed', 'Failed to start debugging. Task "{0}" failed with exit code "{1}".', e.execution.task.name, e.exitCode)));
                errorListener.dispose();
            }
        });

        const timeoutError: Error = new Error(localize('failedToFindFuncHost', 'Failed to detect running Functions host within "{0}" seconds. You may want to adjust the "{1}" setting.', timeoutInSeconds, `${extensionPrefix}.${settingKey}`));
        setTimeout(() => { reject(timeoutError); }, timeoutInSeconds * 1000);
    });
    await vscode.tasks.executeTask(funcTask);
    return await waitForStartPromise;
}

async function getInnermostWindowsPid(pid: string): Promise<string> {
    const moduleName: string = 'windows-process-tree';
    const windowsProcessTree: IWindowsProcessTree | undefined = await tryFetchNodeModule<IWindowsProcessTree>(moduleName);
    if (!windowsProcessTree) {
        throw new Error(localize('noWindowsProcessTree', 'Failed to find dependency "{0}".', moduleName));
    }

    let psTree: IProcessTreeNode = await new Promise((resolve: (psTree: IProcessTreeNode) => void): void => {
        windowsProcessTree.getProcessTree(Number(pid), resolve);
    });
    while (psTree.children.length > 0) {
        psTree = psTree.children[0];
    }
    return psTree.pid.toString();
}

interface IProcessTreeNode {
    pid: number;
    name: string;
    memory?: number;
    commandLine?: string;
    children: IProcessTreeNode[];
}

interface IWindowsProcessTree {
    getProcessTree(rootPid: number, callback: (tree: IProcessTreeNode) => void): void;
}
