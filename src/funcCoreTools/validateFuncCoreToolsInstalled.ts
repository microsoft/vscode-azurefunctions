/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MessageItem, ShellExecution, Task, TaskRevealKind, tasks, TaskScope, WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { funcVersionSetting, PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { delay } from '../utils/delay';
import { openUrl } from '../utils/openUrl';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { getFuncPackageManagers } from './getFuncPackageManagers';
import { installFuncCoreTools } from './installFuncCoreTools';

export async function validateFuncCoreToolsInstalled(message: string, workspace: WorkspaceFolder): Promise<boolean> {
    let input: MessageItem | undefined;
    let installed: boolean = false;
    const install: MessageItem = { title: localize('install', 'Install') };

    await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsInstalled', async (context: IActionContext) => {
        context.errorHandling.suppressDisplay = true;

        if (await funcToolsInstalledInWorkspace(workspace)) {
            installed = true;
        } else {
            const items: MessageItem[] = [];
            const packageManagers: PackageManager[] = await getFuncPackageManagers(false /* isFuncInstalled */);
            if (packageManagers.length > 0) {
                items.push(install);
            } else {
                items.push(DialogResponses.learnMore);
            }

            // See issue: https://github.com/Microsoft/vscode-azurefunctions/issues/535
            input = await ext.ui.showWarningMessage(message, { modal: true }, ...items);

            context.telemetry.properties.dialogResult = input.title;

            if (input === install) {
                const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, workspace.uri.fsPath));
                await installFuncCoreTools(packageManagers, version);
                installed = true;
            } else if (input === DialogResponses.learnMore) {
                await openUrl('https://aka.ms/Dqur4e');
            }
        }
    });

    // validate that Func Tools was installed only if user confirmed
    if (input === install && !installed) {
        if (await ext.ui.showWarningMessage(localize('failedInstallFuncTools', 'The Azure Functions Core Tools installion has failed and will have to be installed manually.'), DialogResponses.learnMore) === DialogResponses.learnMore) {
            await openUrl('https://aka.ms/Dqur4e');
        }
    }

    return installed;
}

const versionArg: string = '--version';

export async function funcToolsInstalledInWorkspace(workspace: WorkspaceFolder | undefined): Promise<boolean> {
    const taskName: string = localize('validateFuncCli', 'Validate "func" installed');
    // tslint:disable-next-line: strict-boolean-expressions
    const task: Task = new Task({ type: 'shell' }, workspace || TaskScope.Workspace, taskName, 'func', new ShellExecution(ext.funcCliPath, [versionArg]));
    task.presentationOptions = { reveal: TaskRevealKind.Never, focus: false };

    let exitCode: number | undefined;
    let disposable: Disposable | undefined;

    try {
        const exitCodeTask: Promise<number> = new Promise((resolve): void => {
            disposable = tasks.onDidEndTaskProcess(e => {
                if (e.execution.task.name === taskName) {
                    exitCode = e.exitCode;
                    resolve();
                }
            });
        });

        await tasks.executeTask(task);

        await Promise.race([exitCodeTask, delay(3 * 1000)]);
    } finally {
        disposable?.dispose();
    }

    return exitCode === undefined || exitCode === 0;
}

export async function funcToolsInstalled(): Promise<boolean> {
    try {
        await cpUtils.executeCommand(undefined, undefined, ext.funcCliPath, versionArg);
        return true;
    } catch (error) {
        return false;
    }
}
