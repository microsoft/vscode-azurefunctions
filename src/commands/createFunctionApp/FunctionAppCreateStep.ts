/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NameValuePair, Site, SiteConfig, WebSiteManagementClient } from '@azure/arm-appservice';
import { CustomLocation, IAppServiceWizardContext, ParsedSite, WebsiteOS } from '@microsoft/vscode-azext-azureappservice';
import { LocationListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, parseError } from '@microsoft/vscode-azext-utils';
import { AppResource } from '@microsoft/vscode-azext-utils/hostapi';
import { Progress } from 'vscode';
import { ConnectionKey, contentConnectionStringKey, contentShareKey, extensionVersionKey, ProjectLanguage, runFromPackageKey, webProvider } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion, getMajorVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { getStorageConnectionString } from '../../utils/azure';
import { createWebSiteClient } from '../../utils/azureClients';
import { getRandomHexString } from '../../utils/fs';
import { nonNullProp } from '../../utils/nonNull';
import { enableFileLogging } from '../logstream/enableFileLogging';
import { FullFunctionAppStack, IFunctionAppWizardContext } from './IFunctionAppWizardContext';
import { showSiteCreated } from './showSiteCreated';
import { FunctionAppRuntimeSettings } from './stacks/models/FunctionAppStackModel';

export class FunctionAppCreateStep extends AzureWizardExecuteStep<IFunctionAppWizardContext> {
    public priority: number = 140;

    public async execute(context: IFunctionAppWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
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

        const client: WebSiteManagementClient = await createWebSiteClient(context);
        context.site = await client.webApps.beginCreateOrUpdateAndWait(rgName, siteName, await this.getNewSite(context, stack));
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

        return site;
    }

    private addCustomLocationProperties(site: Site, customLocation: CustomLocation): void {
        nonNullProp(site, 'siteConfig').alwaysOn = true;
        site.extendedLocation = { name: customLocation.id, type: 'customLocation' };
    }

    private async getNewSiteConfig(context: IFunctionAppWizardContext, stack: FullFunctionAppStack): Promise<SiteConfig> {
        const stackSettings: FunctionAppRuntimeSettings = nonNullProp(stack.minorVersion.stackSettings, context.newSiteOS === WebsiteOS.linux ? 'linuxRuntimeSettings' : 'windowsRuntimeSettings');
        // https://github.com/microsoft/vscode-azurefunctions/issues/2990
        if (context.newSiteOS === 'windows' && context.version === FuncVersion.v4) {
            stackSettings.siteConfigPropertiesDictionary.netFrameworkVersion = 'v6.0'
        }

        const newSiteConfig: SiteConfig = stackSettings.siteConfigPropertiesDictionary;
        const storageConnectionString: string = (await getStorageConnectionString(context)).connectionString;

        const appSettings: NameValuePair[] = [
            {
                name: ConnectionKey.Storage,
                value: storageConnectionString
            },
            {
                name: extensionVersionKey,
                value: '~' + getMajorVersion(context.version)
            },
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            ...Object.entries(stackSettings.appSettingsDictionary).map(([name, value]) => { return { name, value }; })
        ];

        // This setting only applies for v1 https://github.com/Microsoft/vscode-azurefunctions/issues/640
        if (context.version === FuncVersion.v1) {
            appSettings.push({
                name: 'AzureWebJobsDashboard',
                value: storageConnectionString
            });
        }

        const isElasticPremium: boolean = context.plan?.sku?.family?.toLowerCase() === 'ep';
        const isConsumption: boolean = context.plan?.sku?.family?.toLowerCase() === 'y';
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
        }

        newSiteConfig.appSettings = appSettings;

        return newSiteConfig;
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
