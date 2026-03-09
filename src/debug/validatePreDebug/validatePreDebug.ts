/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, maskUserInfo, parseError, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../../commands/createNewProject/verifyIsProject';
import { CodeAction, projectLanguageModelSetting, projectLanguageSetting, validateFuncCoreToolsSetting } from "../../constants";
import { localize } from '../../localize';
import { createActivityContext } from '../../utils/activityUtils';
import { durableUtils } from '../../utils/durableUtils';
import { getDebugConfigs, isDebugConfigEqual } from '../../vsCodeConfig/launch';
import { getWorkspaceSetting } from "../../vsCodeConfig/settings";
import { FuncCoreToolsPromptAndInstallStep } from './FuncCoreToolsPromptAndInstallStep';
import { FuncCoreToolsValidateStep } from './FuncCoreToolsValidateStep';
import { FuncCoreToolsVersionConfirmStep } from './FuncCoreToolsVersionConfirmStep';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';
import { WorkerRuntimeSettingValidateStep } from './WorkerRuntimeSettingValidateStep';
import { setStorageProviderConnectionsPreDebugIfNeeded } from './storageProviders/connections/set/setStorageProviderConnectionsPreDebug';
import { GetStorageProviderConnectionsValidateSteps } from './storageProviders/connections/validate/GetStorageProviderConnectionsValidateSteps';

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
        projectLanguage: getWorkspaceSetting(projectLanguageSetting, projectPath),
        projectLanguageModel: getWorkspaceSetting(projectLanguageModelSetting, projectPath),
        validateFuncCoreTools: getWorkspaceSetting(validateFuncCoreToolsSetting, workspaceFolder.uri.fsPath) !== false /** This setting defaults to 'true' */,
    };

    wizardContext.durableStorageType = await durableUtils.getStorageTypeFromWorkspace(wizardContext.projectLanguage, wizardContext.projectPath);
    wizardContext.telemetry.properties.debugType = debugConfig.type;
    wizardContext.telemetry.properties.durableStorageType = wizardContext.durableStorageType;
    wizardContext.telemetry.properties.projectLanguage = wizardContext.projectLanguage;
    wizardContext.telemetry.properties.projectLanguageModel = wizardContext.projectLanguageModel?.toString();
    wizardContext.telemetry.properties.validateFuncCoreTools = wizardContext.validateFuncCoreTools ? String(wizardContext.validateFuncCoreTools) : undefined;

    await setStorageProviderConnectionsPreDebugIfNeeded(wizardContext);

    const promptSteps: AzureWizardPromptStep<IPreDebugValidateContext>[] = [
        new FuncCoreToolsPromptAndInstallStep(),
        new FuncCoreToolsVersionConfirmStep(),
    ];

    const executeSteps: AzureWizardExecuteStep<IPreDebugValidateContext>[] = [
        new FuncCoreToolsValidateStep(),
        new WorkerRuntimeSettingValidateStep(),
        new GetStorageProviderConnectionsValidateSteps(),
    ];

    const wizard: AzureWizard<IPreDebugValidateContext> = new AzureWizard(wizardContext, {
        title: localize('validateDebugSessionTitle', 'Validate debug configuration for Azure Functions workspace project'),
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
