/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BlobServiceClient } from '@azure/storage-blob';
import { AzureWizard, IActionContext, parseError } from "@microsoft/vscode-azext-utils";
import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureWebJobsStorageExecuteStep } from "../commands/appSettings/AzureWebJobsStorageExecuteStep";
import { AzureWebJobsStoragePromptStep } from "../commands/appSettings/AzureWebJobsStoragePromptStep";
import { IAzureWebJobsStorageWizardContext } from "../commands/appSettings/IAzureWebJobsStorageWizardContext";
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { functionJsonFileName, localEmulatorConnectionString, localSettingsFileName, ProjectLanguage, projectLanguageModelSetting, projectLanguageSetting, workerRuntimeKey } from "../constants";
import { ParsedFunctionJson } from "../funcConfig/function";
import { azureWebJobsStorageKey, getAzureWebJobsStorage, MismatchBehavior, setLocalAppSetting } from "../funcConfig/local.settings";
import { validateFuncCoreToolsInstalled } from '../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../localize';
import { getFunctionFolders } from "../tree/localProject/LocalFunctionsTreeItem";
import { getDebugConfigs, isDebugConfigEqual } from '../vsCodeConfig/launch';
import { getWorkspaceSetting, tryGetFunctionsWorkerRuntimeForProject } from "../vsCodeConfig/settings";

export interface IPreDebugValidateResult {
    workspace: vscode.WorkspaceFolder;
    shouldContinue: boolean;
}

export async function preDebugValidate(context: IActionContext, debugConfig: vscode.DebugConfiguration): Promise<IPreDebugValidateResult> {
    const workspace: vscode.WorkspaceFolder = getMatchingWorkspace(debugConfig);
    let shouldContinue: boolean;
    context.telemetry.properties.debugType = debugConfig.type;

    try {
        context.telemetry.properties.lastValidateStep = 'funcInstalled';
        const message: string = localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to debug your local functions.');
        shouldContinue = await validateFuncCoreToolsInstalled(context, message, workspace.uri.fsPath);

        if (shouldContinue) {
            context.telemetry.properties.lastValidateStep = 'getProjectRoot';
            const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, workspace);

            if (projectPath) {
                const projectLanguage: string | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
                context.telemetry.properties.projectLanguage = projectLanguage;

                context.telemetry.properties.lastValidateStep = 'workerRuntime';
                await validateWorkerRuntime(context, projectLanguage, projectPath);

                const projectLanguageModel: number | undefined = getWorkspaceSetting(projectLanguageModelSetting, projectPath);

                context.telemetry.properties.lastValidateStep = 'azureWebJobsStorage';
                await validateAzureWebJobsStorage(context, projectLanguage, projectLanguageModel, projectPath);

                context.telemetry.properties.lastValidateStep = 'emulatorRunning';
                shouldContinue = await validateEmulatorIsRunning(context, projectPath);
            }
        }
    } catch (error) {
        const pe = parseError(error);
        if (pe.isUserCancelledError) {
            shouldContinue = false;
        } else {
            // Don't block debugging for "unexpected" errors. The func cli might still work
            shouldContinue = true;
            context.telemetry.properties.preDebugValidateError = pe.message;
        }
    }

    context.telemetry.properties.shouldContinue = String(shouldContinue);

    return { workspace, shouldContinue };
}

export function canValidateAzureWebJobStorageOnDebug(projectLanguage: string | undefined): boolean {
    switch (projectLanguage) {
        case ProjectLanguage.CSharp:
        case ProjectLanguage.FSharp:
        case ProjectLanguage.Java:
            // We know if we need `AzureWebJobStorage` based on the function.json files, but those files don't exist until after a build for languages that need to be compiled
            return false;
        default:
            return true;
    }
}

