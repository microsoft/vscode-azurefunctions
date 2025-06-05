/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type FunctionsDeploymentStorageAuthentication, type NameValuePair, type Site, type SiteConfig, type WebSiteManagementClient } from '@azure/arm-appservice';
import { type Identity } from '@azure/arm-resources';
import { type StorageAccount } from '@azure/arm-storage';
import { createHttpHeaders, createPipelineRequest } from '@azure/core-rest-pipeline';
import { BlobServiceClient } from '@azure/storage-blob';
import { createWebSiteClient, DomainNameLabelScope, ParsedSite, WebsiteOS, type CustomLocation, type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { createGenericClient, LocationListStep, type AzExtPipelineResponse, type AzExtRequestPrepareOptions } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStepWithActivityOutput, maskUserInfo, nonNullProp, nonNullValueAndProp, parseError, randomUtils } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { FuncVersion, getMajorVersion } from '../../FuncVersion';
import { ConnectionKey, contentConnectionStringKey, contentShareKey, extensionVersionKey, ProjectLanguage, runFromPackageKey, webProvider } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { getRandomHexString } from '../../utils/fs';
import { createAzureWebJobsStorageManagedIdentitySettings } from '../../utils/managedIdentityUtils';
import { getStorageConnectionString } from '../appSettings/connectionSettings/getLocalConnectionSetting';
import { enableFileLogging } from '../logstream/enableFileLogging';
import { type FullFunctionAppStack, type IFlexFunctionAppWizardContext, type IFunctionAppWizardContext } from './IFunctionAppWizardContext';
import { type FunctionAppConfigPayload, type SitePayload } from './domainNameLabelScopeTypes';
import { type Sku } from './stacks/models/FlexSkuModel';
import { type FunctionAppRuntimeSettings, } from './stacks/models/FunctionAppStackModel';

export class FunctionAppCreateStep extends AzureWizardExecuteStepWithActivityOutput<IFunctionAppWizardContext> {
    stepName: string = 'createFunctionAppStep';
    public priority: number = 1000;

    public async execute(context: IFlexFunctionAppWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const os: WebsiteOS = nonNullProp(context, 'newSiteOS');
        const stack: FullFunctionAppStack = nonNullProp(context, 'newSiteStack');

        context.telemetry.properties.newSiteOS = os;
        context.telemetry.properties.newSiteStack = stack.stack.value;
        context.telemetry.properties.newSiteMajorVersion = stack.majorVersion.value;
        context.telemetry.properties.newSiteMinorVersion = stack.minorVersion.value;
        context.telemetry.properties.planSkuTier = context.plan?.sku?.tier;

        const message: string = localize('creatingFuncApp', 'Creating function app "{0}"...', context.newSiteName);
        progress.report({ message });

        const siteName: string = nonNullProp(context, 'newSiteName');
        const rgName: string = nonNullProp(nonNullProp(context, 'resourceGroup'), 'name');

        context.site = await this.createFunctionApp(context, rgName, siteName, stack);

        const site = new ParsedSite(context.site, context);
        if (!site.isLinux) { // not supported on linux
            try {
                await enableFileLogging(context, site);
            } catch (error) {
                // optional part of creating function app, so not worth blocking on error
                context.telemetry.properties.fileLoggingError = maskUserInfo(parseError(error).message, []);
            }
        }
    }

    public shouldExecute(context: IFunctionAppWizardContext): boolean {
        return !context.site;
    }

    async createFunctionApp(context: IFlexFunctionAppWizardContext, rgName: string, siteName: string, stack: FullFunctionAppStack): Promise<Site> {
        let site: Site;
        if (context.newSiteDomainNameLabelScope === DomainNameLabelScope.Global) {
            site = await this.createSite(context, rgName, siteName, stack);
        } else {
            site = await this.createSiteWithDomainLabelScope(context, rgName, siteName, stack);
        }

        if (context.newFlexSku) {
            if (context.storageAccount) {
                await tryCreateStorageContainer(context, site, context.storageAccount);
            }
        }

        return site;
    }

