/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { convertStringToRuntime, getWorkspaceSetting, updateGlobalSetting } from './settings';
import { verifyJavaDeployConfigIsValid } from './verifyJavaDeployConfigIsValid';
import { verifyJSDebugConfigIsValid } from './verifyJSDebugConfigIsValid';
import { verifyPythonVenv } from './verifyPythonVenv';
import { verifyTargetFramework } from './verifyTargetFramework';

export async function verifyVSCodeConfigOnActivate(context: IActionContext, folders: vscode.WorkspaceFolder[] | undefined): Promise<void> {
    context.telemetry.suppressIfSuccessful = true;
    context.telemetry.properties.isActivationEvent = 'true';
    context.errorHandling.suppressDisplay = true; // Swallow errors when verifying. No point in showing an error if we can't understand the project anyways

    if (folders) {
        for (const folder of folders) {
            const workspacePath: string = folder.uri.fsPath;
            const projectPath: string | undefined = await tryGetFunctionProjectRoot(workspacePath);
            if (projectPath) {
                context.telemetry.suppressIfSuccessful = false;

                const language: ProjectLanguage | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
                const runtime: ProjectRuntime | undefined = convertStringToRuntime(getWorkspaceSetting(projectRuntimeSetting, projectPath));
                if (language !== undefined && runtime !== undefined) {
                    // Don't wait
                    // tslint:disable-next-line: no-floating-promises
                    callWithTelemetryAndErrorHandling('initializeTemplates', async (templatesContext: IActionContext) => {
                        templatesContext.telemetry.properties.isActivationEvent = 'true';
                        templatesContext.errorHandling.suppressDisplay = true;
                        await ext.templateProvider.getFunctionTemplates(templatesContext, language, runtime);
                    });

                    const projectLanguage: string | undefined = getWorkspaceSetting(projectLanguageSetting, workspacePath);
                    context.telemetry.properties.projectLanguage = projectLanguage;
                    switch (projectLanguage) {
                        case ProjectLanguage.JavaScript:
                            await verifyJSDebugConfigIsValid(projectLanguage, workspacePath, context);
                            break;
                        case ProjectLanguage.Java:
                            await verifyJavaDeployConfigIsValid(projectLanguage, workspacePath, context);
                            break;
                        case ProjectLanguage.Python:
                            await verifyPythonVenv(projectPath, context);
                            break;
                        case ProjectLanguage.CSharp:
                        case ProjectLanguage.FSharp:
                            await verifyTargetFramework(projectLanguage, folder, projectPath, context);
                            break;
                        default:
                    }
                } else {
                    await promptToInitializeProject(workspacePath, context);
                }
            }
        }
    }
}

async function promptToInitializeProject(workspacePath: string, context: IActionContext): Promise<void> {
    const settingKey: string = 'showProjectWarning';
    if (getWorkspaceSetting<boolean>(settingKey)) {
        context.telemetry.properties.verifyConfigPrompt = 'initProject';

        const learnMoreLink: string = 'https://aka.ms/azFuncProject';
        const message: string = localize('uninitializedWarning', 'Detected an Azure Functions Project in folder "{0}" that may have been created outside of VS Code. Initialize for optimal use with VS Code?', path.basename(workspacePath));
        const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, { learnMoreLink }, DialogResponses.yes, DialogResponses.dontWarnAgain);
        if (result === DialogResponses.dontWarnAgain) {
            context.telemetry.properties.verifyConfigResult = 'dontWarnAgain';
            await updateGlobalSetting(settingKey, false);
        } else {
            context.telemetry.properties.verifyConfigResult = 'update';
            await initProjectForVSCode(context, workspacePath);
        }
    } else {
        context.telemetry.properties.verifyConfigResult = 'suppressed';
    }
}
