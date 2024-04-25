/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type WebSiteManagementClient } from '@azure/arm-appservice';
import { AppInsightsCreateStep, AppInsightsListStep, AppKind, AppServicePlanCreateStep, AppServicePlanListStep, CustomLocationListStep, LogAnalyticsCreateStep, SiteNameStep, WebsiteOS, type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { LocationListStep, ResourceGroupCreateStep, ResourceGroupListStep, StorageAccountCreateStep, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication, SubscriptionTreeItemBase, uiUtils, type INewStorageAccountDefaults } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, parseError, type AzExtTreeItem, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext, type ICreateChildImplContext } from '@microsoft/vscode-azext-utils';
import { type WorkspaceFolder } from 'vscode';
import { FuncVersion, latestGAVersion, tryParseFuncVersion } from '../FuncVersion';
import { FunctionAppCreateStep } from '../commands/createFunctionApp/FunctionAppCreateStep';
import { FunctionAppHostingPlanStep, setConsumptionPlanProperties } from '../commands/createFunctionApp/FunctionAppHostingPlanStep';
import { type IFunctionAppWizardContext } from '../commands/createFunctionApp/IFunctionAppWizardContext';
import { ContainerizedFunctionAppCreateStep } from '../commands/createFunctionApp/containerImage/ContainerizedFunctionAppCreateStep';
import { DeployWorkspaceProjectStep } from '../commands/createFunctionApp/containerImage/DeployWorkspaceProjectStep';
import { detectDockerfile } from '../commands/createFunctionApp/containerImage/detectDockerfile';
import { FunctionAppStackStep } from '../commands/createFunctionApp/stacks/FunctionAppStackStep';
import { funcVersionSetting, projectLanguageSetting } from '../constants';
import { ext } from '../extensionVariables';
import { tryGetLocalFuncVersion } from '../funcCoreTools/tryGetLocalFuncVersion';
import { localize } from "../localize";
import { createActivityContext } from '../utils/activityUtils';
import { registerProviders } from '../utils/azure';
import { createWebSiteClient } from '../utils/azureClients';
import { nonNullProp } from '../utils/nonNull';
import { getRootFunctionsWorkerRuntime, getWorkspaceSetting, getWorkspaceSettingFromAnyFolder } from '../vsCodeConfig/settings';
import { type DeployWorkspaceProjectResults } from '../vscode-azurecontainerapps.api';
import { ResolvedFunctionAppResource } from './ResolvedFunctionAppResource';
import { SlotTreeItem } from './SlotTreeItem';
import { ContainerTreeItem } from './containerizedFunctionApp/ContainerTreeItem';
import { ResolvedContainerizedFunctionAppResource } from './containerizedFunctionApp/ResolvedContainerizedFunctionAppResource';
import { isProjectCV, isRemoteProjectCV } from './projectContextValues';

export interface ICreateFunctionAppContext extends ICreateChildImplContext {
    newResourceGroupName?: string;
    workspaceFolder?: WorkspaceFolder;
    dockerfilePath?: string;
    rootPath?: string;
    deployWorkspaceResult?: DeployWorkspaceProjectResults;
    skipExecute?: boolean;
}

export class SubscriptionTreeItem extends SubscriptionTreeItemBase {
    public readonly childTypeLabel: string = localize('FunctionApp', 'Function App in Azure');
    public supportsAdvancedCreation: boolean = true;

    private _nextLink: string | undefined;

    public hasMoreChildrenImpl(): boolean {
        return !!this._nextLink;
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        // Load more currently broken https://github.com/Azure/azure-sdk-for-js/issues/20380
        const client: WebSiteManagementClient = await createWebSiteClient([context, this.subscription]);
        let webAppCollection: Site[];
        try {
            webAppCollection = await uiUtils.listAllIterator(client.webApps.list());
        } catch (error) {
            if (parseError(error).errorType.toLowerCase() === 'notfound') {
                // This error type means the 'Microsoft.Web' provider has not been registered in this subscription
                // In that case, we know there are no Function Apps, so we can return an empty array
                // (The provider will be registered automatically if the user creates a new Function App)
                return [];
            } else {
                throw error;
            }
        }

        return await this.createTreeItemsWithErrorHandling(
            webAppCollection,
            'azFuncInvalidFunctionApp',
            (site: Site) => {
                const resolved = new ResolvedFunctionAppResource(this.subscription, site);
                if (resolved.site.isFunctionApp) {
                    return new SlotTreeItem(this, resolved);
                }
                return undefined;
            },
            (site: Site) => {
                return site.name;
            }
        );
    }

    public static async createChild(context: ICreateFunctionAppContext, subscription: SubscriptionTreeItem): Promise<SlotTreeItem | ContainerTreeItem> {
        const version: FuncVersion = await getDefaultFuncVersion(context);
        context.telemetry.properties.projectRuntime = version;
        const language: string | undefined = context.workspaceFolder ? getWorkspaceSetting(projectLanguageSetting, context.workspaceFolder) : getWorkspaceSettingFromAnyFolder(projectLanguageSetting);
        context.telemetry.properties.projectLanguage = language;

        // Ensure all the providers are registered before
        const registerProvidersTask = registerProviders(context, subscription);

        const wizardContext: IFunctionAppWizardContext = Object.assign(context, subscription.subscription, {
            newSiteKind: AppKind.functionapp,
            resourceGroupDeferLocationStep: true,
            version,
            language,
            ...(await createActivityContext())
        });

        const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] = [];

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

        const title: string = localize('functionAppCreatingTitle', 'Create new Function App in Azure');

        const wizard: AzureWizard<IAppServiceWizardContext> = new AzureWizard(wizardContext, {
            promptSteps,
            executeSteps,
            title,
            showLoadingPrompt: context.skipExecute !== true,
            skipExecute: context.skipExecute === true
        });

        await wizard.prompt();
        // if the providers aren't registered yet, await it here because it is required by this point
        await registerProvidersTask;
        if (!context.advancedCreation) {
            const newName: string | undefined = await wizardContext.relatedNameTask;
            if (!newName) {
                throw new Error(localize('noUniqueName', 'Failed to generate unique name for resources. Use advanced creation to manually enter resource names.'));
            }
            wizardContext.newResourceGroupName = context.newResourceGroupName || newName;
            setConsumptionPlanProperties(wizardContext);
            wizardContext.newStorageAccountName = newName;
            wizardContext.newAppInsightsName = newName;
        }

        wizardContext.activityTitle = localize('functionAppCreateActivityTitle', 'Create Function App "{0}"', nonNullProp(wizardContext, 'newSiteName'))
        await wizard.execute();

        let node: SlotTreeItem | ContainerTreeItem;

        if (context.dockerfilePath) {
            const resolved = new ResolvedContainerizedFunctionAppResource(subscription.subscription, nonNullProp(wizardContext, 'site'))
            node = new ContainerTreeItem(subscription, resolved);
        } else {
            const resolved = new ResolvedFunctionAppResource(subscription.subscription, nonNullProp(wizardContext, 'site'));
            node = new SlotTreeItem(subscription, resolved);
        }

        await ext.rgApi.tree.refresh(context);
        return node;
    }

    public isAncestorOfImpl(contextValue: string | RegExp): boolean {
        return !isProjectCV(contextValue) || isRemoteProjectCV(contextValue);
    }
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
