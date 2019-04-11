/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { deploySubpathSetting, preDeployTaskSetting, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, pythonVenvSetting, tasksFileName, vscodeFolderName } from '../../constants';
import { ext } from '../../extensionVariables';
import { oldFuncHostNameRegEx } from "../../funcCoreTools/funcHostTask";
import { tryGetLocalRuntimeVersion } from '../../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from '../../localize';
import { convertStringToRuntime, getFuncExtensionSetting, updateGlobalSetting, updateWorkspaceSetting } from '../../ProjectSettings';
import { nonNullValue } from '../../utils/nonNull';
import { createVirtualEnviornment } from '../createNewProject/ProjectCreateStep/PythonProjectCreateStep';
import { tryGetFunctionProjectRoot } from '../createNewProject/verifyIsProject';
import { initProjectForVSCode } from './initProjectForVSCode';
import { tryGetCsprojFile, tryGetFsprojFile, tryGetTargetFramework } from './InitVSCodeStep/DotnetInitVSCodeStep';

// todo split this file up into separate files for each 'verify' case post-review
export async function verifyVSCodeConfigOnActivate(actionContext: IActionContext, folders: vscode.WorkspaceFolder[] | undefined): Promise<void> {
    actionContext.suppressTelemetry = true;
    actionContext.properties.isActivationEvent = 'true';
    actionContext.suppressErrorDisplay = true; // Swallow errors when verifying debug config. No point in showing an error if we can't understand the project anyways

    if (folders) {
        for (const folder of folders) {
            const workspacePath: string = folder.uri.fsPath;
            const projectPath: string | undefined = await tryGetFunctionProjectRoot(workspacePath);
            if (projectPath) {
                actionContext.suppressTelemetry = false;

                if (isInitializedProject(projectPath)) {
                    const projectLanguage: string | undefined = getFuncExtensionSetting(projectLanguageSetting, workspacePath);
                    actionContext.properties.projectLanguage = projectLanguage;
                    switch (projectLanguage) {
                        case ProjectLanguage.JavaScript:
                            await verifyJSDebugConfigIsValid(projectLanguage, workspacePath, actionContext);
                            break;
                        case ProjectLanguage.Java:
                            await verifyJavaDeployConfigIsValid(projectLanguage, workspacePath, actionContext);
                            break;
                        case ProjectLanguage.Python:
                            await verifyPythonVenv(projectPath, actionContext);
                            break;
                        case ProjectLanguage.CSharp:
                        case ProjectLanguage.FSharp:
                            await verifyTargetFramework(projectLanguage, workspacePath, projectPath, actionContext);
                            break;
                        default:
                    }
                } else {
                    await promptToInitializeProject(workspacePath, actionContext);
                }
            }
        }
    }
}

/**
 * Simpler function than `verifyVSCodeConfigOnActivate` to be used right before an operation that requires the project to be initialized for VS Code
 */
export async function verifyInitForVSCode(actionContext: IActionContext, fsPath: string, language?: string, runtime?: string): Promise<[ProjectLanguage, ProjectRuntime]> {
    language = language || getFuncExtensionSetting(projectLanguageSetting, fsPath);
    runtime = convertStringToRuntime(runtime || getFuncExtensionSetting(projectRuntimeSetting, fsPath));

    if (!language || !runtime) {
        const message: string = localize('initFolder', 'Initialize project for use with VS Code?');
        // No need to check result - cancel will throw a UserCancelledError
        await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes);
        await initProjectForVSCode(actionContext, fsPath);
        language = nonNullValue(getFuncExtensionSetting(projectLanguageSetting, fsPath));
        runtime = nonNullValue(getFuncExtensionSetting(projectRuntimeSetting, fsPath));
    }

    return [<ProjectLanguage>language, <ProjectRuntime>runtime];
}

async function promptToInitializeProject(workspacePath: string, actionContext: IActionContext): Promise<void> {
    const settingKey: string = 'showProjectWarning';
    if (getFuncExtensionSetting<boolean>(settingKey)) {
        actionContext.properties.verifyConfigPrompt = 'initProject';

        const learnMoreLink: string = 'https://aka.ms/azFuncProject';
        const message: string = localize('uninitializedWarning', 'Detected an Azure Functions Project in folder "{0}" that may have been created outside of VS Code. Initialize for optimal use with VS Code?', path.basename(workspacePath));
        const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, { learnMoreLink }, DialogResponses.yes, DialogResponses.dontWarnAgain);
        if (result === DialogResponses.dontWarnAgain) {
            actionContext.properties.verifyConfigResult = 'dontWarnAgain';
            await updateGlobalSetting(settingKey, false);
        } else {
            actionContext.properties.verifyConfigResult = 'update';
            await initProjectForVSCode(actionContext, workspacePath);
        }
    } else {
        actionContext.properties.verifyConfigResult = 'suppressed';
    }
}

function isInitializedProject(projectPath: string): boolean {
    const language: string | undefined = getFuncExtensionSetting(projectLanguageSetting, projectPath);
    const runtime: string | undefined = getFuncExtensionSetting(projectRuntimeSetting, projectPath);
    return !!language && !!runtime;
}

/**
 * JavaScript debugging in the func cli had breaking changes in v2.0.1-beta.30 (~6/2018). This verifies users are up-to-date with the latest working debug config.
 * See https://aka.ms/AA1vrxa for more info
 */
