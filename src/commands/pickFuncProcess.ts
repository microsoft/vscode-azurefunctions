/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Task } from 'vscode';
import { IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { extensionPrefix, isWindows } from '../constants';
import { funcHostTaskLabel, stopFuncHostPromise } from "../funcCoreTools/funcHostTask";
import { isFuncHostTask } from '../funcCoreTools/funcHostTask';
import { validateFuncCoreToolsInstalled } from '../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../localize';
import { getFuncExtensionSetting } from '../ProjectSettings';
import { tryFetchNodeModule } from '../utils/tryFetchNodeModule';

export async function pickFuncProcess(actionContext: IActionContext): Promise<string | undefined> {
    if (!await validateFuncCoreToolsInstalled(true /* forcePrompt */)) {
        throw new UserCancelledError();
    }

    await stopFuncHostPromise;

    const tasks: Task[] = await vscode.tasks.fetchTasks();
    const funcTask: Task | undefined = tasks.find(isFuncHostTask);
    if (!funcTask) {
        throw new Error(localize('noFuncTask', 'Failed to find task with label "{0}".', funcHostTaskLabel));
    }

    const settingKey: string = 'pickProcessTimeout';
    const settingValue: number | undefined = getFuncExtensionSetting<number>(settingKey);
    const timeoutInSeconds: number = Number(settingValue);
    if (isNaN(timeoutInSeconds)) {
        throw new Error(localize('invalidSettingValue', 'The setting "{0}" must be a number, but instead found "{1}".', settingKey, settingValue));
    }
    actionContext.properties.timeoutInSeconds = timeoutInSeconds.toString();
    const timeoutError: Error = new Error(localize('failedToFindFuncHost', 'Failed to detect running Functions host within "{0}" seconds. You may want to adjust the "{1}" setting.', timeoutInSeconds, `${extensionPrefix}.${settingKey}`));

    const pid: string = await startFuncTask(funcTask, timeoutInSeconds, timeoutError);
    // On Mac/Linux we can leverage the pid of the task directly.
    // On Windows, the pid of the task corresponds to the parent PowerShell process and we have to drill down to get the actual func process
    return isWindows ? await getInnermostWindowsPid(pid, timeoutInSeconds, timeoutError) : pid;
}

async function startFuncTask(funcTask: Task, timeoutInSeconds: number, timeoutError: Error): Promise<string> {
    const waitForStartPromise: Promise<string> = new Promise((resolve: (pid: string) => void, reject: (e: Error) => void): void => {
        const listener: vscode.Disposable = vscode.tasks.onDidStartTaskProcess((e: vscode.TaskProcessStartEvent) => {
            if (isFuncHostTask(e.execution.task)) {
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

        setTimeout(() => { reject(timeoutError); }, timeoutInSeconds * 1000);
    });
    await vscode.tasks.executeTask(funcTask);
    return await waitForStartPromise;
}

async function getInnermostWindowsPid(pid: string, timeoutInSeconds: number, timeoutError: Error): Promise<string> {
    const moduleName: string = 'windows-process-tree';
    const windowsProcessTree: IWindowsProcessTree | undefined = await tryFetchNodeModule<IWindowsProcessTree>(moduleName);
    if (!windowsProcessTree) {
        throw new Error(localize('noWindowsProcessTree', 'Failed to find dependency "{0}".', moduleName));
    }

    const maxTime: number = Date.now() + timeoutInSeconds * 1000;
    while (Date.now() < maxTime) {
        let psTree: IProcessTreeNode | undefined = await new Promise<IProcessTreeNode | undefined>((resolve: (p: IProcessTreeNode | undefined) => void): void => {
            windowsProcessTree.getProcessTree(Number(pid), resolve);
        });

        if (!psTree) {
            throw new Error(localize('funcTaskStopped', 'Functions host is no longer running.'));
        }

        while (psTree.children.length > 0) {
            psTree = psTree.children[0];
        }

        if (psTree.name.toLowerCase().includes('func')) {
            return psTree.pid.toString();
        } else {
            await delay(500);
        }
    }

    throw timeoutError;
}

interface IProcessTreeNode {
    pid: number;
    name: string;
    memory?: number;
    commandLine?: string;
    children: IProcessTreeNode[];
}

interface IWindowsProcessTree {
    getProcessTree(rootPid: number, callback: (tree: IProcessTreeNode | undefined) => void): void;
}

async function delay(ms: number): Promise<void> {
    await new Promise<void>((resolve: () => void): NodeJS.Timer => setTimeout(resolve, ms));
}
