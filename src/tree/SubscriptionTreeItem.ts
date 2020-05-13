/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient, WebSiteManagementModels } from 'azure-arm-website';
import { AppInsightsCreateStep, AppInsightsListStep, AppKind, IAppServiceWizardContext, setLocationsTask, SiteClient, SiteNameStep, SiteOSStep, WebsiteOS } from 'vscode-azureappservice';
import { AzExtTreeItem, AzureWizardExecuteStep, AzureWizardPromptStep, createAzureClient, IActionContext, INewStorageAccountDefaults, ITreeItemWizardContext, IWizardOptions, LocationListStep, parseError, ResourceGroupCreateStep, ResourceGroupListStep, StorageAccountCreateStep, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication, SubscriptionTreeItemBase, VerifyProvidersStep } from 'vscode-azureextensionui';
import { FunctionAppCreateStep } from '../commands/createFunctionApp/FunctionAppCreateStep';
import { FunctionAppHostingPlanStep } from '../commands/createFunctionApp/FunctionAppHostingPlanStep';
import { FunctionAppRuntimeStep } from '../commands/createFunctionApp/FunctionAppRuntimeStep';
import { FunctionAppSetDefaultsStep } from '../commands/createFunctionApp/FunctionAppSetDefaultsStep';
import { IFunctionAppWizardContext } from '../commands/createFunctionApp/IFunctionAppWizardContext';
import { funcVersionSetting, ProjectLanguage, projectLanguageSetting } from '../constants';
import { tryGetLocalFuncVersion } from '../funcCoreTools/tryGetLocalFuncVersion';
import { FuncVersion, latestGAVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from "../localize";
import { nonNullProp } from '../utils/nonNull';
import { getFunctionsWorkerRuntime, getWorkspaceSettingFromAnyFolder } from '../vsCodeConfig/settings';
import { ProductionSlotTreeItem } from './ProductionSlotTreeItem';

export interface ICreateFuntionAppContext extends ITreeItemWizardContext {
    newResourceGroupName?: string;
}

export class SubscriptionTreeItem extends SubscriptionTreeItemBase {
    public readonly childTypeLabel: string = localize('FunctionApp', 'Function App in Azure');
    public supportsAdvancedCreation: boolean = true;

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
                    return new ProductionSlotTreeItem(this, siteClient, site);
                }
                return undefined;
            },
            (site: WebSiteManagementModels.Site) => {
                return site.name;
            }
        );
    }

    public async getCreateSubWizardImpl(context: ICreateFuntionAppContext, advancedCreation: boolean): Promise<IWizardOptions<IFunctionAppWizardContext>> {
        const version: FuncVersion = await getDefaultFuncVersion(context);
        context.telemetry.properties.projectRuntime = version;
        const language: string | undefined = getWorkspaceSettingFromAnyFolder(projectLanguageSetting);
        context.telemetry.properties.projectLanguage = language;

        const wizardContext: IFunctionAppWizardContext = Object.assign(context, this.root, {
            newSiteKind: AppKind.functionapp,
            resourceGroupDeferLocationStep: true,
            version,
            language
        });

        const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] = [];
        promptSteps.push(new SiteNameStep());
        promptSteps.push(new FunctionAppRuntimeStep());
        promptSteps.push(new SiteOSStep());
        promptSteps.push(new FunctionAppHostingPlanStep());

        const storageAccountCreateOptions: INewStorageAccountDefaults = {
            kind: StorageAccountKind.Storage,
            performance: StorageAccountPerformance.Standard,
            replication: StorageAccountReplication.LRS
        };

        if (version === FuncVersion.v1) { // v1 doesn't support linux
            wizardContext.newSiteOS = WebsiteOS.windows;
        }

        if (!advancedCreation) {
            wizardContext.useConsumptionPlan = true;
            wizardContext.runtimeFilter = getFunctionsWorkerRuntime(language);
            if (wizardContext.runtimeFilter) {
                wizardContext.newSiteOS = language === ProjectLanguage.Python ? WebsiteOS.linux : WebsiteOS.windows;
                setLocationsTask(wizardContext);
            }
            executeSteps.push(new ResourceGroupCreateStep());
            executeSteps.push(new StorageAccountCreateStep(storageAccountCreateOptions));
            executeSteps.push(new AppInsightsCreateStep());
            executeSteps.push(new FunctionAppSetDefaultsStep());
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
            promptSteps.push(new AppInsightsListStep());
        }
        LocationListStep.addStep(wizardContext, promptSteps);

        executeSteps.push(new VerifyProvidersStep(['Microsoft.Web', 'Microsoft.Storage', 'Microsoft.Insights']));
        executeSteps.push(new FunctionAppCreateStep());

        const title: string = localize('functionAppCreatingTitle', 'Create new Function App in Azure');
        return { promptSteps, executeSteps, title };
    }

    public getNewChildLabelImpl(context: IAppServiceWizardContext): string {
        return nonNullProp(context, 'newSiteName');
    }

    public async getNewChildTreeItemImpl(context: IAppServiceWizardContext): Promise<AzExtTreeItem> {
        const site: WebSiteManagementModels.Site = nonNullProp(context, 'site');
        return new ProductionSlotTreeItem(this, new SiteClient(site, context), site);
    }
}

async function getDefaultFuncVersion(context: IActionContext): Promise<FuncVersion> {
    // Try to get VS Code setting for version (aka if they have a project open)
    let version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSettingFromAnyFolder(funcVersionSetting));
    context.telemetry.properties.runtimeSource = 'VSCodeSetting';

    if (version === undefined) {
        // Try to get the version that matches their local func cli
        version = await tryGetLocalFuncVersion();
        context.telemetry.properties.runtimeSource = 'LocalFuncCli';
    }

    if (version === undefined) {
        version = latestGAVersion;
        context.telemetry.properties.runtimeSource = 'Backup';
    }

    return version;
}
