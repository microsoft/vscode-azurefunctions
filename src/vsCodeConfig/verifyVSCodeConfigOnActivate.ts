/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';
import type * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { funcVersionSetting, ProjectLanguage, projectLanguageModelSetting, projectLanguageSetting } from '../constants';
import { ext } from '../extensionVariables';
import { tryParseFuncVersion, type FuncVersion } from '../FuncVersion';
import { verifyExtensionsConfig } from '../utils/verifyExtensionBundle';
import { getWorkspaceSetting } from './settings';
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
                const languageModel = getWorkspaceSetting<number>(projectLanguageModelSetting, projectPath);
                const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, projectPath));
                if (language !== undefined && version !== undefined) {
                    // Don't wait
                    void callWithTelemetryAndErrorHandling('initializeTemplates', async (templatesContext: IActionContext) => {
                        templatesContext.telemetry.properties.isActivationEvent = 'true';
                        templatesContext.errorHandling.suppressDisplay = true;
                        const templateProvider = ext.templateProvider.get(templatesContext);
                        await templateProvider.getFunctionTemplates(templatesContext, projectPath, language, languageModel, version, undefined);
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
                }
            }
        }
    }
}
