/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BlobServiceClient } from '@azure/storage-blob';
import { AzureWizard, maskUserInfo, parseError, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../../commands/createNewProject/verifyIsProject';
import { CodeAction, ConnectionKey, localSettingsFileName, projectLanguageModelSetting, validateFuncCoreToolsSetting } from "../../constants";
import { getLocalSettingsConnectionString } from "../../funcConfig/local.settings";
import { localize } from '../../localize';
import { createActivityContext } from '../../utils/activityUtils';
import { getDebugConfigs, isDebugConfigEqual } from '../../vsCodeConfig/launch';
import { getWorkspaceSetting } from "../../vsCodeConfig/settings";
import { FuncCoreToolsPromptAndInstallStep } from './FuncCoreToolsPromptAndInstallStep';
import { FuncCoreToolsValidateStep } from './FuncCoreToolsValidateStep';
import { FuncCoreToolsVersionConfirmStep } from './FuncCoreToolsVersionConfirmStep';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';
import { validateStorageProviderConnectionsPreDebug } from './storageProviders/validateStorageProviderConnectionsPreDebug';
import { GetStorageProviderConnectionsValidateSteps } from './storageProviders/wizard/StorageProviderConnectionsValidateSteps';
import { WorkerRuntimeSettingValidateStep } from './WorkerRuntimeSettingValidateStep';

export interface IPreDebugValidateResult {
    workspace: vscode.WorkspaceFolder;
    shouldContinue: boolean;
}

export async function preDebugValidate(context: IActionContext, debugConfig: vscode.DebugConfiguration): Promise<IPreDebugValidateResult> {
    const workspaceFolder: vscode.WorkspaceFolder = getMatchingWorkspace(debugConfig);
    const projectPath: string = await tryGetFunctionProjectRoot(context, workspaceFolder) ?? workspaceFolder.uri.fsPath;

    const wizardContext: IPreDebugValidateContext = {
        ...context,
        ...await createActivityContext({ withChildren: true }),
        action: CodeAction.Debug,
        workspaceFolder,
        projectPath,
        projectLanguage: getWorkspaceSetting(projectLanguageModelSetting, projectPath),
        projectLanguageModel: getWorkspaceSetting(projectLanguageModelSetting, projectPath),
        validateFuncCoreTools: getWorkspaceSetting(validateFuncCoreToolsSetting, workspaceFolder.uri.fsPath) !== false /** This setting defaults to 'true' */,
    };

    wizardContext.telemetry.properties.debugType = debugConfig.type;
    wizardContext.telemetry.properties.projectLanguage = wizardContext.projectLanguage;
    wizardContext.telemetry.properties.projectLanguageModel = wizardContext.projectLanguageModel?.toString();
    wizardContext.telemetry.properties.validateFuncCoreTools = wizardContext.validateFuncCoreTools ? String(wizardContext.validateFuncCoreTools) : undefined;

    await validateStorageProviderConnectionsPreDebug(wizardContext);

    const promptSteps: AzureWizardPromptStep<IPreDebugValidateContext>[] = [
        new FuncCoreToolsPromptAndInstallStep(),
        new FuncCoreToolsVersionConfirmStep(),
        // new LocalEmulatorsListStep(),
    ];

    const executeSteps: AzureWizardExecuteStep<IPreDebugValidateContext>[] = [
        new FuncCoreToolsValidateStep(),
        new WorkerRuntimeSettingValidateStep(),
        new GetStorageProviderConnectionsValidateSteps(),
    ];

    const wizard: AzureWizard<IPreDebugValidateContext> = new AzureWizard(wizardContext, {
        title: localize('prepareDebugSessionTitle', 'Prepare debug session for Azure Functions workspace project'),
        promptSteps,
        executeSteps,
    });

    let shouldContinue: boolean = true;

    try {
        await wizard.prompt();
        await wizard.execute();
    } catch (error) {
        const pe = parseError(error);

        if (pe.isUserCancelledError) {
            shouldContinue = false;
        } else {
            // Don't block debugging for "unexpected" errors, only block if the abort flag is explicitly set. The func cli might still work.
            shouldContinue = !wizardContext.abortDebug;
            wizardContext.telemetry.properties.preDebugValidateError = maskUserInfo(pe.message, []);
        }
    }

    wizardContext.telemetry.properties.shouldContinue = String(shouldContinue);

    return { workspace: wizardContext.workspaceFolder, shouldContinue };
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
 * If AzureWebJobsStorage is set, pings the emulator to make sure it's actually running
 */
async function validateEmulatorIsRunning(context: IActionContext, projectPath: string): Promise<boolean> {
    const [azureWebJobsStorage, isEmulator] = await getLocalSettingsConnectionString(context, ConnectionKey.Storage, projectPath);
    if (azureWebJobsStorage && isEmulator) {
        try {
            const client = BlobServiceClient.fromConnectionString(azureWebJobsStorage, { retryOptions: { maxTries: 1 } });
            await client.getProperties();
        } catch (error) {
            // azurite.azurite Check to see if azurite extension is installed
            const azuriteExtension = vscode.extensions.getExtension('azurite.azurite');
            const installOrRun: vscode.MessageItem = azuriteExtension ? { title: localize('runAzurite', 'Run Emulator') } : { title: localize('installAzurite', 'Install Azurite') };
            const message: string = localize('failedToConnectEmulator', 'Failed to verify "{0}" connection specified in "{1}". Is the local emulator installed and running?', ConnectionKey.Storage, localSettingsFileName);
            const learnMoreLink: string = process.platform === 'win32' ? 'https://aka.ms/AA4ym56' : 'https://aka.ms/AA4yef8';
            const debugAnyway: vscode.MessageItem = { title: localize('debugAnyway', 'Debug anyway') };
            const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { learnMoreLink, modal: true, stepName: 'failedToConnectEmulator' }, debugAnyway, installOrRun);
            if (result === installOrRun) {
                if (azuriteExtension) {
                    await vscode.commands.executeCommand('azurite.start_blob');
                    await vscode.commands.executeCommand('azurite.start_table');
                    await vscode.commands.executeCommand('azurite.start_queue');
                }
                else {
                    await vscode.commands.executeCommand('workbench.extensions.installExtension', 'azurite.azurite');
                }
                return await validateEmulatorIsRunning(context, projectPath);
            }

            return result === debugAnyway;
        }
    }

    return true;
}
