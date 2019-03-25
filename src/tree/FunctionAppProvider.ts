/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient, WebSiteManagementModels } from 'azure-arm-website';
import { AppKind, IAppServiceWizardContext, IAppSettingsContext, SiteClient, SiteCreateStep, SiteNameStep, SiteOSStep, SiteRuntimeStep, WebsiteOS } from 'vscode-azureappservice';
import { AzureTreeItem, AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, createAzureClient, createTreeItemsWithErrorHandling, IActionContext, parseError, ResourceGroupListStep, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication, SubscriptionTreeItem } from 'vscode-azureextensionui';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting } from '../constants';
import { tryGetLocalRuntimeVersion } from '../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from "../localize";
import { convertStringToRuntime, getFuncExtensionSetting, getFunctionsWorkerRuntime } from '../ProjectSettings';
import { getCliFeedAppSettings } from '../utils/getCliFeedJson';
import { nonNullProp } from '../utils/nonNull';
import { ProductionSlotTreeItem } from './ProductionSlotTreeItem';

export class FunctionAppProvider extends SubscriptionTreeItem {
    public readonly childTypeLabel: string = localize('azFunc.FunctionApp', 'Function App in Azure');

    private _nextLink: string | undefined;

    public hasMoreChildrenImpl(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzureTreeItem[]> {
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
                // In that case, we know there are no function apps, so we can return an empty array
                // (The provider will be registered automatically if the user creates a new function app)
                return [];
            } else {
                throw error;
            }
        }

        this._nextLink = webAppCollection.nextLink;

        return await createTreeItemsWithErrorHandling(
            this,
            webAppCollection,
            'azFuncInvalidFunctionApp',
            (site: WebSiteManagementModels.Site) => {
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

    public async createChildImpl(showCreatingTreeItem: (label: string) => void, userOptions?: { actionContext: IActionContext; resourceGroup?: string }): Promise<AzureTreeItem> {
        // Ideally actionContext should always be defined, but there's a bug with the NodePicker. Create a 'fake' actionContext until that bug is fixed
        // https://github.com/Microsoft/vscode-azuretools/issues/120
        // tslint:disable-next-line:strict-boolean-expressions
        const actionContext: IActionContext = userOptions ? userOptions.actionContext : <IActionContext>{ properties: {}, measurements: {} };
        const resourceGroup: string | undefined = userOptions ? userOptions.resourceGroup : undefined;
        const runtime: ProjectRuntime = await getDefaultRuntime(actionContext);
        const language: string | undefined = getFuncExtensionSetting(projectLanguageSetting);

        const wizardContext: IAppServiceWizardContext = {
            newSiteKind: AppKind.functionapp,
            subscriptionId: this.root.subscriptionId,
            subscriptionDisplayName: this.root.subscriptionDisplayName,
            credentials: this.root.credentials,
            environment: this.root.environment,
            newResourceGroupName: resourceGroup,
            resourceGroupDeferLocationStep: true
        };

        if (!getFuncExtensionSetting('advancedCreation')) {
            actionContext.properties.advancedCreation = 'false';
            setBasicCreateDefaults(wizardContext, language);
        } else {
            actionContext.properties.advancedCreation = 'true';
        }

        const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [];
        promptSteps.push(new SiteNameStep());
        promptSteps.push(new ResourceGroupListStep());
        promptSteps.push(new SiteOSStep());
        promptSteps.push(new SiteRuntimeStep());
        promptSteps.push(new StorageAccountListStep(
            {
                kind: StorageAccountKind.Storage,
                performance: StorageAccountPerformance.Standard,
                replication: StorageAccountReplication.LRS
            },
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

        const executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] = [new SiteCreateStep(
            async (context: IAppSettingsContext): Promise<WebSiteManagementModels.NameValuePair[]> => await createFunctionAppSettings(context, runtime, language)
        )];

        const title: string = localize('functionAppCreatingTitle', 'Create new function app');
        const wizard: AzureWizard<IAppServiceWizardContext> = new AzureWizard(wizardContext, { promptSteps, executeSteps, title });

        await wizard.prompt(actionContext);
        showCreatingTreeItem(nonNullProp(wizardContext, 'newSiteName'));
        await wizard.execute(actionContext);

        actionContext.properties.os = wizardContext.newSiteOS;
        actionContext.properties.runtime = wizardContext.newSiteRuntime;

        const site: WebSiteManagementModels.Site = nonNullProp(wizardContext, 'site');
        return new ProductionSlotTreeItem(this, new SiteClient(site, this.root));
    }
}

function setBasicCreateDefaults(wizardContext: IAppServiceWizardContext, language: string | undefined): void {
    wizardContext.newSiteOS = language === ProjectLanguage.Python ? WebsiteOS.linux : WebsiteOS.windows;
    wizardContext.newSiteRuntime = getFunctionsWorkerRuntime(language);
    SiteOSStep.setLocationsTask(wizardContext);
}

async function getDefaultRuntime(actionContext: IActionContext): Promise<ProjectRuntime> {
    // Try to get VS Code setting for runtime (aka if they have a project open)
    let runtime: string | undefined = convertStringToRuntime(getFuncExtensionSetting(projectRuntimeSetting));
    actionContext.properties.runtimeSource = 'VSCodeSetting';

    if (!runtime) {
        // Try to get the runtime that matches their local func cli version
        runtime = await tryGetLocalRuntimeVersion();
        actionContext.properties.runtimeSource = 'LocalFuncCli';
    }

    if (!runtime) {
        // Default to v2 if all else fails
        runtime = ProjectRuntime.v2;
        actionContext.properties.runtimeSource = 'Backup';
    }

    actionContext.properties.projectRuntime = runtime;

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
