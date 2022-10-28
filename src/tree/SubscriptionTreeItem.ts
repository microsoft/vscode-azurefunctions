/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Site, WebSiteManagementClient } from '@azure/arm-appservice';
import { AppInsightsCreateStep, AppInsightsListStep, AppKind, AppServicePlanCreateStep, CustomLocationListStep, IAppServiceWizardContext, LogAnalyticsCreateStep, SiteNameStep, WebsiteOS } from '@microsoft/vscode-azext-azureappservice';
import { INewStorageAccountDefaults, LocationListStep, ResourceGroupCreateStep, ResourceGroupListStep, StorageAccountCreateStep, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication, SubscriptionTreeItemBase, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzExtTreeItem, AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, IActionContext, ICreateChildImplContext, parseError } from '@microsoft/vscode-azext-utils';
import { WorkspaceFolder } from 'vscode';
import { FunctionAppCreateStep } from '../commands/createFunctionApp/FunctionAppCreateStep';
import { FunctionAppHostingPlanStep, setConsumptionPlanProperties } from '../commands/createFunctionApp/FunctionAppHostingPlanStep';
import { IFunctionAppWizardContext } from '../commands/createFunctionApp/IFunctionAppWizardContext';
import { FunctionAppStackStep } from '../commands/createFunctionApp/stacks/FunctionAppStackStep';
import { ConnectionKey, DurableBackendValues, funcVersionSetting, localEventHubsEmulatorConnectionRegExp, localStorageEmulatorConnectionString, projectLanguageSetting } from '../constants';
import { ext } from '../extensionVariables';
import { getLocalConnectionString } from '../funcConfig/local.settings';
import { tryGetLocalFuncVersion } from '../funcCoreTools/tryGetLocalFuncVersion';
import { FuncVersion, latestGAVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from "../localize";
import { createActivityContext } from '../utils/activityUtils';
import { registerProviders } from '../utils/azure';
import { createWebSiteClient } from '../utils/azureClients';
import { durableUtils } from '../utils/durableUtils';
import { nonNullProp } from '../utils/nonNull';
import { getRootFunctionsWorkerRuntime, getWorkspaceSetting, getWorkspaceSettingFromAnyFolder } from '../vsCodeConfig/settings';
import { isProjectCV, isRemoteProjectCV } from './projectContextValues';
import { ResolvedFunctionAppResource } from './ResolvedFunctionAppResource';
import { SlotTreeItem } from './SlotTreeItem';

export interface ICreateFunctionAppContext extends ICreateChildImplContext {
    newResourceGroupName?: string;
    workspaceFolder?: WorkspaceFolder;
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

    public static async createChild(context: ICreateFunctionAppContext, subscription: SubscriptionTreeItem): Promise<SlotTreeItem> {
        const version: FuncVersion = await getDefaultFuncVersion(context);
        context.telemetry.properties.projectRuntime = version;
        const language: string | undefined = context.workspaceFolder ? getWorkspaceSetting(projectLanguageSetting, context.workspaceFolder) : getWorkspaceSettingFromAnyFolder(projectLanguageSetting);
        context.telemetry.properties.projectLanguage = language;
        const durableStorageType: DurableBackendValues | undefined = await durableUtils.getStorageTypeFromWorkspace(language);
        context.telemetry.properties.projectDurableStorageType = durableStorageType;

        const azureStorageConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.Storage);
        const hasAzureStorageConnection: boolean = !!azureStorageConnection && azureStorageConnection !== localStorageEmulatorConnectionString;
        context.telemetry.properties.projectHasAzureStorageConnection = String(hasAzureStorageConnection);

        const eventHubsConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.EventHub);
        const hasEventHubsConnection: boolean = !!eventHubsConnection && !localEventHubsEmulatorConnectionRegExp.test(eventHubsConnection);
        context.telemetry.properties.projectHasEventHubsConnection = String(hasEventHubsConnection);

        const sqlDbConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.SQL);
        const hasSqlDbConnection: boolean = !!sqlDbConnection;
        context.telemetry.properties.projectHasSqlDatabaseConnection = String(hasSqlDbConnection);


        // Ensure all the providers are registered before
        const registerProvidersTask = registerProviders(context, subscription);

        const wizardContext: IFunctionAppWizardContext = Object.assign(context, subscription.subscription, {
            newSiteKind: AppKind.functionapp,
            resourceGroupDeferLocationStep: true,
            version,
            language,
            durableStorageType,
            hasAzureStorageConnection,
            hasEventHubsConnection,
            hasSqlDbConnection,
            ...(await createActivityContext())
        });

        const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] = [];
        promptSteps.push(new SiteNameStep());
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

            if (durableStorageType) {
                // User may have already created a Resource Group during 'Create Function' or 'Debug'
                promptSteps.push(new ResourceGroupListStep());
            } else {
                executeSteps.push(new ResourceGroupCreateStep());
            }

            executeSteps.push(new AppServicePlanCreateStep());

            if (durableStorageType) {
                // User may have already created a Storage Account during 'Create Function' or 'Debug'
                promptSteps.push(new StorageAccountListStep(
                    { // INewStorageAccountDefaults
                        kind: StorageAccountKind.Storage,
                        performance: StorageAccountPerformance.Standard,
                        replication: StorageAccountReplication.LRS
                    },
                    { // IStorageAccountFilters
                        kind: [StorageAccountKind.BlobStorage],
                        performance: [StorageAccountPerformance.Premium],
                        replication: [StorageAccountReplication.ZRS],
                        learnMoreLink: 'https://aka.ms/Cfqnrc'
                    }
                ));
            } else {
                executeSteps.push(new StorageAccountCreateStep(storageAccountCreateOptions));
            }

            executeSteps.push(new LogAnalyticsCreateStep());
            executeSteps.push(new AppInsightsCreateStep());
        } else {
            promptSteps.push(new ResourceGroupListStep());
            CustomLocationListStep.addStep(wizardContext, promptSteps);
            promptSteps.push(new FunctionAppHostingPlanStep());
            promptSteps.push(new StorageAccountListStep(
                storageAccountCreateOptions,
                {
                    kind: [
                        StorageAccountKind.BlobStorage
                    ],
                    performance: [
                        StorageAccountPerformance.Premium
                    ],
                    replication: [
                        StorageAccountReplication.ZRS
                    ],
                    learnMoreLink: 'https://aka.ms/Cfqnrc'
                }
            ));
            promptSteps.push(new AppInsightsListStep());
        }

        const storageProvider = 'Microsoft.Storage';
        LocationListStep.addProviderForFiltering(wizardContext, storageProvider, 'storageAccounts');
        executeSteps.push(new FunctionAppCreateStep());

        const title: string = localize('functionAppCreatingTitle', 'Create new Function App in Azure');
        const wizard: AzureWizard<IAppServiceWizardContext> = new AzureWizard(wizardContext, { promptSteps, executeSteps, title });

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

        const resolved = new ResolvedFunctionAppResource(subscription.subscription, nonNullProp(wizardContext, 'site'));
        await ext.rgApi.tree.refresh(context);
        return new SlotTreeItem(subscription, resolved);
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