async function verifyJSDebugConfigIsValid(projectLanguage: ProjectLanguage | undefined, workspacePath: string, actionContext: IActionContext): Promise<void> {
    const localProjectRuntime: ProjectRuntime | undefined = await tryGetLocalRuntimeVersion();
    if (localProjectRuntime === ProjectRuntime.v2) {
        const tasksJsonPath: string = path.join(workspacePath, vscodeFolderName, tasksFileName);
        const rawTasksData: string = (await fse.readFile(tasksJsonPath)).toString();

        const funcNodeDebugEnvVar: string = 'languageWorkers__node__arguments';
        const oldFuncNodeDebugEnvVar: string = funcNodeDebugEnvVar.replace(/__/g, ':'); // Also check against an old version of the env var that works in most (but not all) cases
        if (!rawTasksData.includes(funcNodeDebugEnvVar) && !rawTasksData.includes(oldFuncNodeDebugEnvVar)) {
            const tasksContent: ITasksJson = <ITasksJson>JSON.parse(rawTasksData);

            // NOTE: Only checking against oldFuncHostNameRegEx (where label looks like "runFunctionsHost")
            // If they're using the tasks our extension provides (where label looks like "func: host start"), they are already good-to-go
            const funcTask: ITask | undefined = tasksContent.tasks.find((t: ITask) => oldFuncHostNameRegEx.test(t.label));
            if (funcTask) {
                actionContext.properties.verifyConfigPrompt = 'updateJSDebugConfig';

                const settingKey: string = 'showDebugConfigWarning';
                const message: string = localize('uninitializedWarning', 'Your debug configuration is out of date and may not work with the latest version of the Azure Functions Core Tools.');
                const learnMoreLink: string = 'https://aka.ms/AA1vrxa';
                if (await promptToUpdateProject(workspacePath, settingKey, message, learnMoreLink, actionContext)) {
                    actionContext.suppressErrorDisplay = false;
                    await initProjectForVSCode(actionContext, workspacePath, projectLanguage);
                }
            }
        }
    }
}

async function verifyJavaDeployConfigIsValid(projectLanguage: ProjectLanguage | undefined, workspacePath: string, actionContext: IActionContext): Promise<void> {
    const preDeployTask: string | undefined = getFuncExtensionSetting<string>(preDeployTaskSetting, workspacePath);
    const deploySubPath: string | undefined = getFuncExtensionSetting<string>(deploySubpathSetting, workspacePath);

    if (!preDeployTask && !deploySubPath) {
        actionContext.properties.verifyConfigPrompt = 'updateJavaDeployConfig';

        const settingKey: string = 'showJavaDeployConfigWarning';
        const message: string = localize('updateJavaDeployConfig', 'Your deploy configuration is out of date and may not work with the latest version of the Azure Functions extension for VS Code.');
        const learnMoreLink: string = 'https://aka.ms/AA41zno';
        if (await promptToUpdateProject(workspacePath, settingKey, message, learnMoreLink, actionContext)) {
            actionContext.suppressErrorDisplay = false;
            await initProjectForVSCode(actionContext, workspacePath, projectLanguage);
        }
    }
}

async function promptToUpdateProject(fsPath: string, settingKey: string, message: string, learnMoreLink: string, actionContext: IActionContext): Promise<boolean> {
    if (getFuncExtensionSetting<boolean>(settingKey)) {
        const updateConfig: vscode.MessageItem = { title: localize('reinit', 'Reinitialize Project') };
        const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, { learnMoreLink }, updateConfig, DialogResponses.dontWarnAgain);
        if (result === DialogResponses.dontWarnAgain) {
            actionContext.properties.verifyConfigResult = 'dontWarnAgain';
            await updateWorkspaceSetting(settingKey, false, fsPath);
        } else {
            actionContext.properties.verifyConfigResult = 'update';
            return true;
        }
    } else {
        actionContext.properties.verifyConfigResult = 'suppressed';
    }

    return false;
}

async function verifyTargetFramework(projectLanguage: ProjectLanguage, workspacePath: string, projectPath: string, actionContext: IActionContext): Promise<void> {
    const settingKey: string = 'showTargetFrameworkWarning';
    if (getFuncExtensionSetting<boolean>(settingKey)) {

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
    let deploySubPath: string | undefined = getFuncExtensionSetting(deploySubpathSetting, workspacePath);
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

async function verifyPythonVenv(projectPath: string, actionContext: IActionContext): Promise<void> {
    const settingKey: string = 'showPythonVenvWarning';
    if (getFuncExtensionSetting<boolean>(settingKey)) {

        const venvName: string | undefined = getFuncExtensionSetting(pythonVenvSetting, projectPath);
        if (venvName && !await fse.pathExists(path.join(projectPath, venvName))) {
            actionContext.properties.verifyConfigPrompt = 'createVenv';

            const createVenv: vscode.MessageItem = { title: localize('createVenv', 'Create virtual environment') };
            const message: string = localize('uninitializedWarning', 'Failed to find Python virtual environment "{0}", which is required to debug and deploy your Azure Functions project.', venvName);
            const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, createVenv, DialogResponses.dontWarnAgain);
            if (result === createVenv) {
                actionContext.suppressErrorDisplay = false;
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: localize('creatingVenv', 'Creating virtual environment...') }, async () => {
                    // create venv
                    await createVirtualEnviornment(venvName, projectPath);
                });

                actionContext.properties.verifyConfigResult = 'update';
                // don't wait
                vscode.window.showInformationMessage(localize('finishedCreatingVenv', 'Finished creating virtual environment.'));
            } else if (result === DialogResponses.dontWarnAgain) {
                actionContext.properties.verifyConfigResult = 'dontWarnAgain';
                await updateGlobalSetting(settingKey, false);
            }
        }
    } else {
        actionContext.properties.verifyConfigResult = 'suppressed';
    }
}

interface ITasksJson {
    tasks: ITask[];
}

interface ITask {
    label: string;
    options?: ITaskOptions;
}

interface ITaskOptions {
    cwd?: string;
    env?: {
        [key: string]: string;
    };
}