    // #region createSite
    private async createSite(context: IFlexFunctionAppWizardContext, rgName: string, siteName: string, stack?: FullFunctionAppStack): Promise<Site> {
        const client: WebSiteManagementClient = await createWebSiteClient(context);
        const site: Site = context.newFlexSku ?
            await this.getNewFlexSite(context, context.newFlexSku) :
            await this.getNewSite(context, stack);
        return await client.webApps.beginCreateOrUpdateAndWait(rgName, siteName, site)
    }

    private async getNewFlexSite(context: IFlexFunctionAppWizardContext, sku: Sku): Promise<Site> {
        const site: Site = await this.getNewBaseSite(context);
        site.functionAppConfig = this.getNewFlexFunctionAppConfig(context, sku);
        return site;
    }

    private async getNewSite(context: IFunctionAppWizardContext, stack?: FullFunctionAppStack): Promise<Site> {
        const site: Site = await this.getNewBaseSite(context, stack);
        site.reserved = context.newSiteOS === WebsiteOS.linux;  // The secret property - must be set to true to make it a Linux plan. Confirmed by the team who owns this API.

        if (context.customLocation) {
            this.addCustomLocationProperties(site, context.customLocation);
        }

        // Always on setting added for App Service plans excluding the free tier https://github.com/microsoft/vscode-azurefunctions/issues/3037
        if (context.plan?.sku?.family) {
            const isNotFree = context.plan.sku.family.toLowerCase() !== 'f';
            const isNotElasticPremium = context.plan.sku.family.toLowerCase() !== 'ep';
            const isNotConsumption: boolean = context.plan.sku.family.toLowerCase() !== 'y';
            if (isNotFree && isNotElasticPremium && isNotConsumption) {
                nonNullProp(site, 'siteConfig').alwaysOn = true;
            }
        }

        return site;
    }

    private addCustomLocationProperties(site: Site, customLocation: CustomLocation): void {
        nonNullProp(site, 'siteConfig').alwaysOn = true;
        site.extendedLocation = { name: customLocation.id, type: 'customLocation' };
    }
    // #endregion

    // #region createSiteWithDomainLabelScope
    private async createSiteWithDomainLabelScope(context: IFlexFunctionAppWizardContext, rgName: string, siteName: string, stack?: FullFunctionAppStack): Promise<Site> {
        const sitePayload: SitePayload = context.newFlexSku ?
            await this.getNewFlexSiteWithDomainLabelScope(context, context.newFlexSku) :
            await this.getNewSiteWithDomainLabelScope(context, stack);

        // The SDK does not currently support this updated api version, so we should make the call to the endpoint manually until the SDK gets updated
        const apiVersion = '2024-04-01';
        const authToken = (await context.credentials.getToken() as { token?: string }).token;
        const options: AzExtRequestPrepareOptions = {
            url: `${context.environment.resourceManagerEndpointUrl}subscriptions/${context.subscriptionId}/resourceGroups/${rgName}/providers/Microsoft.Web/sites/${siteName}?api-version=${apiVersion}`,
            method: 'PUT',
            headers: createHttpHeaders({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            }),
            body: JSON.stringify(sitePayload),
        };

        const client = await createGenericClient(context, undefined);
        // We don't care about storing the response here because the manual response returned is different from the SDK formatting that our code expects.
        // The stored site should come from the SDK instead.
        await client.sendRequest(createPipelineRequest(options)) as AzExtPipelineResponse;

        const sdkClient: WebSiteManagementClient = await createWebSiteClient(context);
        return await sdkClient.webApps.get(rgName, siteName);
    }

