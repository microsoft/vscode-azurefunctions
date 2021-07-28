/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { funcVersionSetting, ProjectLanguage, projectLanguageSetting, TemplateFilter } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { verifyExtensionsConfig } from '../utils/verifyExtensionBundle';
import { getWorkspaceSetting, updateGlobalSetting } from './settings';
import { verifyPythonVenv } from './verifyPythonVenv';
import { verifyTargetFramework } from './verifyTargetFramework';

export async function verifyVSCodeConfigOnActivate(context: IActionContext, folders: readonly vscode.WorkspaceFolder[] | undefined): Promise<void> {
    context.telemetry.suppressIfSuccessful = true;
    context.telemetry.properties.isActivationEvent = 'true';
    context.errorHandling.suppressDisplay = true; // Swallow errors when verifying. No point in showing an error if we can't understand the project anyways

    if (folders) {
        for (const folder of folders) {
            const workspacePath: string = folder.uri.fsPath;
            const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, folder, 'prompt');
            if (projectPath) {
                context.telemetry.suppressIfSuccessful = false;

                const language: ProjectLanguage | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
                const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, projectPath));
                if (language !== undefined && version !== undefined) {
                    // Don't wait
                    void callWithTelemetryAndErrorHandling('initializeTemplates', async (templatesContext: IActionContext) => {
                        templatesContext.telemetry.properties.isActivationEvent = 'true';
                        templatesContext.errorHandling.suppressDisplay = true;
                        const templateProvider = ext.templateProvider.get(templatesContext);
                        await templateProvider.getFunctionTemplates(templatesContext, projectPath, language, version, TemplateFilter.Verified, undefined);
                    });

                    let isDotnet: boolean = false;
                    const projectLanguage: string | undefined = getWorkspaceSetting(projectLanguageSetting, workspacePath);
                    context.telemetry.properties.projectLanguage = projectLanguage;
                    switch (projectLanguage) {
                        case ProjectLanguage.Python:
                            await verifyPythonVenv(projectPath, context, version);
                            break;
                        case ProjectLanguage.CSharp:
                        case ProjectLanguage.FSharp:
                            isDotnet = true;
                            await verifyTargetFramework(projectLanguage, folder, projectPath, context);
                            break;
                        default:
                    }

                    if (!isDotnet) {
                        await verifyExtensionsConfig(context, workspacePath, projectPath);
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
        const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { learnMoreLink }, DialogResponses.yes, DialogResponses.dontWarnAgain);
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
