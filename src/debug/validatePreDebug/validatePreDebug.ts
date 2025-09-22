/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BlobServiceClient } from '@azure/storage-blob';
import { AzureWizard, maskUserInfo, parseError, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as semver from 'semver';
import * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../../commands/createNewProject/verifyIsProject';
import { CodeAction, ConnectionKey, DurableBackend, localSettingsFileName, projectLanguageModelSetting, projectLanguageSetting, workerRuntimeKey } from "../../constants";
import { MismatchBehavior, getLocalSettingsConnectionString, setLocalAppSetting } from "../../funcConfig/local.settings";
import { getLocalFuncCoreToolsVersion } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { createActivityContext } from '../../utils/activityUtils';
import { durableUtils } from '../../utils/durableUtils';
import { isPythonV2Plus } from '../../utils/programmingModelUtils';
import { getDebugConfigs, isDebugConfigEqual } from '../../vsCodeConfig/launch';
import { getWorkspaceSetting, tryGetFunctionsWorkerRuntimeForProject } from "../../vsCodeConfig/settings";
import { validateDTSConnectionPreDebug } from '../storageProviders/validateDTSConnectionPreDebug';
import { validateNetheriteConnectionPreDebug } from '../storageProviders/validateNetheriteConnectionPreDebug';
import { validateSQLConnectionPreDebug } from '../storageProviders/validateSQLConnectionPreDebug';
import { validateStorageConnectionPreDebug } from '../storageProviders/validateStorageConnectionPreDebug';
import { FuncCoreToolsInstallPromptStep } from './FuncCoreToolsInstallPromptStep';
import { FuncCoreToolsInstallStep } from './FuncCoreToolsInstallStep';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

export interface IPreDebugValidateResult {
    workspace: vscode.WorkspaceFolder;
    shouldContinue: boolean;
}

export async function preDebugValidate(actionContext: IActionContext, debugConfig: vscode.DebugConfiguration): Promise<IPreDebugValidateResult> {
    const workspaceFolder: vscode.WorkspaceFolder = getMatchingWorkspace(debugConfig);
    actionContext.telemetry.properties.debugType = debugConfig.type;

    const promptSteps: AzureWizardPromptStep<IPreDebugValidateContext>[] = [
        new FuncCoreToolsInstallPromptStep(),
        // FuncCoreToolsVersionValidateStep
    ];

    const executeSteps: AzureWizardExecuteStep<IPreDebugValidateContext>[] = [
        new FuncCoreToolsInstallStep(),
        // Validate worker runtime setting
        // Required connections validate step(s)
    ];

    const wizardContext: IPreDebugValidateContext = {
        ...actionContext,
        ...await createActivityContext({ withChildren: true }),
        action: CodeAction.Debug,
        workspaceFolder,
        projectPath: await tryGetFunctionProjectRoot(actionContext, workspaceFolder) ?? workspaceFolder.uri.fsPath,
    };

    const projectLanguage: string | undefined = getWorkspaceSetting(projectLanguageSetting, wizardContext.projectPath);
    const projectLanguageModel: number | undefined = getWorkspaceSetting(projectLanguageModelSetting, wizardContext.projectPath);
    // const durableStorageType: DurableBackend | undefined = await durableUtils.getStorageTypeFromWorkspace(projectLanguage, wizardContext.projectPath);

    const wizard: AzureWizard<IPreDebugValidateContext> = new AzureWizard(wizardContext, {
        title: localize('prepareDebugSessionTitle', 'Validate connections and prepare Azure Functions Core Tools for debug session'),
        promptSteps,
        executeSteps,
    });

    await wizard.prompt();
    await wizard.execute();

    // Should we detect and validate connections as part of the initial wizard, if they aren't valid, then we spin off the future connection setup wizards...
    // When should we check for emulator stuff?  How can we combine prompts for starting the emulators and prompting connections

    let shouldContinue: boolean;
    try {
        if (shouldContinue && wizardContext.projectPath) {
            const projectLanguage: string | undefined = getWorkspaceSetting(projectLanguageSetting, wizardContext.projectPath);
            const projectLanguageModel: number | undefined = getWorkspaceSetting(projectLanguageModelSetting, wizardContext.projectPath);
            const durableStorageType: DurableBackend | undefined = await durableUtils.getStorageTypeFromWorkspace(projectLanguage, wizardContext.projectPath);

            wizardContext.telemetry.properties.projectLanguage = projectLanguage;
            wizardContext.telemetry.properties.projectLanguageModel = projectLanguageModel?.toString();
            wizardContext.telemetry.properties.durableStorageType = durableStorageType;

            wizardContext.telemetry.properties.lastValidateStep = 'functionVersion';
            shouldContinue = await validateFunctionVersion(wizardContext, projectLanguage, projectLanguageModel, wizardContext.workspace.uri.fsPath);

            wizardContext.telemetry.properties.lastValidateStep = 'workerRuntime';
            await validateWorkerRuntime(wizardContext, projectLanguage, wizardContext.projectPath);

            switch (durableStorageType) {
                case DurableBackend.DTS:
                    wizardContext.telemetry.properties.lastValidateStep = 'dtsConnection';
                    await validateDTSConnectionPreDebug(wizardContext, wizardContext.projectPath);
                    break;
                case DurableBackend.Netherite:
                    wizardContext.telemetry.properties.lastValidateStep = 'netheriteConnection';
                    await validateNetheriteConnectionPreDebug(wizardContext, wizardContext.projectPath);
                    break;
                case DurableBackend.SQL:
                    wizardContext.telemetry.properties.lastValidateStep = 'sqlDbConnection';
                    await validateSQLConnectionPreDebug(wizardContext, wizardContext.projectPath);
                    break;
                case DurableBackend.Storage:
                default:
            }

            wizardContext.telemetry.properties.lastValidateStep = 'azureWebJobsStorage';
            await validateAzureWebJobsStorage(wizardContext, wizardContext.projectPath);

            wizardContext.telemetry.properties.lastValidateStep = 'emulatorRunning';
            shouldContinue = await validateEmulatorIsRunning(wizardContext, wizardContext.projectPath);
        }
    } catch (error) {
        const pe = parseError(error);
        if (pe.isUserCancelledError) {
            shouldContinue = false;
        } else {
            // Don't block debugging for "unexpected" errors. The func cli might still work
            shouldContinue = true;
            wizardContext.telemetry.properties.preDebugValidateError = maskUserInfo(pe.message, []);
        }
    }

    wizardContext.telemetry.properties.shouldContinue = String(shouldContinue);

    return { workspace, shouldContinue };
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
 * Ensure that that Python V2+ projects have an appropriate version of Functions tools installed.
 */
async function validateFunctionVersion(context: IActionContext, projectLanguage: string | undefined, projectLanguageModel: number | undefined, workspacePath: string): Promise<boolean> {
    const validateTools = getWorkspaceSetting<boolean>('validateFuncCoreTools', workspacePath) !== false;

    if (validateTools && isPythonV2Plus(projectLanguage, projectLanguageModel)) {
        const version = await getLocalFuncCoreToolsVersion(context, workspacePath);

        // NOTE: This is the latest version available as of this commit,
        //       but not necessarily the final "preview release" version.
        //       The Functions team is ok with using this version as the
        //       minimum bar.
        const expectedVersionRange = '>=4.0.4742';

        if (version && !semver.satisfies(version, expectedVersionRange)) {
            const message: string = localize('invalidFunctionVersion', 'The version of installed Functions tools "{0}" is not sufficient for this project type ("{1}").', version, expectedVersionRange);
            const debugAnyway: vscode.MessageItem = { title: localize('debugWithInvalidFunctionVersionAnyway', 'Debug anyway') };
            const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { modal: true, stepName: 'failedWithInvalidFunctionVersion' }, debugAnyway);
            return result === debugAnyway;
        }
    }

    return true;
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

async function validateAzureWebJobsStorage(context: IPreDebugContext, projectPath: string): Promise<void> {
    // most programming models require the `AzureWebJobsStorage` connection now so we should just validate it for every runtime/trigger
    await validateStorageConnectionPreDebug(context, projectPath);
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
