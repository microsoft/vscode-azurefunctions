/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as unixPsTree from 'ps-tree';
import * as vscode from 'vscode';
import { IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { extensionPrefix, funcHostStartCommand, isWindows } from '../constants';
import { IPreDebugValidateResult, preDebugValidate } from '../debug/validatePreDebug';
import { isFuncHostTask, stopFuncHost } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';
import { delay } from '../utils/delay';
import { getWindowsProcessTree, IProcessTreeNode, IWindowsProcessTree } from '../utils/windowsProcessTree';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

export async function pickFuncProcess(context: IActionContext, debugConfig: vscode.DebugConfiguration): Promise<string | undefined> {
    const result: IPreDebugValidateResult = await preDebugValidate(debugConfig);
    if (!result.shouldContinue) {
        throw new UserCancelledError();
    }

    await stopFuncHost(result.workspace);

    // tslint:disable-next-line: no-unsafe-any
    const preLaunchTaskName: string | undefined = debugConfig.preLaunchTask;
    const tasks: vscode.Task[] = await vscode.tasks.fetchTasks();
    const funcTask: vscode.Task | undefined = tasks.find(t => {
        return t.scope === result.workspace && (preLaunchTaskName ? t.name === preLaunchTaskName : isFuncHostTask(t));
    });

    if (!funcTask) {
        throw new Error(localize('noFuncTask', 'Failed to find "{0}" task.', preLaunchTaskName || funcHostStartCommand));
    }

    const settingKey: string = 'pickProcessTimeout';
    const settingValue: number | undefined = getWorkspaceSetting<number>(settingKey);
    const timeoutInSeconds: number = Number(settingValue);
    if (isNaN(timeoutInSeconds)) {
        throw new Error(localize('invalidSettingValue', 'The setting "{0}" must be a number, but instead found "{1}".', settingKey, settingValue));
    }
    context.telemetry.properties.timeoutInSeconds = timeoutInSeconds.toString();
    const timeoutError: Error = new Error(localize('failedToFindFuncHost', 'Failed to detect running Functions host within "{0}" seconds. You may want to adjust the "{1}" setting.', timeoutInSeconds, `${extensionPrefix}.${settingKey}`));

    const pid: string = await startFuncTask(funcTask, timeoutInSeconds, timeoutError);
    return isWindows ? await getInnermostWindowsPid(pid, timeoutInSeconds, timeoutError) : await getInnermostUnixPid(pid);
}

async function startFuncTask(funcTask: vscode.Task, timeoutInSeconds: number, timeoutError: Error): Promise<string> {
    const waitForStartPromise: Promise<string> = new Promise((resolve: (pid: string) => void, reject: (e: Error) => void): void => {
        const listener: vscode.Disposable = vscode.tasks.onDidStartTaskProcess((e: vscode.TaskProcessStartEvent) => {
            if (e.execution.task === funcTask) {
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
 * We also need to delay to make sure the func process has been started within the PowerShell process.
 */
async function getInnermostWindowsPid(pid: string, timeoutInSeconds: number, timeoutError: Error): Promise<string> {
    const windowsProcessTree: IWindowsProcessTree = getWindowsProcessTree();
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
