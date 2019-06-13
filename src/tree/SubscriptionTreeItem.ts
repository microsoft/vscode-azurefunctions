/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient, WebSiteManagementModels } from 'azure-arm-website';
import { MessageItem } from 'vscode';
import { AppKind, IAppServiceWizardContext, IAppSettingsContext, SiteClient, SiteCreateStep, SiteHostingPlanStep, SiteNameStep, SiteOSStep, SiteRuntimeStep, WebsiteOS } from 'vscode-azureappservice';
import { AzExtTreeItem, AzureTreeItem, AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, createAzureClient, IActionContext, ICreateChildImplContext, INewStorageAccountDefaults, LocationListStep, parseError, ResourceGroupCreateStep, ResourceGroupListStep, StorageAccountCreateStep, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication, SubscriptionTreeItemBase } from 'vscode-azureextensionui';
import { extensionPrefix, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting } from '../constants';
import { ext } from '../extensionVariables';
import { tryGetLocalRuntimeVersion } from '../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from "../localize";
import { getCliFeedAppSettings } from '../utils/getCliFeedJson';
import { nonNullProp } from '../utils/nonNull';
import { convertStringToRuntime, getFunctionsWorkerRuntime, getWorkspaceSetting, getWorkspaceSettingFromAnyFolder, updateGlobalSetting } from '../vsCodeConfig/settings';
import { isLocalTreeItem } from './localProject/LocalTreeItem';
import { ProductionSlotTreeItem } from './ProductionSlotTreeItem';

export class SubscriptionTreeItem extends SubscriptionTreeItemBase {
    public readonly childTypeLabel: string = localize('azFunc.FunctionApp', 'Function App in Azure');

    private _nextLink: string | undefined;

    public hasMoreChildrenImpl(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const client: WebSiteManagementClient = createAzureClient(this.root, WebSiteManagementClient);
        let webAppCollection: WebSiteManagementModels.WebAppCollection;
        try {
            webAppCollection = this._nextLink === undefined ?
                await client.webApps.list() :
                await client.webApps.listNext(this._nextLink);
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

        this._nextLink = webAppCollection.nextLink;

        return await this.createTreeItemsWithErrorHandling(
            webAppCollection,
            'azFuncInvalidFunctionApp',
            async (site: WebSiteManagementModels.Site) => {
                const siteClient: SiteClient = new SiteClient(site, this.root);
                if (siteClient.isFunctionApp) {
                    return new ProductionSlotTreeItem(this, siteClient);
                }
                return undefined;
            },
            (site: WebSiteManagementModels.Site) => {
                return site.name;
            }
        );
    }

    public async createChildImpl(context: ICreateChildImplContext & { newResourceGroupName?: string }): Promise<AzureTreeItem> {
        const runtime: ProjectRuntime = await getDefaultRuntime(context);
        const language: string | undefined = getWorkspaceSettingFromAnyFolder(projectLanguageSetting);

        const wizardContext: IAppServiceWizardContext = Object.assign(context, this.root, {
            newSiteKind: AppKind.functionapp,
            resourceGroupDeferLocationStep: true
        });

        const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] = [];
        promptSteps.push(new SiteNameStep());
        promptSteps.push(new SiteOSStep());
        promptSteps.push(new SiteHostingPlanStep());
        promptSteps.push(new SiteRuntimeStep());

        const storageAccountCreateOptions: INewStorageAccountDefaults = {
            kind: StorageAccountKind.Storage,
            performance: StorageAccountPerformance.Standard,
            replication: StorageAccountReplication.LRS
        };

        const advancedCreationKey: string = 'advancedCreation';
        const advancedCreation: boolean = !!getWorkspaceSetting(advancedCreationKey);
        context.telemetry.properties.advancedCreation = String(advancedCreation);
        if (!advancedCreation) {
            wizardContext.useConsumptionPlan = true;
            wizardContext.newSiteOS = language === ProjectLanguage.Python ? WebsiteOS.linux : WebsiteOS.windows;
            wizardContext.newSiteRuntime = getFunctionsWorkerRuntime(language);
            // Pick a region that works for both windows and linux. Pricing seems to be same in all regions as of this writing anyways.
            await LocationListStep.setLocation(wizardContext, 'westus');
            executeSteps.push(new ResourceGroupCreateStep());
            executeSteps.push(new StorageAccountCreateStep(storageAccountCreateOptions));
        } else {
            promptSteps.push(new ResourceGroupListStep());
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
        }

        executeSteps.push(new SiteCreateStep(async (appSettingsContext): Promise<WebSiteManagementModels.NameValuePair[]> => await createFunctionAppSettings(appSettingsContext, runtime, language)));

        const title: string = localize('functionAppCreatingTitle', 'Create new Function App in Azure');
        const wizard: AzureWizard<IAppServiceWizardContext> = new AzureWizard(wizardContext, { promptSteps, executeSteps, title });

        await wizard.prompt();
        context.showCreatingTreeItem(nonNullProp(wizardContext, 'newSiteName'));
        context.telemetry.properties.os = wizardContext.newSiteOS;
        context.telemetry.properties.runtime = wizardContext.newSiteRuntime;
        if (!advancedCreation) {
            const newName: string | undefined = await wizardContext.relatedNameTask;
            if (!newName) {
                throw new Error(localize('noUniqueName', 'Failed to generate unique name for resources. Modify the setting "{0}" to manually enter resource names.', `${extensionPrefix}.${advancedCreationKey}`));
            }
            wizardContext.newResourceGroupName = context.newResourceGroupName || newName;
            wizardContext.newStorageAccountName = newName;
        }

        try {
            await wizard.execute();
        } catch (error) {
            if (!parseError(error).isUserCancelledError && !advancedCreation) {
                const message: string = localize('tryAdvancedCreate', 'Modify the setting "{0}.{1}" if you want to change the default values when creating a Function App in Azure.', extensionPrefix, advancedCreationKey);
                const btn: MessageItem = { title: localize('turnOn', 'Turn on advanced creation') };
                // tslint:disable-next-line: no-floating-promises
                ext.ui.showWarningMessage(message, btn).then(async result => {
                    if (result === btn) {
                        await updateGlobalSetting(advancedCreationKey, true);
                    }
                });
            }

            throw error;
        }

        const site: WebSiteManagementModels.Site = nonNullProp(wizardContext, 'site');
        return new ProductionSlotTreeItem(this, new SiteClient(site, this.root));
    }

