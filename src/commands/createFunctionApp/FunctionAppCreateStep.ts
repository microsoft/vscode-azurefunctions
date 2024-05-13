/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type NameValuePair, type Site, type SiteConfig, type WebSiteManagementClient } from '@azure/arm-appservice';
import { createHttpHeaders, createPipelineRequest, type RequestBodyType } from '@azure/core-rest-pipeline';
import { BlobServiceClient } from '@azure/storage-blob';
import { ParsedSite, WebsiteOS, type CustomLocation, type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { LocationListStep, createGenericClient, type AzExtPipelineResponse, type AzExtRequestPrepareOptions } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, parseError, randomUtils } from '@microsoft/vscode-azext-utils';
import { type AppResource } from '@microsoft/vscode-azext-utils/hostapi';
import { type Progress } from 'vscode';
import { FuncVersion, getMajorVersion } from '../../FuncVersion';
import { ConnectionKey, ProjectLanguage, contentConnectionStringKey, contentShareKey, extensionVersionKey, runFromPackageKey, webProvider } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { createWebSiteClient } from '../../utils/azureClients';
import { getRandomHexString } from '../../utils/fs';
import { nonNullProp } from '../../utils/nonNull';
import { getStorageConnectionString } from '../appSettings/connectionSettings/getLocalConnectionSetting';
import { enableFileLogging } from '../logstream/enableFileLogging';
import { type FullFunctionAppStack, type IFlexFunctionAppWizardContext, type IFunctionAppWizardContext } from './IFunctionAppWizardContext';
import { showSiteCreated } from './showSiteCreated';
import { type Sku } from './stacks/models/FlexSkuModel';
import { type FunctionAppRuntimeSettings, } from './stacks/models/FunctionAppStackModel';

export class FunctionAppCreateStep extends AzureWizardExecuteStep<IFunctionAppWizardContext> {
    public priority: number = 140;

    public async execute(context: IFlexFunctionAppWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const os: WebsiteOS = nonNullProp(context, 'newSiteOS');
        const stack: FullFunctionAppStack = nonNullProp(context, 'newSiteStack');

        context.telemetry.properties.newSiteOS = os;
        context.telemetry.properties.newSiteStack = stack.stack.value;
        context.telemetry.properties.newSiteMajorVersion = stack.majorVersion.value;
        context.telemetry.properties.newSiteMinorVersion = stack.minorVersion.value;
        context.telemetry.properties.planSkuTier = context.plan?.sku?.tier;

        const message: string = localize('creatingNewApp', 'Creating new function app "{0}"...', context.newSiteName);
        ext.outputChannel.appendLog(message);
        progress.report({ message });

        const siteName: string = nonNullProp(context, 'newSiteName');
        const rgName: string = nonNullProp(nonNullProp(context, 'resourceGroup'), 'name');

        context.site = context.newFlexSku ?
            await this.createFlexFunctionApp(context, rgName, siteName, context.newFlexSku) :
            await this.createFunctionApp(context, rgName, siteName, stack);
        context.activityResult = context.site as AppResource;

        const site = new ParsedSite(context.site, context);
        if (!site.isLinux) { // not supported on linux
            try {
                await enableFileLogging(context, site);
            } catch (error) {
                // optional part of creating function app, so not worth blocking on error
                context.telemetry.properties.fileLoggingError = parseError(error).message;
            }
        }

        showSiteCreated(site, context);
    }

    public shouldExecute(context: IFunctionAppWizardContext): boolean {
        return !context.site;
    }

    private async getNewSite(context: IFunctionAppWizardContext, stack: FullFunctionAppStack): Promise<Site> {
        const location = await LocationListStep.getLocation(context, webProvider);
        const site: Site = {
            name: context.newSiteName,
            kind: getSiteKind(context),
            location: nonNullProp(location, 'name'),
            serverFarmId: context.plan?.id,
            clientAffinityEnabled: false,
            siteConfig: await this.getNewSiteConfig(context, stack),
            reserved: context.newSiteOS === WebsiteOS.linux  // The secret property - must be set to true to make it a Linux plan. Confirmed by the team who owns this API.
        };

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
        const location = await LocationListStep.getLocation(context, webProvider);
        const site: Site & { properties: FlexFunctionAppProperties } = {
            name: context.newSiteName,
            kind: getSiteKind(context),
            location: nonNullProp(location, 'name'),
            properties: {
                name: context.newSiteName,
                serverFarmId: context.plan?.id,
                clientAffinityEnabled: false,
                siteConfig: await this.getNewSiteConfig(context)
            },
        };

        site.properties.sku = 'FlexConsumption';
        site.properties.functionAppConfig = {
            deployment: {
                storage: {
                    type: 'blobContainer',
                    value: `${context.storageAccount?.primaryEndpoints?.blob}app-package-${context.newSiteName?.substring(0, 32)}-${randomUtils.getRandomHexString(7)}`,
                    authentication: {
                        userAssignedIdentityResourceId: null,
                        type: 'StorageAccountConnectionString',
                        storageAccountConnectionStringName: 'DEPLOYMENT_STORAGE_CONNECTION_STRING'
                    }
                }
            },
            runtime: {
                name: sku.functionAppConfigProperties.runtime.name,
                version: sku.functionAppConfigProperties.runtime.version
            },
            scaleAndConcurrency: {
                maximumInstanceCount: context.newFlexInstanceMemoryMB ?? sku.maximumInstanceCount.defaultValue,
                instanceMemoryMB: context.newFlexInstanceMemoryMB ?? sku.instanceMemoryMB.find(im => im.isDefault)?.size ?? 2048,
                alwaysReady: [],
                triggers: null
            },
        }

        return site;
    }