function getMatchingWorkspace(debugConfig: vscode.DebugConfiguration): vscode.WorkspaceFolder {
    if (vscode.workspace.workspaceFolders) {
        for (const workspace of vscode.workspace.workspaceFolders) {
            try {
                const configs: vscode.DebugConfiguration[] = getDebugConfigs(workspace);
                if (configs.some(c => isDebugConfigEqual(c, debugConfig))) {
                    return workspace;
                }
            } catch {
                // ignore and try next workspace
            }
        }
    }

    throw new Error(localize('noDebug', 'Failed to find launch config matching name "{0}", request "{1}", and type "{2}".', debugConfig.name, debugConfig.request, debugConfig.type));
}

/**
 * Automatically add worker runtime setting since it's required to debug, but often gets deleted since it's stored in "local.settings.json" which isn't tracked in source control
 */
async function validateWorkerRuntime(context: IActionContext, projectLanguage: string | undefined, projectPath: string): Promise<void> {
    const runtime: string | undefined = await tryGetFunctionsWorkerRuntimeForProject(context, projectLanguage, projectPath);
    if (runtime) {
        // Not worth handling mismatched runtimes since it's so unlikely
        await setLocalAppSetting(context, projectPath, workerRuntimeKey, runtime, MismatchBehavior.DontChange);
    }
}

async function validateAzureWebJobsStorage(context: IActionContext, projectLanguage: string | undefined, projectLanguageModel: number | undefined, projectPath: string): Promise<void> {
    if (canValidateAzureWebJobStorageOnDebug(projectLanguage)) {
        const azureWebJobsStorage: string | undefined = await getAzureWebJobsStorage(context, projectPath);
        if (!azureWebJobsStorage) {
            const functionFolders: string[] = await getFunctionFolders(context, projectPath);
            const functions: ParsedFunctionJson[] = await Promise.all(functionFolders.map(async ff => {
                const functionJsonPath: string = path.join(projectPath, ff, functionJsonFileName);
                return new ParsedFunctionJson(await fse.readJSON(functionJsonPath));
            }));

            // NOTE: Currently, Python V2+ requires storage to be configured, even for HTTP triggers.
            const isPythonV2Plus = projectLanguage === 'Python' && projectLanguageModel && projectLanguageModel > 1;

            if (functions.some(f => !f.isHttpTrigger) || isPythonV2Plus) {
                const wizardContext: IAzureWebJobsStorageWizardContext = Object.assign(context, { projectPath });
                const wizard: AzureWizard<IAzureWebJobsStorageWizardContext> = new AzureWizard(wizardContext, {
                    promptSteps: [new AzureWebJobsStoragePromptStep(true /* suppressSkipForNow */)],
                    executeSteps: [new AzureWebJobsStorageExecuteStep()]
                });
                await wizard.prompt();
                await wizard.execute();
            }
        }
    }
}

/**
 * If AzureWebJobsStorage is set, pings the emulator to make sure it's actually running
 */
async function validateEmulatorIsRunning(context: IActionContext, projectPath: string): Promise<boolean> {
    const azureWebJobsStorage: string | undefined = await getAzureWebJobsStorage(context, projectPath);
    if (azureWebJobsStorage && azureWebJobsStorage.toLowerCase() === localEmulatorConnectionString.toLowerCase()) {
        try {
            const client = BlobServiceClient.fromConnectionString(azureWebJobsStorage, { retryOptions: { maxTries: 1 } });
            await client.getProperties();
        } catch (error) {
            const message: string = localize('failedToConnectEmulator', 'Failed to verify "{0}" connection specified in "{1}". Is the local emulator installed and running?', azureWebJobsStorageKey, localSettingsFileName);
            const learnMoreLink: string = process.platform === 'win32' ? 'https://aka.ms/AA4ym56' : 'https://aka.ms/AA4yef8';
            const debugAnyway: vscode.MessageItem = { title: localize('debugAnyway', 'Debug anyway') };
            const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { learnMoreLink, modal: true, stepName: 'failedToConnectEmulator' }, debugAnyway);
            return result === debugAnyway;
        }
    }

    return true;
}
