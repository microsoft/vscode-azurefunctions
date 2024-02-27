/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppInsightsCreateStep, AppInsightsListStep, AppKind, AppServicePlanCreateStep, CustomLocationListStep, LogAnalyticsCreateStep, SiteNameStep, WebsiteOS, type IAppServiceWizardContext } from "@microsoft/vscode-azext-azureappservice";
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
import { FunctionAppStackStep } from "./stacks/FunctionAppStackStep";

export async function createCreateFunctionAppComponents(context: ICreateFunctionAppContext,
    subscription: ISubscriptionContext,
    language?: string | undefined): Promise<{
        wizardContext: IFunctionAppWizardContext;
        promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[];
        executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[];
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

    const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] = [];
    promptSteps.push(new SiteNameStep("functionApp"));
    promptSteps.push(new FunctionAppStackStep());

    const storageAccountCreateOptions: INewStorageAccountDefaults = {
        kind: StorageAccountKind.Storage,
        performance: StorageAccountPerformance.Standard,
        replication: StorageAccountReplication.LRS
    };

    if (version === FuncVersion.v1) { // v1 doesn't support linux
        wizardContext.newSiteOS = WebsiteOS.windows;
    }

    if (!context.advancedCreation) {
        LocationListStep.addStep(wizardContext, promptSteps);
        wizardContext.useConsumptionPlan = true;
        wizardContext.stackFilter = getRootFunctionsWorkerRuntime(language);
        promptSteps.push(new ConfigureCommonNamesStep());
        executeSteps.push(new ResourceGroupCreateStep());
        executeSteps.push(new AppServicePlanCreateStep());
        executeSteps.push(new StorageAccountCreateStep(storageAccountCreateOptions));
        executeSteps.push(new LogAnalyticsCreateStep());
        executeSteps.push(new AppInsightsCreateStep());
    } else {
        promptSteps.push(new ResourceGroupListStep());
        CustomLocationListStep.addStep(wizardContext, promptSteps);
        promptSteps.push(new FunctionAppHostingPlanStep());
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
    executeSteps.push(new FunctionAppCreateStep());

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