    private async getNewFlexSiteWithDomainLabelScope(context: IFlexFunctionAppWizardContext, sku: Sku): Promise<SitePayload> {
        const baseSite: Site = await this.getNewBaseSite(context);
        const sitePayload: SitePayload = {
            name: baseSite.name,
            kind: baseSite.kind,
            location: baseSite.location,
            identity: baseSite.identity ? {
                type: baseSite.identity.type,
                userAssignedIdentities: Object.fromEntries(
                    // Convert to an object with key-value pairs that look like - "userAssignedIdentityResourceId": {}
                    Object.keys(baseSite.identity.userAssignedIdentities ?? {}).map((id) => [id, {}])
                ),
            } : undefined,
            properties: {
                autoGeneratedDomainNameLabelScope: context.newSiteDomainNameLabelScope,
                serverFarmId: baseSite.serverFarmId,
                clientAffinityEnabled: baseSite.clientAffinityEnabled,
                siteConfig: baseSite.siteConfig,
                functionAppConfig: this.getNewFlexFunctionAppConfig(context, sku),
            },
        };
        return sitePayload;
    }

    private async getNewSiteWithDomainLabelScope(context: IFunctionAppWizardContext, stack?: FullFunctionAppStack): Promise<SitePayload> {
        const baseSite: Site = await this.getNewBaseSite(context, stack);
        const sitePayload: SitePayload = {
            name: baseSite.name,
            kind: baseSite.kind,
            location: baseSite.location,
            identity: baseSite.identity ? {
                type: baseSite.identity.type,
                userAssignedIdentities: Object.fromEntries(
                    // Convert to an object with key-value pairs that look like - "userAssignedIdentityResourceId": {}
                    Object.keys(baseSite.identity.userAssignedIdentities ?? {}).map((id) => [id, {}])
                ),
            } : undefined,
            properties: {
                autoGeneratedDomainNameLabelScope: context.newSiteDomainNameLabelScope,
                serverFarmId: baseSite.serverFarmId,
                clientAffinityEnabled: baseSite.clientAffinityEnabled,
                reserved: context.newSiteOS === WebsiteOS.linux,  // The secret property - must be set to true to make it a Linux plan. Confirmed by the team who owns this API.
                siteConfig: baseSite.siteConfig,
            },
        };

        if (context.customLocation) {
            this.addCustomLocationPropertiesToSitePayload(sitePayload, context.customLocation);
        }

        // Always on setting added for App Service plans excluding the free tier https://github.com/microsoft/vscode-azurefunctions/issues/3037
        if (context.plan?.sku?.family) {
            const isNotFree = context.plan.sku.family.toLowerCase() !== 'f';
            const isNotElasticPremium = context.plan.sku.family.toLowerCase() !== 'ep';
            const isNotConsumption: boolean = context.plan.sku.family.toLowerCase() !== 'y';
            if (isNotFree && isNotElasticPremium && isNotConsumption) {
                nonNullValueAndProp(sitePayload.properties, 'siteConfig').alwaysOn = true;
            }
        }

        return sitePayload;
    }

    private addCustomLocationPropertiesToSitePayload(sitePayload: SitePayload, customLocation: CustomLocation): void {
        nonNullValueAndProp(sitePayload.properties, 'siteConfig').alwaysOn = true;
        sitePayload.extendedLocation = { name: customLocation.id, type: 'customLocation' };
    }
    // #endregion

    // #region common
    private async getNewBaseSite(context: IFunctionAppWizardContext, stack?: FullFunctionAppStack): Promise<Site> {
        const location = await LocationListStep.getLocation(context, webProvider);
        let identity: Identity | undefined = undefined;
        if (context.managedIdentity) {
            const userAssignedIdentities = {};
            userAssignedIdentities[nonNullProp(context.managedIdentity, 'id')] =
                { principalId: context.managedIdentity?.principalId, clientId: context.managedIdentity?.clientId };
            identity = { type: 'UserAssigned', userAssignedIdentities }
        }

        return {
            name: context.newSiteName,
            kind: getSiteKind(context),
            location: nonNullProp(location, 'name'),
            serverFarmId: context.plan?.id,
            clientAffinityEnabled: false,
            siteConfig: await this.getNewBaseSiteConfig(context, stack),
            identity
        };
    }

