/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppInsightsCreateStep, AppInsightsListStep, AppKind, AppServicePlanCreateStep, AppServicePlanListStep, CustomLocationListStep, LogAnalyticsCreateStep, SiteNameStep, WebsiteOS, type IAppServiceWizardContext } from "@microsoft/vscode-azext-azureappservice";
import { LocationListStep, ResourceGroupCreateStep, ResourceGroupListStep, StorageAccountCreateStep, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication, type INewStorageAccountDefaults } from "@microsoft/vscode-azext-azureutils";
import { type AzureWizardExecuteStep, type AzureWizardPromptStep, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { FuncVersion, latestGAVersion, tryParseFuncVersion } from "../../FuncVersion";
import { funcVersionSetting } from "../../constants";
import { tryGetLocalFuncVersion } from "../../funcCoreTools/tryGetLocalFuncVersion";
import { type ICreateFunctionAppContext } from "../../tree/SubscriptionTreeItem";
import { createActivityContext } from "../../utils/activityUtils";
import { getRootFunctionsWorkerRuntime, getWorkspaceSetting, getWorkspaceSettingFromAnyFolder } from "../../vsCodeConfig/settings";
import { FunctionAppCreateStep } from "./FunctionAppCreateStep";
import { FunctionAppHostingPlanStep } from "./FunctionAppHostingPlanStep";
import { type IFunctionAppWizardContext } from "./IFunctionAppWizardContext";
import { ConfigureCommonNamesStep } from "./UniqueNamePromptStep";
import { ContainerizedFunctionAppCreateStep } from "./containerImage/ContainerizedFunctionAppCreateStep";
import { DeployWorkspaceProjectStep } from "./containerImage/DeployWorkspaceProjectStep";
import { detectDockerfile } from "./containerImage/detectDockerfile";
import { FunctionAppStackStep } from "./stacks/FunctionAppStackStep";

export async function createCreateFunctionAppComponents(context: ICreateFunctionAppContext,
    subscription: ISubscriptionContext,
    language?: string | undefined): Promise<{
        wizardContext: IFunctionAppWizardContext;
        promptSteps: AzureWizardPromptStep<IFunctionAppWizardContext>[];
        executeSteps: AzureWizardExecuteStep<IFunctionAppWizardContext>[];
    }> {

    const version: FuncVersion = await getDefaultFuncVersion(context);
    context.telemetry.properties.projectRuntime = version;

    const wizardContext: IFunctionAppWizardContext = Object.assign(context, subscription, {
        newSiteKind: AppKind.functionapp,
        resourceGroupDeferLocationStep: true,
        version,
        language,
        ...(await createActivityContext())
    });

    const promptSteps: AzureWizardPromptStep<IFunctionAppWizardContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IFunctionAppWizardContext>[] = [];

    const storageAccountCreateOptions: INewStorageAccountDefaults = {
        kind: StorageAccountKind.Storage,
        performance: StorageAccountPerformance.Standard,
        replication: StorageAccountReplication.LRS
    };

    await detectDockerfile(context);

    promptSteps.push(new SiteNameStep(context.dockerfilePath ? "containerizedFunctionApp" : "functionApp"));

    if (context.dockerfilePath) {
        const containerizedfunctionAppWizard = await createContainerizedFunctionAppWizard();
        promptSteps.push(...containerizedfunctionAppWizard.promptSteps);
        executeSteps.push(...containerizedfunctionAppWizard.executeSteps);
    } else {
        const functionAppWizard = await createFunctionAppWizard(wizardContext);
        promptSteps.push(...functionAppWizard.promptSteps);
        executeSteps.push(...functionAppWizard.executeSteps);
    }

    if (!wizardContext.advancedCreation) {
        LocationListStep.addStep(wizardContext, promptSteps);
        wizardContext.useConsumptionPlan = true;
        wizardContext.stackFilter = getRootFunctionsWorkerRuntime(wizardContext.language);
        promptSteps.push(new ConfigureCommonNamesStep());
        executeSteps.push(new ResourceGroupCreateStep());
        executeSteps.push(new StorageAccountCreateStep(storageAccountCreateOptions));
        executeSteps.push(new AppInsightsCreateStep());
        if (!context.dockerfilePath) {
            executeSteps.push(new AppServicePlanCreateStep());
            executeSteps.push(new LogAnalyticsCreateStep());
        }
    } else {
        promptSteps.push(new ResourceGroupListStep());
        promptSteps.push(new StorageAccountListStep(
            storageAccountCreateOptions,
            {
                // The account type must support blobs, queues, and tables.
                // See: https://aka.ms/Cfqnrc
                kind: [
                    // Blob-only accounts don't support queues and tables
                    StorageAccountKind.BlobStorage
                ],
                performance: [
                    // Premium performance accounts don't support queues and tables
                    StorageAccountPerformance.Premium
                ],
                learnMoreLink: 'https://aka.ms/Cfqnrc'
            }
        ));
        promptSteps.push(new AppInsightsListStep());
    }


    const storageProvider = 'Microsoft.Storage';
    LocationListStep.addProviderForFiltering(wizardContext, storageProvider, 'storageAccounts');

    return {
        wizardContext,
        promptSteps,
        executeSteps
    };
}

async function getDefaultFuncVersion(context: ICreateFunctionAppContext): Promise<FuncVersion> {
    const settingValue: string | undefined = context.workspaceFolder ? getWorkspaceSetting(funcVersionSetting, context.workspaceFolder) : getWorkspaceSettingFromAnyFolder(funcVersionSetting);
    // Try to get VS Code setting for version (aka if they have a project open)
    let version: FuncVersion | undefined = tryParseFuncVersion(settingValue);
    context.telemetry.properties.runtimeSource = 'VSCodeSetting';

    if (version === undefined) {
        // Try to get the version that matches their local func cli
        version = await tryGetLocalFuncVersion(context, undefined);
        context.telemetry.properties.runtimeSource = 'LocalFuncCli';
    }

    if (version === undefined) {
        version = latestGAVersion;
        context.telemetry.properties.runtimeSource = 'Backup';
    }

    return version;
}

async function createFunctionAppWizard(wizardContext: IFunctionAppWizardContext): Promise<{ promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[], executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] }> {
    const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] = [];

    if (wizardContext.advancedCreation) {
        promptSteps.push(new FunctionAppHostingPlanStep());
        // location is required to get flex runtimes, so prompt before stack step
        CustomLocationListStep.addStep(wizardContext, promptSteps);
    }

    promptSteps.push(new FunctionAppStackStep());

    if (wizardContext.advancedCreation) {
        promptSteps.push(new AppServicePlanListStep())
    }

    if (wizardContext.version === FuncVersion.v1) { // v1 doesn't support linux
        wizardContext.newSiteOS = WebsiteOS.windows;
    }

    executeSteps.push(new FunctionAppCreateStep());

    return { promptSteps, executeSteps };
}

async function createContainerizedFunctionAppWizard(): Promise<{ promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[], executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] }> {
    const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] = [];

    executeSteps.push(new DeployWorkspaceProjectStep());
    executeSteps.push(new ContainerizedFunctionAppCreateStep());

    return { promptSteps, executeSteps };
}
