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
import { createVirtualEnviornment, funcEnvName, runPythonCommandInVenv } from './PythonProjectCreator';

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

                    const projectLanguage: string | undefined = getFuncExtensionSetting(projectLanguageSetting, folderPath);
                    actionContext.properties.projectLanguage = String(projectLanguage);
                    await verifyDebugConfigIsValid(projectLanguage, folderPath, actionContext);
                    await verifyPythonVenv(projectLanguage, folderPath, actionContext);
                } else {
                    actionContext.properties.isInitialized = 'false';
                    if (await promptToInitializeProject(ui, folderPath)) {
                        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: localize('creating', 'Initializing project...') }, async () => {
                            await initProjectForVSCode(actionContext, ui, outputChannel, folderPath);
                        });
                        // don't wait
                        vscode.window.showInformationMessage(localize('finishedInit', 'Finished initializing project.'));
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
async function verifyDebugConfigIsValid(projectLanguage: string | undefined, folderPath: string, actionContext: IActionContext): Promise<void> {
    if (projectLanguage === ProjectLanguage.JavaScript) {
        const localProjectRuntime: ProjectRuntime | undefined = await tryGetLocalRuntimeVersion();
        if (localProjectRuntime === ProjectRuntime.v2) {
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

async function verifyPythonVenv(projectLanguage: string | undefined, folderPath: string, actionContext: IActionContext): Promise<void> {
    if (projectLanguage === ProjectLanguage.Python) {
        if (!await fse.pathExists(path.join(folderPath, funcEnvName))) {
            actionContext.properties.pythonVenvExists = 'false';

            const settingKey: string = 'showPythonVenvWarning';
            if (getFuncExtensionSetting<boolean>(settingKey)) {
                const createVenv: vscode.MessageItem = { title: localize('createVenv', 'Create virtual environment') };
                const message: string = localize('uninitializedWarning', 'Failed to find Python virtual environment, which is required to debug and deploy your Azure Functions project.');
                const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, createVenv, DialogResponses.dontWarnAgain);
                if (result === createVenv) {
                    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: localize('creatingVenv', 'Creating virtual environment...') }, async () => {
                        // create venv
                        await createVirtualEnviornment(folderPath);
                        // install venv requirements
                        const requirementsFileName: string = 'requirements.txt';
                        if (await fse.pathExists(path.join(folderPath, requirementsFileName))) {
                            await runPythonCommandInVenv(folderPath, `pip install -r ${requirementsFileName}`);
                        }
                    });

                    actionContext.properties.createdPythonVenv = 'true';
                    // don't wait
                    vscode.window.showInformationMessage(localize('finishedCreatingVenv', 'Finished creating virtual environment.'));
                } else if (result === DialogResponses.dontWarnAgain) {
                    await updateGlobalSetting(settingKey, false);
                }
            }
        }
    }
}