    public isAncestorOfImpl(contextValue: string | RegExp): boolean {
        return !isLocalTreeItem(contextValue);
    }
}

async function getDefaultRuntime(context: IActionContext): Promise<ProjectRuntime> {
    // Try to get VS Code setting for runtime (aka if they have a project open)
    let runtime: string | undefined = convertStringToRuntime(getWorkspaceSettingFromAnyFolder(projectRuntimeSetting));
    context.telemetry.properties.runtimeSource = 'VSCodeSetting';

    if (!runtime) {
        // Try to get the runtime that matches their local func cli version
        runtime = await tryGetLocalRuntimeVersion();
        context.telemetry.properties.runtimeSource = 'LocalFuncCli';
    }

    if (!runtime) {
        // Default to v2 if all else fails
        runtime = ProjectRuntime.v2;
        context.telemetry.properties.runtimeSource = 'Backup';
    }

    context.telemetry.properties.projectRuntime = runtime;

    return <ProjectRuntime>runtime;
}

async function createFunctionAppSettings(context: IAppSettingsContext, projectRuntime: ProjectRuntime, projectLanguage: string | undefined): Promise<WebSiteManagementModels.NameValuePair[]> {
    const appSettings: WebSiteManagementModels.NameValuePair[] = [];

    const cliFeedAppSettings: { [key: string]: string } = await getCliFeedAppSettings(projectRuntime);
    for (const key of Object.keys(cliFeedAppSettings)) {
        appSettings.push({
            name: key,
            value: cliFeedAppSettings[key]
        });
    }

    appSettings.push({
        name: 'AzureWebJobsStorage',
        value: context.storageConnectionString
    });

    // This setting only applies for v1 https://github.com/Microsoft/vscode-azurefunctions/issues/640
    if (projectRuntime === ProjectRuntime.v1) {
        appSettings.push({
            name: 'AzureWebJobsDashboard',
            value: context.storageConnectionString
        });
    }

    // These settings only apply for Windows https://github.com/Microsoft/vscode-azurefunctions/issues/625
    if (context.os === 'windows') {
        appSettings.push({
            name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING',
            value: context.storageConnectionString
        });
        appSettings.push({
            name: 'WEBSITE_CONTENTSHARE',
            value: context.fileShareName
        });
    }

    if (context.runtime) {
        appSettings.push({
            name: 'FUNCTIONS_WORKER_RUNTIME',
            value: context.runtime
        });
    }

    // This setting is not required, but we will set it since it has many benefits https://docs.microsoft.com/en-us/azure/azure-functions/run-functions-from-deployment-package
    // That being said, it doesn't work on v1 C# Script https://github.com/Microsoft/vscode-azurefunctions/issues/684
    // It also doesn't apply for Linux Consumption, which has its own custom deploy logic in the the vscode-azureappservice package
    if (context.os !== 'linux' && !(projectLanguage === ProjectLanguage.CSharpScript && projectRuntime === ProjectRuntime.v1)) {
        appSettings.push({
            name: 'WEBSITE_RUN_FROM_PACKAGE',
            value: '1'
        });
    }

    return appSettings;
}
