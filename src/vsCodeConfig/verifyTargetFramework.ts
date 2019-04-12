/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { tryGetCsprojFile, tryGetFsprojFile, tryGetTargetFramework } from '../commands/initProjectForVSCode/InitVSCodeStep/DotnetInitVSCodeStep';
import { deploySubpathSetting, ProjectLanguage } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { ITask } from './ITask';
import { getWorkspaceSetting, updateWorkspaceSetting } from './settings';

export async function verifyTargetFramework(projectLanguage: ProjectLanguage, workspacePath: string, projectPath: string, actionContext: IActionContext): Promise<void> {
    const settingKey: string = 'showTargetFrameworkWarning';
    if (getWorkspaceSetting<boolean>(settingKey)) {

        const projFileName: string | undefined = projectLanguage === ProjectLanguage.CSharp ? await tryGetCsprojFile(projectPath) : await tryGetFsprojFile(projectPath);
        if (projFileName) {

            const targetFramework: string | undefined = await tryGetTargetFramework(path.join(projectPath, projFileName));
            if (targetFramework) {

                const tasksResult: IVerifyFrameworkResult | undefined = verifyTasksFramework(workspacePath, targetFramework);
                const settingsResult: IVerifyFrameworkResult | undefined = verifySettingsFramework(workspacePath, targetFramework);

                const mismatchTargetFramework: string | undefined = (tasksResult && tasksResult.mismatchTargetFramework) || (settingsResult && settingsResult.mismatchTargetFramework);
                if (mismatchTargetFramework) {
                    actionContext.properties.verifyConfigPrompt = 'updateTargetFramework';

                    // This won't handle the case where there are multiple different target frameworks, but it's good enough for the message
                    const message: string = localize('mismatchTargetFramework', 'The targetFramework "{0}" in your project file does not match the targetFramework "{1}" in your VS Code config.', targetFramework, mismatchTargetFramework);
                    const update: vscode.MessageItem = { title: localize('updateTargetFramework', 'Update VS Code config') };

                    const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, update, DialogResponses.dontWarnAgain);
                    if (result === DialogResponses.dontWarnAgain) {
                        actionContext.properties.verifyConfigResult = 'dontWarnAgain';
                        await updateWorkspaceSetting(settingKey, false, workspacePath);
                    } else if (result === update) {
                        actionContext.properties.verifyConfigResult = 'update';
                        if (tasksResult) {
                            await tasksResult.update();
                        }

                        if (settingsResult) {
                            await settingsResult.update();
                        }
                    }
                }
            }
        }
    } else {
        actionContext.properties.verifyConfigResult = 'suppressed';
    }
}

interface IVerifyFrameworkResult {
    mismatchTargetFramework: string;
    update(): Promise<void>;
}

// https://docs.microsoft.com/dotnet/standard/frameworks
const targetFrameworkRegExp: RegExp = /net(standard|coreapp)?[0-9.]+/i;

function verifyTasksFramework(workspacePath: string, projTargetFramework: string): IVerifyFrameworkResult | undefined {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('tasks', vscode.Uri.file(workspacePath));
    const tasks: ITask[] | undefined = config.get<ITask[]>('tasks');
    if (tasks) {
        let mismatchTargetFramework: string | undefined;

        for (const task of tasks) {
            if (task.options && task.options.cwd) {
                const matches: RegExpMatchArray | null = task.options.cwd.match(targetFrameworkRegExp);
                const targetFramework: string | null = matches && matches[0];
                if (targetFramework && targetFramework.toLowerCase() !== projTargetFramework.toLowerCase()) {
                    mismatchTargetFramework = targetFramework;
                    task.options.cwd = task.options.cwd.replace(targetFramework, projTargetFramework);
                }
            }
        }

        if (mismatchTargetFramework) {
            return {
                mismatchTargetFramework,
                update: async (): Promise<void> => {
                    config.update('tasks', tasks);
                }
            };
        }
    }

    return undefined;
}

function verifySettingsFramework(workspacePath: string, projTargetFramework: string): IVerifyFrameworkResult | undefined {
    let deploySubPath: string | undefined = getWorkspaceSetting(deploySubpathSetting, workspacePath);
    if (deploySubPath) {
        const matches: RegExpMatchArray | null = deploySubPath.match(targetFrameworkRegExp);
        const targetFramework: string | null = matches && matches[0];
        if (targetFramework && targetFramework.toLowerCase() !== projTargetFramework.toLowerCase()) {
            deploySubPath = deploySubPath.replace(targetFramework, projTargetFramework);
            return {
                mismatchTargetFramework: targetFramework,
                update: async (): Promise<void> => {
                    await updateWorkspaceSetting(deploySubpathSetting, deploySubPath, workspacePath);
                }
            };
        }
    }

    return undefined;
}
