/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type NameValuePair, type Site, type SiteConfig, type WebSiteManagementClient } from '@azure/arm-appservice';
import { BlobServiceClient } from '@azure/storage-blob';
import { ParsedSite, WebsiteOS, type CustomLocation, type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { LocationListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, maskUserInfo, parseError, randomUtils } from '@microsoft/vscode-azext-utils';
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
        const site: Site = {
            name: context.newSiteName,
            kind: getSiteKind(context),
            location: nonNullProp(location, 'name'),
            serverFarmId: context.plan?.id,
            clientAffinityEnabled: false,
            siteConfig: await this.getNewSiteConfig(context)
        };

        site.functionAppConfig = {
            deployment: {
                storage: {
                    type: 'blobContainer',
                    value: `${context.storageAccount?.primaryEndpoints?.blob}app-package-${context.newSiteName?.substring(0, 32)}-${randomUtils.getRandomHexString(7)}`,
                    authentication: {
                        userAssignedIdentityResourceId: undefined,
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
                maximumInstanceCount: context.newFlexMaximumInstanceCount ?? sku.maximumInstanceCount.defaultValue,
                instanceMemoryMB: context.newFlexInstanceMemoryMB ?? sku.instanceMemoryMB.find(im => im.isDefault)?.size ?? 2048,
                alwaysReady: [],
                triggers: undefined
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

    async createFunctionApp(context: IFlexFunctionAppWizardContext, rgName: string, siteName: string, stack: FullFunctionAppStack): Promise<Site> {
        const client: WebSiteManagementClient = await createWebSiteClient(context);
        const site = context.newFlexSku ?
            await this.getNewFlexSite(context, context.newFlexSku) :
            await this.getNewSite(context, stack);
        const result = await client.webApps.beginCreateOrUpdateAndWait(rgName, siteName, site);

        if (context.newFlexSku) {
            const storageConnectionString: string = (await getStorageConnectionString(context)).connectionString;
            await tryCreateStorageContainer(result, storageConnectionString);
        }

        return result;
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
async function tryCreateStorageContainer(site: Site, storageConnectionString: string): Promise<void> {
    const blobClient = BlobServiceClient.fromConnectionString(storageConnectionString);
    const containerUrl: string | undefined = site.functionAppConfig?.deployment?.storage?.value;
    if (containerUrl) {
        const containerName = containerUrl.split('/').pop();
        if (containerName) {
            const client = blobClient.getContainerClient(containerName);
            if (!await client.exists()) {
                await blobClient.createContainer(containerName);
            } else {
                ext.outputChannel.appendLog(localize('deploymentStorageExists', 'Deployment storage container "{0}" already exists.', containerName));
                return;
            }
        }
    }

    ext.outputChannel.appendLog(localize('noDeploymentStorage', 'No deployment storage specified in function app.'));
    return;
}
