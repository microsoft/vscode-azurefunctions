/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
// tslint:disable-next-line:no-require-imports
import opn = require("opn");
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, tasksFileName, vscodeFolderName } from '../../constants';
import { ext } from '../../extensionVariables';
import { oldFuncHostNameRegEx } from "../../funcCoreTools/funcHostTask";
import { tryGetLocalRuntimeVersion } from '../../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from '../../localize';
import { getFuncExtensionSetting, updateGlobalSetting, updateWorkspaceSetting } from '../../ProjectSettings';
import { initProjectForVSCode } from './initProjectForVSCode';
import { isFunctionProject } from './isFunctionProject';
import { ITask, ITasksJson } from './ITasksJson';
import { createVirtualEnviornment, makeVenvDebuggable, pythonVenvSetting } from './PythonProjectCreator';

export async function validateFunctionProjects(actionContext: IActionContext, folders: vscode.WorkspaceFolder[] | undefined): Promise<void> {
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
                    actionContext.properties.projectLanguage = projectLanguage;
                    await verifyDebugConfigIsValid(projectLanguage, folderPath, actionContext);
                    await verifyPythonVenv(projectLanguage, folderPath, actionContext);
                } else {
                    actionContext.properties.isInitialized = 'false';
                    if (await promptToInitializeProject(folderPath)) {
                        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: localize('creating', 'Initializing project...') }, async () => {
                            await initProjectForVSCode(actionContext, folderPath);
                        });
                        // don't wait
                        vscode.window.showInformationMessage(localize('finishedInit', 'Finished initializing project.'));
                    }
                }
            }
        }
    }
}

async function promptToInitializeProject(folderPath: string): Promise<boolean> {
    const settingKey: string = 'showProjectWarning';
    if (getFuncExtensionSetting<boolean>(settingKey)) {
        const message: string = localize('uninitializedWarning', 'Detected an Azure Functions Project in folder "{0}" that may have been created outside of VS Code. Initialize for optimal use with VS Code?', path.basename(folderPath));
        const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, DialogResponses.yes, DialogResponses.dontWarnAgain, DialogResponses.learnMore);
        if (result === DialogResponses.dontWarnAgain) {
            await updateGlobalSetting(settingKey, false);
        } else if (result === DialogResponses.learnMore) {
            await opn('https://aka.ms/azFuncProject');
            return await promptToInitializeProject(folderPath);
        } else {
            return true;
        }
    }

    return false;
}

function isInitializedProject(folderPath: string): boolean {
    const language: string | undefined = getFuncExtensionSetting(projectLanguageSetting, folderPath);
    const runtime: string | undefined = getFuncExtensionSetting(projectRuntimeSetting, folderPath);
    return !!language && !!runtime;
}

/**
 * JavaScript debugging in the func cli had breaking changes in v2.0.1-beta.30 (~6/2018). This verifies users are up-to-date with the latest working debug config.
 * See https://aka.ms/AA1vrxa for more info
 */
async function verifyDebugConfigIsValid(projectLanguage: string | undefined, folderPath: string, actionContext: IActionContext): Promise<void> {
    if (projectLanguage === ProjectLanguage.JavaScript) {
        const localProjectRuntime: ProjectRuntime | undefined = await tryGetLocalRuntimeVersion();
        if (localProjectRuntime === ProjectRuntime.v2) {
            const tasksJsonPath: string = path.join(folderPath, vscodeFolderName, tasksFileName);
            const rawTasksData: string = (await fse.readFile(tasksJsonPath)).toString();

            const funcNodeDebugEnvVar: string = 'languageWorkers__node__arguments';
            const oldFuncNodeDebugEnvVar: string = funcNodeDebugEnvVar.replace(/__/g, ':'); // Also check against an old version of the env var that works in most (but not all) cases
            if (!rawTasksData.includes(funcNodeDebugEnvVar) && !rawTasksData.includes(oldFuncNodeDebugEnvVar)) {
                const tasksContent: ITasksJson = <ITasksJson>JSON.parse(rawTasksData);

                // NOTE: Only checking against oldFuncHostNameRegEx (where label looks like "runFunctionsHost")
                // If they're using the tasks our extension provides (where label looks like "func: host start"), they are already good-to-go
                const funcTask: ITask | undefined = tasksContent.tasks.find((t: ITask) => oldFuncHostNameRegEx.test(t.label));
                if (funcTask) {
                    actionContext.properties.debugConfigValid = 'false';

                    if (await promptToUpdateDebugConfiguration(folderPath)) {
                        await initProjectForVSCode(actionContext, folderPath, projectLanguage);
                        actionContext.properties.updatedDebugConfig = 'true';
                    }
                }
            }
        }
    }
}

async function promptToUpdateDebugConfiguration(fsPath: string): Promise<boolean> {
    const settingKey: string = 'showDebugConfigWarning';
    if (getFuncExtensionSetting<boolean>(settingKey)) {
        const updateConfig: vscode.MessageItem = { title: localize('reinit', 'Reinitialize Project') };
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
        const venvName: string | undefined = getFuncExtensionSetting(pythonVenvSetting, folderPath);
        if (venvName && !await fse.pathExists(path.join(folderPath, venvName))) {
            actionContext.properties.pythonVenvExists = 'false';

            const settingKey: string = 'showPythonVenvWarning';
            if (getFuncExtensionSetting<boolean>(settingKey)) {
                const createVenv: vscode.MessageItem = { title: localize('createVenv', 'Create virtual environment') };
                const message: string = localize('uninitializedWarning', 'Failed to find Python virtual environment "{0}", which is required to debug and deploy your Azure Functions project.', venvName);
                const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, createVenv, DialogResponses.dontWarnAgain);
                if (result === createVenv) {
                    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: localize('creatingVenv', 'Creating virtual environment...') }, async () => {
                        // create venv
                        await createVirtualEnviornment(venvName, folderPath);
                        await makeVenvDebuggable(venvName, folderPath);
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