    private async getNewBaseSiteConfig(context: IFunctionAppWizardContext, stack?: FullFunctionAppStack): Promise<SiteConfig> {
        let newSiteConfig: SiteConfig = {};
        const storageConnectionString: string = (await getStorageConnectionString(context)).connectionString;

        let appSettings: NameValuePair[] = [];
        if (context.managedIdentity) {
            appSettings.push(...createAzureWebJobsStorageManagedIdentitySettings(context));
        } else {
            appSettings.push({
                name: ConnectionKey.Storage,
                value: storageConnectionString
            });
        }

        if (stack) {
            const stackSettings: FunctionAppRuntimeSettings = nonNullProp(stack.minorVersion.stackSettings, context.newSiteOS === WebsiteOS.linux ? 'linuxRuntimeSettings' : 'windowsRuntimeSettings');
            newSiteConfig = stackSettings.siteConfigPropertiesDictionary;
            appSettings = appSettings.concat(
                [{
                    name: extensionVersionKey,
                    value: '~' + getMajorVersion(context.version)
                }],
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                ...Object.entries(stackSettings.appSettingsDictionary).map(([name, value]) => { return { name, value }; }));
        }

        // This setting only applies for v1 https://github.com/Microsoft/vscode-azurefunctions/issues/640
        if (context.version === FuncVersion.v1) {
            appSettings.push({
                name: 'AzureWebJobsDashboard',
                value: storageConnectionString
            });
        }

        const isElasticPremium: boolean = context.plan?.sku?.family?.toLowerCase() === 'ep';
        const isConsumption: boolean = context.plan?.sku?.family?.toLowerCase() === 'y';
        // no stack means it's a flex app
        const isFlex: boolean = !stack;
        if (isConsumption || isElasticPremium) {
            // WEBSITE_CONTENT* settings are added for consumption/premium plans, but not dedicated
            // https://github.com/microsoft/vscode-azurefunctions/issues/1702
            appSettings.push({
                name: contentConnectionStringKey,
                value: storageConnectionString
            });
            appSettings.push({
                name: contentShareKey,
                value: getNewFileShareName(nonNullProp(context, 'newSiteName'))
            });
            // only add this setting for flex apps, if we're not using managed identity
        } else if (isFlex && !context.managedIdentity) {
            appSettings.push({
                name: 'DEPLOYMENT_STORAGE_CONNECTION_STRING',
                value: storageConnectionString
            })
        }

        // This setting is not required, but we will set it since it has many benefits https://docs.microsoft.com/en-us/azure/azure-functions/run-functions-from-deployment-package
        // That being said, it doesn't work on v1 C# Script https://github.com/Microsoft/vscode-azurefunctions/issues/684
        // It also doesn't apply for Linux
        if (context.newSiteOS === WebsiteOS.windows && !(context.language === ProjectLanguage.CSharpScript && context.version === FuncVersion.v1)) {
            appSettings.push({
                name: runFromPackageKey,
                value: '1'
            });
        }

        if (context.appInsightsComponent) {
            appSettings.push({
                name: 'APPLICATIONINSIGHTS_CONNECTION_STRING',
                value: context.appInsightsComponent.connectionString
            });

            if (isElasticPremium && context.newSiteStack?.stack.value === 'java') {
                // turn on full monitoring for Java on Elastic Premium
                appSettings.push({
                    name: 'APPLICATIONINSIGHTS_ENABLE_AGENT',
                    value: 'true'
                });
            }

        }

        newSiteConfig.appSettings = appSettings;
        return newSiteConfig;
    }

    private getNewFlexFunctionAppConfig(context: IFlexFunctionAppWizardContext, sku: Sku): FunctionAppConfigPayload {
        return {
            deployment: {
                storage: {
                    type: 'blobContainer',
                    value: `${context.storageAccount?.primaryEndpoints?.blob}app-package-${context.newSiteName?.substring(0, 32)}-${randomUtils.getRandomHexString(7)}`,
                    authentication: this.createDeploymentStorageAuthentication(context)
                }
            },
            runtime: {
                name: sku.functionAppConfigProperties.runtime.name,
                version: sku.functionAppConfigProperties.runtime.version
            },
            scaleAndConcurrency: {
                maximumInstanceCount: context.newFlexMaximumInstanceCount ?? sku.maximumInstanceCount.defaultValue,
                instanceMemoryMB: context.newFlexInstanceMemoryMB ?? sku.instanceMemoryMB.find(im => im.isDefault)?.size ?? 2048,
                alwaysReady: [],
                triggers: undefined
            },
        };
    }

