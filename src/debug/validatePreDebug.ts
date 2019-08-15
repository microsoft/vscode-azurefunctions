/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azureStorage from "azure-storage";
import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureWizard, IActionContext, parseError } from "vscode-azureextensionui";
import { getWorkspaceSetting } from "../../extension.bundle";
import { AzureWebJobsStorageExecuteStep } from "../commands/appSettings/AzureWebJobsStorageExecuteStep";
import { AzureWebJobsStoragePromptStep } from "../commands/appSettings/AzureWebJobsStoragePromptStep";
import { IAzureWebJobsStorageWizardContext } from "../commands/appSettings/IAzureWebJobsStorageWizardContext";
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { functionJsonFileName, isWindows, localEmulatorConnectionString, localSettingsFileName, projectLanguageSetting, workerRuntimeKey } from "../constants";
import { ext } from "../extensionVariables";
import { ParsedFunctionJson } from "../funcConfig/function";
import { azureWebJobsStorageKey, getAzureWebJobsStorage, MismatchBehavior, setLocalAppSetting } from "../funcConfig/local.settings";
import { validateFuncCoreToolsInstalled } from '../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../localize';
import { getFunctionFolders } from "../tree/localProject/LocalFunctionsTreeItem";
import { supportsLocalProjectTree } from "../tree/localProject/supportsLocalProjectTree";
import { getDebugConfigs, isDebugConfigEqual } from '../vsCodeConfig/launch';
import { getFunctionsWorkerRuntime } from "../vsCodeConfig/settings";

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
        shouldContinue = await validateFuncCoreToolsInstalled();

        if (shouldContinue) {
            context.telemetry.properties.lastValidateStep = 'getProjectRoot';
            const projectPath: string | undefined = await tryGetFunctionProjectRoot(workspace.uri.fsPath, true /* suppressPrompt */);

            if (projectPath) {
                const projectLanguage: string | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
                context.telemetry.properties.projectLanguage = projectLanguage;

                context.telemetry.properties.lastValidateStep = 'workerRuntime';
                await validateWorkerRuntime(projectLanguage, projectPath);

                context.telemetry.properties.lastValidateStep = 'azureWebJobsStorage';
                await validateAzureWebJobsStorage(context, projectLanguage, projectPath);

                context.telemetry.properties.lastValidateStep = 'emulatorRunning';
                shouldContinue = await validateEmulatorIsRunning(projectPath);
            }
        }
    } catch (error) {
        if (parseError(error).isUserCancelledError) {
            shouldContinue = false;
        } else {
            throw error;
        }
    }

    context.telemetry.properties.shouldContinue = String(shouldContinue);

    return { workspace, shouldContinue };
}

export function canValidateAzureWebJobStorageOnDebug(projectLanguage: string | undefined): boolean {
    // For now this is the same as `langSupportsLocalProjectTree`, but that's more of an implementation detail and may change in the future
    return supportsLocalProjectTree(projectLanguage);
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
async function validateWorkerRuntime(projectLanguage: string | undefined, projectPath: string): Promise<void> {
    const runtime: string | undefined = getFunctionsWorkerRuntime(projectLanguage);
    if (runtime) {
        // Not worth handling mismatched runtimes since it's so unlikely
        await setLocalAppSetting(projectPath, workerRuntimeKey, runtime, MismatchBehavior.DontChange);
    }
}

async function validateAzureWebJobsStorage(context: IActionContext, projectLanguage: string | undefined, projectPath: string): Promise<void> {
    if (canValidateAzureWebJobStorageOnDebug(projectLanguage)) {
        const azureWebJobsStorage: string | undefined = await getAzureWebJobsStorage(projectPath);
        if (!azureWebJobsStorage) {
            const functionFolders: string[] = await getFunctionFolders(projectPath);
            const functions: ParsedFunctionJson[] = await Promise.all(functionFolders.map(async ff => {
                const functionJsonPath: string = path.join(projectPath, ff, functionJsonFileName);
                return new ParsedFunctionJson(await fse.readJSON(functionJsonPath));
            }));

            if (functions.some(f => !f.isHttpTrigger)) {
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
async function validateEmulatorIsRunning(projectPath: string): Promise<boolean> {
    const azureWebJobsStorage: string | undefined = await getAzureWebJobsStorage(projectPath);
    if (azureWebJobsStorage && azureWebJobsStorage.toLowerCase() === localEmulatorConnectionString.toLowerCase()) {
        try {
            const client: azureStorage.BlobService = azureStorage.createBlobService(azureWebJobsStorage);
            await new Promise((resolve, reject): void => {
                // Checking against a common container for functions, but doesn't really matter what call we make here
                client.doesContainerExist('azure-webjob-hosts', (err: Error | undefined) => {
                    // tslint:disable-next-line: no-void-expression
                    err ? reject(err) : resolve();
                });
            });
        } catch (error) {
            const message: string = localize('failedToConnectEmulator', 'Failed to verify "{0}" connection specified in "{1}". Is the local emulator installed and running?', azureWebJobsStorageKey, localSettingsFileName);
            const learnMoreLink: string = isWindows ? 'https://aka.ms/AA4ym56' : 'https://aka.ms/AA4yef8';
            const debugAnyway: vscode.MessageItem = { title: localize('debugAnyway', 'Debug anyway') };
            const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, { learnMoreLink, modal: true }, debugAnyway);
            return result === debugAnyway;
        }
    }

    return true;
}
