/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient, WebSiteManagementModels as SiteModels } from 'azure-arm-website';
import { Progress } from 'vscode';
import { WebsiteOS } from 'vscode-azureappservice';
import { AzureWizardExecuteStep, createAzureClient } from 'vscode-azureextensionui';
import { extensionVersionKey, ProjectLanguage, workerRuntimeKey } from '../../constants';
import { ext } from '../../extensionVariables';
import { azureWebJobsStorageKey } from '../../funcConfig/local.settings';
import { FuncVersion, getMajorVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { getStorageConnectionString } from '../../utils/azure';
import { getRandomHexString } from '../../utils/fs';
import { nonNullOrEmptyValue, nonNullProp } from '../../utils/nonNull';
import { IFunctionAppWizardContext } from './IFunctionAppWizardContext';

export class FunctionAppCreateStep extends AzureWizardExecuteStep<IFunctionAppWizardContext> {
    public priority: number = 140;

    public async execute(context: IFunctionAppWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        context.telemetry.properties.newSiteOS = context.newSiteOS;
        context.telemetry.properties.newSiteRuntime = context.newSiteRuntime;
        context.telemetry.properties.planSkuTier = context.plan && context.plan.sku && context.plan.sku.tier;

        const message: string = localize('creatingNewApp', 'Creating new function app "{0}"...', context.newSiteName);
        ext.outputChannel.appendLog(message);
        progress.report({ message });

        const siteName: string = nonNullProp(context, 'newSiteName');
        const rgName: string = nonNullProp(nonNullProp(context, 'resourceGroup'), 'name');
        const locationName: string = nonNullProp(nonNullProp(context, 'location'), 'name');

        const client: WebSiteManagementClient = createAzureClient(context, WebSiteManagementClient);
        context.site = await client.webApps.createOrUpdate(rgName, siteName, {
            name: siteName,
            kind: context.newSiteKind,
            location: locationName,
            serverFarmId: context.plan && context.plan.id,
            clientAffinityEnabled: false,
            siteConfig: await this.getNewSiteConfig(context),
            reserved: context.newSiteOS === WebsiteOS.linux  // The secret property - must be set to true to make it a Linux plan. Confirmed by the team who owns this API.
        });
    }

    public shouldExecute(context: IFunctionAppWizardContext): boolean {
        return !context.site;
    }

    private async getNewSiteConfig(context: IFunctionAppWizardContext): Promise<SiteModels.SiteConfig> {
        const newSiteConfig: SiteModels.SiteConfig = {};
        if (context.newSiteOS === WebsiteOS.linux) {
            if (context.useConsumptionPlan) {
                newSiteConfig.use32BitWorkerProcess = false; // Needs to be explicitly set to false per the platform team
                if (context.newSiteRuntime && isVersionedRuntime(context.newSiteRuntime)) {
                    // The platform currently requires a minor version to be specified, even though only the major version is respected for Node
                    let linuxFxVersion: string = context.newSiteRuntime;
                    if (!linuxFxVersion.includes('.')) {
                        linuxFxVersion += '.0';
                    }
                    newSiteConfig.linuxFxVersion = linuxFxVersion;
                }
            } else {
                newSiteConfig.linuxFxVersion = this.getDockerLinuxFxVersion(context);
            }
        }

        newSiteConfig.appSettings = await this.getAppSettings(context);
        return newSiteConfig;
    }

    private getDockerLinuxFxVersion(context: IFunctionAppWizardContext): string {
        const runtime: string = nonNullProp(context, 'newSiteRuntime');
        const funcVersion: string = getMajorVersion(context.version) + '.0';

        const runtimeWithoutVersion: string = getRuntimeWithoutVersion(runtime);
        let middlePart: string = `${runtimeWithoutVersion}:${funcVersion}`;
        if (isVersionedRuntime(runtime)) {
            middlePart += '-' + runtime.replace(separator, '');
        }

        return `DOCKER|mcr.microsoft.com/azure-functions/${middlePart}-appservice`;
    }

    private async getAppSettings(context: IFunctionAppWizardContext): Promise<SiteModels.NameValuePair[]> {
        const runtime: string = nonNullProp(context, 'newSiteRuntime');
        const runtimeWithoutVersion: string = getRuntimeWithoutVersion(runtime);

        const storageConnectionString: string = (await getStorageConnectionString(context)).connectionString;

        const appSettings: SiteModels.NameValuePair[] = [
            {
                name: azureWebJobsStorageKey,
                value: storageConnectionString
            },
            {
                name: extensionVersionKey,
                value: '~' + getMajorVersion(context.version)
            },
            {
                name: workerRuntimeKey,
                value: runtimeWithoutVersion
            }
        ];

        // This setting only applies for v1 https://github.com/Microsoft/vscode-azurefunctions/issues/640
        if (context.version === FuncVersion.v1) {
            appSettings.push({
                name: 'AzureWebJobsDashboard',
                value: storageConnectionString
            });
        }

        if (context.newSiteOS === WebsiteOS.windows && runtimeWithoutVersion.toLowerCase() === 'node' && context.version !== FuncVersion.v1) {
            // Linux doesn't need this because it uses linuxFxVersion
            // v1 doesn't need this because it only supports one version of Node
            appSettings.push({
                name: 'WEBSITE_NODE_DEFAULT_VERSION',
                value: '~' + getRuntimeVersion(runtime)
            });
        }

        const isElasticPremium: boolean = !!(context.plan && context.plan.sku && context.plan.sku.family && context.plan.sku.family.toLowerCase() === 'ep');
        if (context.newSiteOS === WebsiteOS.windows || isElasticPremium) {
            // WEBSITE_CONTENT* settings only apply for the following scenarios:
            // Windows: https://github.com/Microsoft/vscode-azurefunctions/issues/625
            // Linux Elastic Premium: https://github.com/microsoft/vscode-azurefunctions/issues/1682
            appSettings.push({
                name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING',
                value: storageConnectionString
            });
            appSettings.push({
                name: 'WEBSITE_CONTENTSHARE',
                value: getNewFileShareName(nonNullProp(context, 'newSiteName'))
            });
        }

        // This setting is not required, but we will set it since it has many benefits https://docs.microsoft.com/en-us/azure/azure-functions/run-functions-from-deployment-package
        // That being said, it doesn't work on v1 C# Script https://github.com/Microsoft/vscode-azurefunctions/issues/684
        // It also doesn't apply for Linux
        if (context.newSiteOS === WebsiteOS.windows && !(context.language === ProjectLanguage.CSharpScript && context.version === FuncVersion.v1)) {
            appSettings.push({
                name: 'WEBSITE_RUN_FROM_PACKAGE',
                value: '1'
            });
        }

        if (context.appInsightsComponent) {
            appSettings.push({
                name: 'APPINSIGHTS_INSTRUMENTATIONKEY',
                value: context.appInsightsComponent.instrumentationKey
            });
        }

        return appSettings;
    }
}

const separator: string = '|';
function isVersionedRuntime(runtime: string): boolean {
    return !!runtime && runtime.includes(separator);
}

function getRuntimeWithoutVersion(runtime: string): string {
    return runtime.split(separator)[0];
}

function getRuntimeVersion(runtime: string): string {
    return nonNullOrEmptyValue(runtime.split(separator)[1], 'runtimeVersion');
}

function getNewFileShareName(siteName: string): string {
    const randomLetters: number = 6;
    const maxFileShareNameLength: number = 63;
    return siteName.toLowerCase().substr(0, maxFileShareNameLength - randomLetters) + getRandomHexString(randomLetters);
}
