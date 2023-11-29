/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, type IActionContext } from '@microsoft/vscode-azext-utils';
import type * as vscode from 'vscode';
import { deploySubpathSetting, type ProjectLanguage } from '../constants';
import { localize } from '../localize';
import { dotnetUtils } from '../utils/dotnetUtils';
import { getWorkspaceSetting, updateWorkspaceSetting } from './settings';
import { getTasks, updateTasks, type ITask } from './tasks';

export async function verifyTargetFramework(projectLanguage: ProjectLanguage, folder: vscode.WorkspaceFolder, projectPath: string, context: IActionContext): Promise<void> {
    const settingKey: string = 'showTargetFrameworkWarning';
    if (getWorkspaceSetting<boolean>(settingKey)) {

        const projFiles: dotnetUtils.ProjectFile[] = await dotnetUtils.getProjFiles(context, projectLanguage, projectPath);
        if (projFiles.length === 1) {

            let targetFramework: string;
            try {
                targetFramework = await dotnetUtils.getTargetFramework(projFiles[0]);
            } catch {
                // ignore
                return;
            }

            const tasksResult: IVerifyFrameworkResult | undefined = verifyTasksFramework(folder, targetFramework);
            const settingsResult: IVerifyFrameworkResult | undefined = verifySettingsFramework(folder.uri.fsPath, targetFramework);

            const mismatchTargetFramework: string | undefined = (tasksResult && tasksResult.mismatchTargetFramework) || (settingsResult && settingsResult.mismatchTargetFramework);
            if (mismatchTargetFramework) {
                context.telemetry.properties.verifyConfigPrompt = 'updateTargetFramework';

                // This won't handle the case where there are multiple different target frameworks, but it's good enough for the message
                const message: string = localize('mismatchTargetFramework', 'The targetFramework "{0}" in your project file does not match the targetFramework "{1}" in your VS Code config.', targetFramework, mismatchTargetFramework);
                const update: vscode.MessageItem = { title: localize('updateTargetFramework', 'Update VS Code config') };

                const result: vscode.MessageItem = await context.ui.showWarningMessage(message, update, DialogResponses.dontWarnAgain);
                if (result === DialogResponses.dontWarnAgain) {
                    context.telemetry.properties.verifyConfigResult = 'dontWarnAgain';
                    await updateWorkspaceSetting(settingKey, false, folder);
                } else if (result === update) {
                    context.telemetry.properties.verifyConfigResult = 'update';
                    if (tasksResult) {
                        await tasksResult.update();
                    }

                    if (settingsResult) {
                        await settingsResult.update();
                    }
                }
            }
        }
    } else {
        context.telemetry.properties.verifyConfigResult = 'suppressed';
    }
}

interface IVerifyFrameworkResult {
    mismatchTargetFramework: string;
    update(): Promise<void>;
}

// https://docs.microsoft.com/dotnet/standard/frameworks
const targetFrameworkRegExp: RegExp = /net(standard|coreapp)?[0-9.]+/i;

function verifyTasksFramework(folder: vscode.WorkspaceFolder, projTargetFramework: string): IVerifyFrameworkResult | undefined {
    let mismatchTargetFramework: string | undefined;

    const tasks: ITask[] = getTasks(folder);
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
                await updateTasks(folder, tasks);
            }
        };
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