    private async getNewSiteConfig(context: IFunctionAppWizardContext, stack?: FullFunctionAppStack): Promise<SiteConfig> {
        let newSiteConfig: SiteConfig = {};

        const storageConnectionString: string = (await getStorageConnectionString(context)).connectionString;
        let appSettings: NameValuePair[] = [
            {
                name: ConnectionKey.Storage,
                value: storageConnectionString
            }
        ];

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
        } else if (isFlex) {
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
                name: 'APPINSIGHTS_INSTRUMENTATIONKEY',
                value: context.appInsightsComponent.instrumentationKey
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

    async createFunctionApp(context: IFunctionAppWizardContext, rgName: string, siteName: string, stack: FullFunctionAppStack): Promise<Site> {
        const client: WebSiteManagementClient = await createWebSiteClient(context);
        return await client.webApps.beginCreateOrUpdateAndWait(rgName, siteName, await this.getNewSite(context, stack));
    }

    async createFlexFunctionApp(context: IFunctionAppWizardContext, rgName: string, siteName: string, sku: Sku): Promise<Site> {
        const headers = createHttpHeaders({
            'Content-Type': 'application/json',
        });

        const options: AzExtRequestPrepareOptions = {
            url: `https://management.azure.com/subscriptions/${context.subscriptionId}/resourceGroups/${rgName}/providers/Microsoft.Web/sites/${siteName}?api-version=2023-12-01`,
            method: 'PUT',
            body: JSON.stringify(await this.getNewFlexSite(context, sku)) as unknown as RequestBodyType,
            headers
        };

        const client = await createGenericClient(context, context);
        const result = await client.sendRequest(createPipelineRequest(options)) as AzExtPipelineResponse;
        if (result && result.status >= 200 && result.status < 300) {
            const site = result.parsedBody as Site & { properties: FlexFunctionAppProperties };
            const storageConnectionString: string = (await getStorageConnectionString(context)).connectionString;
            await tryCreateStorageContainer(site, storageConnectionString);
            const client: WebSiteManagementClient = await createWebSiteClient(context);
            // the payload for the new API version "2023-12-01" is incompatiable with our current SiteClient so get the old payload
            try {
                return await client.webApps.get(rgName, siteName);
            } catch (_) {
                // ignore error and fall thru to throw
            }
        }

        throw new Error(parseError(result.parsedBody).message || localize('failedToCreateFlexFunctionApp', 'Failed to create flex function app "{0}".', siteName));
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
async function tryCreateStorageContainer(site: Site & { properties: FlexFunctionAppProperties }, storageConnectionString: string): Promise<void> {
    const blobClient = BlobServiceClient.fromConnectionString(storageConnectionString);
    const containerName = site.properties?.functionAppConfig?.deployment.storage.value.split('/').pop();
    if (containerName) {
        const client = blobClient.getContainerClient(containerName);
        if (!await client.exists()) {
            await blobClient.createContainer(containerName);
        }
    }
}

type FlexFunctionAppProperties = {
    containerSize?: number,
    sku?: 'FlexConsumption',
    name?: string,
    serverFarmId?: string,
    clientAffinityEnabled?: boolean,
    siteConfig: SiteConfig,
    reserved?: boolean,
    functionAppConfig?: FunctionAppConfig
};

// TODO: Temporary until we can get the SDK updated
export type FunctionAppConfig = {
    deployment: {
        storage: {
            type: string;
            value: string;
            authentication: {
                type: string;
                userAssignedIdentityResourceId: string | null;
                storageAccountConnectionStringName: string | null;
            };
        }
    },
    runtime: {
        name?: string,
        version?: string
    },
    scaleAndConcurrency: {
        alwaysReady: number[],
        maximumInstanceCount: number,
        instanceMemoryMB: number,
        triggers: null
    }
};
