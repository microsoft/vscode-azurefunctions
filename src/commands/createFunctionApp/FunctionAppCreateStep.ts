/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type FunctionsDeploymentStorageAuthentication, type NameValuePair, type Site, type SiteConfig, type WebSiteManagementClient } from '@azure/arm-appservice';
import { type Identity } from '@azure/arm-resources';
import { type StorageAccount } from '@azure/arm-storage';
import { BlobServiceClient } from '@azure/storage-blob';
import { ParsedSite, WebsiteOS, type CustomLocation, type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { LocationListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStepWithActivityOutput, maskUserInfo, nonNullProp, parseError, randomUtils } from '@microsoft/vscode-azext-utils';
import { type AppResource } from '@microsoft/vscode-azext-utils/hostapi';
import { type Progress } from 'vscode';
import { FuncVersion, getMajorVersion } from '../../FuncVersion';
import { ConnectionKey, ProjectLanguage, contentConnectionStringKey, contentShareKey, extensionVersionKey, runFromPackageKey, webProvider } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { createWebSiteClient } from '../../utils/azureClients';
import { getRandomHexString } from '../../utils/fs';
import { createAzureWebJobsStorageManagedIdentitySettings } from '../../utils/managedIdentityUtils';
import { getStorageConnectionString } from '../appSettings/connectionSettings/getLocalConnectionSetting';
import { enableFileLogging } from '../logstream/enableFileLogging';
import { type FullFunctionAppStack, type IFlexFunctionAppWizardContext, type IFunctionAppWizardContext } from './IFunctionAppWizardContext';
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
        context.activityResult = context.site as AppResource;

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

    private async getNewSite(context: IFunctionAppWizardContext, stack: FullFunctionAppStack): Promise<Site> {
        const site: Site = await this.createNewSite(context, stack);
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

    private async getNewFlexSite(context: IFlexFunctionAppWizardContext, sku: Sku): Promise<Site> {
        const site: Site = await this.createNewSite(context);
        site.functionAppConfig = {
            deployment: {
                storage: {
                    type: 'blobContainer',
                    value: `${context.storageAccount?.primaryEndpoints?.blob}app-package-${context.newSiteName?.substring(0, 32)?.toLowerCase()}-${randomUtils.getRandomHexString(7)}`,
                    authentication: createDeploymentStorageAuthentication(context)
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
        }

        return site;

        function createDeploymentStorageAuthentication(context: IFlexFunctionAppWizardContext): FunctionsDeploymentStorageAuthentication {
            const hasManagedIdentity: boolean = !!context.managedIdentity;
            return {
                userAssignedIdentityResourceId: hasManagedIdentity ? context.managedIdentity?.id : undefined,
                type: hasManagedIdentity ? 'UserAssignedIdentity' : 'StorageAccountConnectionString',
                storageAccountConnectionStringName: hasManagedIdentity ? undefined : 'DEPLOYMENT_STORAGE_CONNECTION_STRING',
            };
        }
    }

    private async createNewSite(context: IFunctionAppWizardContext, stack?: FullFunctionAppStack): Promise<Site> {
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
            siteConfig: await this.getNewSiteConfig(context, stack),
            identity
        };
    }

    private async getNewSiteConfig(context: IFunctionAppWizardContext, stack?: FullFunctionAppStack): Promise<SiteConfig> {
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

    async createFunctionApp(context: IFlexFunctionAppWizardContext, rgName: string, siteName: string, stack: FullFunctionAppStack): Promise<Site> {
        const client: WebSiteManagementClient = await createWebSiteClient(context);
        const site = context.newFlexSku ?
            await this.getNewFlexSite(context, context.newFlexSku) :
            await this.getNewSite(context, stack);
        const result = await client.webApps.beginCreateOrUpdateAndWait(rgName, siteName, site);

        if (context.newFlexSku) {
            if (context.storageAccount) {
                await tryCreateStorageContainer(context, result, context.storageAccount);
            }
        }

        return result;
    }

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
