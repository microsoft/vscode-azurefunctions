/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
// tslint:disable-next-line:no-require-imports
import opn = require("opn");
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext, IAzureUserInput } from 'vscode-azureextensionui';
import { gitignoreFileName, hostFileName, localSettingsFileName, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, tasksFileName, vscodeFolderName } from '../../constants';
import { ext } from '../../extensionVariables';
import { tryGetLocalRuntimeVersion } from '../../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from '../../localize';
import { getFuncExtensionSetting, updateGlobalSetting, updateWorkspaceSetting } from '../../ProjectSettings';
import * as fsUtil from '../../utils/fs';
import { initProjectForVSCode } from './initProjectForVSCode';
import { funcHostTaskId } from './IProjectCreator';
import { ITask, ITasksJson } from './ITasksJson';
import { funcNodeDebugArgs, funcNodeDebugEnvVar } from './JavaScriptProjectCreator';

export async function validateFunctionProjects(actionContext: IActionContext, ui: IAzureUserInput, outputChannel: vscode.OutputChannel, folders: vscode.WorkspaceFolder[] | undefined): Promise<void> {
    actionContext.suppressTelemetry = true;
    if (folders) {
        for (const folder of folders) {
            const folderPath: string = folder.uri.fsPath;
            if (await isFunctionProject(folderPath)) {
                actionContext.suppressTelemetry = false;

                if (isInitializedProject(folderPath)) {
                    actionContext.properties.isInitialized = 'true';
                    actionContext.suppressErrorDisplay = true; // Swallow errors when verifying debug config. No point in showing an error if we can't understand the project anyways
                    await verifyDebugConfigIsValid(folderPath, actionContext);
                } else {
                    actionContext.properties.isInitialized = 'false';
                    if (await promptToInitializeProject(ui, folderPath)) {
                        await initProjectForVSCode(actionContext, ui, outputChannel, folderPath);
                    }
                }
            }
        }
    }
}

async function promptToInitializeProject(ui: IAzureUserInput, folderPath: string): Promise<boolean> {
    const settingKey: string = 'showProjectWarning';
    if (getFuncExtensionSetting<boolean>(settingKey)) {
        const message: string = localize('uninitializedWarning', 'Detected an Azure Functions Project in folder "{0}" that may have been created outside of VS Code. Initialize for optimal use with VS Code?', path.basename(folderPath));
        const result: vscode.MessageItem = await ui.showWarningMessage(message, DialogResponses.yes, DialogResponses.dontWarnAgain, DialogResponses.learnMore);
        if (result === DialogResponses.dontWarnAgain) {
            await updateGlobalSetting(settingKey, false);
        } else if (result === DialogResponses.learnMore) {
            await opn('https://aka.ms/azFuncProject');
            return await promptToInitializeProject(ui, folderPath);
        } else {
            return true;
        }
    }

    return false;
}

export async function isFunctionProject(folderPath: string): Promise<boolean> {
    const gitignorePath: string = path.join(folderPath, gitignoreFileName);
    let gitignoreContents: string = '';
    if (await fse.pathExists(gitignorePath)) {
        gitignoreContents = (await fse.readFile(gitignorePath)).toString();
    }

    return await fse.pathExists(path.join(folderPath, hostFileName)) && (await fse.pathExists(path.join(folderPath, localSettingsFileName)) || gitignoreContents.includes(localSettingsFileName));
}

function isInitializedProject(folderPath: string): boolean {
    const language: string | undefined = getFuncExtensionSetting(projectLanguageSetting, folderPath);
    const runtime: string | undefined = getFuncExtensionSetting(projectRuntimeSetting, folderPath);
    return !!language && !!runtime;
}

/**
 * JavaScript debugging in the func cli had breaking changes in v2.0.1-beta.30. This verifies users are up-to-date with the latest working debug config.
 * See https://aka.ms/AA1vrxa for more info
 */
async function verifyDebugConfigIsValid(folderPath: string, actionContext: IActionContext): Promise<void> {
    const language: string | undefined = getFuncExtensionSetting(projectLanguageSetting, folderPath);
    if (language === ProjectLanguage.JavaScript) {
        const localProjectRuntime: ProjectRuntime | undefined = await tryGetLocalRuntimeVersion();
        if (localProjectRuntime === ProjectRuntime.beta) {
            const tasksJsonPath: string = path.join(folderPath, vscodeFolderName, tasksFileName);
            const rawTasksData: string = (await fse.readFile(tasksJsonPath)).toString();

            if (!rawTasksData.includes(funcNodeDebugEnvVar)) {
                const tasksContent: ITasksJson = <ITasksJson>JSON.parse(rawTasksData);

                const funcTask: ITask | undefined = tasksContent.tasks.find((t: ITask) => t.identifier === funcHostTaskId);
                if (funcTask) {
                    actionContext.properties.debugConfigValid = 'false';

                    if (await promptToUpdateDebugConfiguration(folderPath)) {
                        // tslint:disable-next-line:strict-boolean-expressions
                        funcTask.options = funcTask.options || {};
                        // tslint:disable-next-line:strict-boolean-expressions
                        funcTask.options.env = funcTask.options.env || {};
                        funcTask.options.env[funcNodeDebugEnvVar] = funcNodeDebugArgs;
                        await fsUtil.writeFormattedJson(tasksJsonPath, tasksContent);

                        actionContext.properties.updatedDebugConfig = 'true';

                        const viewFile: vscode.MessageItem = { title: 'View file' };
                        const result: vscode.MessageItem | undefined = await vscode.window.showInformationMessage(localize('tasksUpdated', 'Your "tasks.json" file has been updated.'), viewFile);
                        if (result === viewFile) {
                            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(tasksJsonPath)));
                        }
                    }
                }
            }
        }
    }
}

async function promptToUpdateDebugConfiguration(fsPath: string): Promise<boolean> {
    const settingKey: string = 'showDebugConfigWarning';
    if (getFuncExtensionSetting<boolean>(settingKey)) {
        const updateConfig: vscode.MessageItem = { title: localize('updateTasks', 'Update tasks.json') };
        const message: string = localize('uninitializedWarning', 'Your debug configuration is out of date and may not work with the latest version of the Azure Functions Core Tools.');
        let result: vscode.MessageItem;
        do {
            result = await ext.ui.showWarningMessage(message, updateConfig, DialogResponses.dontWarnAgain, DialogResponses.learnMore);
            if (result === DialogResponses.dontWarnAgain) {
                await updateWorkspaceSetting(settingKey, false, fsPath);
            } else if (result === DialogResponses.learnMore) {
                // don't wait to re-show dialog
                // tslint:disable-next-line:no-floating-promises
                opn('https://aka.ms/AA1vrxa');
            } else {
                return true;
            }
        } while (result === DialogResponses.learnMore);
    }

    return false;
}