    private createDeploymentStorageAuthentication(context: IFlexFunctionAppWizardContext): FunctionsDeploymentStorageAuthentication {
        const hasManagedIdentity: boolean = !!context.managedIdentity;
        return {
            userAssignedIdentityResourceId: hasManagedIdentity ? context.managedIdentity?.id : undefined,
            type: hasManagedIdentity ? 'UserAssignedIdentity' : 'StorageAccountConnectionString',
            storageAccountConnectionStringName: hasManagedIdentity ? undefined : 'DEPLOYMENT_STORAGE_CONNECTION_STRING',
        };
    }
    // #endregion

    // #region executeActivityOutput
    protected getTreeItemLabel(context: IFunctionAppWizardContext): string {
        const siteName: string = nonNullProp(context, 'newSiteName');
        return localize('creatingNewApp', 'Create function app "{0}"', siteName);
    }
    protected getOutputLogSuccess(context: IFunctionAppWizardContext): string {
        const siteName: string = nonNullProp(context, 'newSiteName');
        return localize('createdNewApp', 'Successfully created function app "{0}".', siteName);
    }
    protected getOutputLogFail(context: IFunctionAppWizardContext): string {
        const siteName: string = nonNullProp(context, 'newSiteName');
        return localize('failedToCreateNewApp', 'Failed to create function app "{0}".', siteName);
    }
    protected getOutputLogProgress(context: IFunctionAppWizardContext): string {
        const siteName: string = nonNullProp(context, 'newSiteName');
        return localize('creatingNewApp', 'Creating function app "{0}"...', siteName);
    }
    // #endregion
}

function getNewFileShareName(siteName: string): string {
    const randomLetters: number = 6;
    const maxFileShareNameLength: number = 63;
    return siteName.toLowerCase().substr(0, maxFileShareNameLength - randomLetters) + getRandomHexString(randomLetters);
}

function getSiteKind(context: IAppServiceWizardContext): string {
    let kind: string = context.newSiteKind;
    if (context.newSiteOS === 'linux') {
        kind += ',linux';
    }
    if (context.customLocation) {
        kind += ',kubernetes';
    }
    return kind;
}

// storage container is needed for flex deployment, but it is not created automatically
async function tryCreateStorageContainer(context: IFlexFunctionAppWizardContext, site: Site, storageAccount: StorageAccount): Promise<void> {
    let client: BlobServiceClient;
    try {
        const token = await context.createCredentialsForScopes(['https://storage.azure.com/.default'])
        const primaryEndpoint = nonNullProp(storageAccount, 'primaryEndpoints');
        client = new BlobServiceClient(nonNullProp(primaryEndpoint, 'blob'), token);
        await client.getProperties(); // Trigger a request to validate the token
    } catch (error) {
        const storageConnectionString: string = (await getStorageConnectionString(context)).connectionString;
        client = BlobServiceClient.fromConnectionString(storageConnectionString);
        await client.getProperties(); // Trigger a request to validate the key
    }

    try {
        const containerUrl: string | undefined = site.functionAppConfig?.deployment?.storage?.value;
        if (containerUrl) {
            const containerName = containerUrl.split('/').pop();
            if (containerName) {
                const containerClient = client.getContainerClient(containerName);
                if (!await containerClient.exists()) {
                    await client.createContainer(containerName);
                    return
                } else {
                    ext.outputChannel.appendLog(localize('deploymentStorageExists', 'Deployment storage container "{0}" already exists.', containerName));
                    return;
                }
            }
        }
    } catch (error) {
        // ignore error, we will show a warning in the output channel
        const parsedError = parseError(error);
        ext.outputChannel.appendLog(localize('failedToCreateDeploymentStorage', 'Failed to create deployment storage container. {0}', parsedError.message));
    }

    ext.outputChannel.appendLog(localize('noDeploymentStorage', 'No deployment storage specified in function app.'));
    return;
}
