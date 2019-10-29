/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient } from 'azure-arm-website';
import { Progress } from 'vscode';
import { IAppServiceWizardContext } from 'vscode-azureappservice';
import { AzureWizardExecuteStep, createAzureClient } from 'vscode-azureextensionui';
import { ProjectLanguage, workerRuntimeKey } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';

export interface IAppSettingsContext {
    storageConnectionString?: string;
    fileShareName?: string;
    os: string;
    runtime?: string;
    aiInstrumentationKey?: string;
}

export class SiteCreateStep extends AzureWizardExecuteStep<IAppServiceWizardContext> {
    public priority: number = 140;

    public async execute(wizardContext: IAppServiceWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const creatingNewApp: string = wizardContext.newSiteKind === AppKind.functionapp ?
            localize('creatingNewFunctionApp', 'Creating new function app "{0}"...', wizardContext.newSiteName) :
            localize('creatingNewWebApp', 'Creating new web app "{0}"...', wizardContext.newSiteName);
        ext.outputChannel.appendLog(creatingNewApp);
        progress.report({ message: creatingNewApp });
        const client: WebSiteManagementClient = createAzureClient(wizardContext, WebSiteManagementClient);
        wizardContext.site = await client.webApps.createOrUpdate(nonNullValueAndProp(wizardContext.resourceGroup, 'name'), nonNullProp(wizardContext, 'newSiteName'), {
            name: wizardContext.newSiteName,
            kind: wizardContext.newSiteKind,
            location: nonNullValueAndProp(wizardContext.location, 'name'),
            serverFarmId: wizardContext.plan ? wizardContext.plan.id : undefined,
            clientAffinityEnabled: wizardContext.newSiteKind === AppKind.app,
            siteConfig: await this.getNewSiteConfig(wizardContext),
            reserved: wizardContext.newSiteOS === WebsiteOS.linux  // The secret property - must be set to true to make it a Linux plan. Confirmed by the team who owns this API.
        });
    }

    public shouldExecute(wizardContext: IAppServiceWizardContext): boolean {
        return !wizardContext.site;
    }

    private async getNewSiteConfig(wizardContext: IAppServiceWizardContext): Promise<SiteConfig> {
        const newSiteConfig: SiteConfig = {};
        let storageConnectionString: string | undefined;
        let fileShareName: string | undefined;

        if (wizardContext.newSiteOS === 'linux') {
            if (wizardContext.useConsumptionPlan) {
                newSiteConfig.use32BitWorkerProcess = false; // Needs to be explicitly set to false per the platform team
            } else {
                newSiteConfig.linuxFxVersion = this.getFunctionAppLinuxFxVersion(nonNullProp(wizardContext, 'newSiteRuntime'));
            }
        }

        const storageClient: StorageManagementClient = createAzureClient(wizardContext, StorageManagementClient);

        const storageAccount: StorageAccount = nonNullProp(wizardContext, 'storageAccount');
        const [, storageResourceGroup] = nonNullValue(nonNullProp(storageAccount, 'id').match(/\/resourceGroups\/([^/]+)\//), 'Invalid storage account id');
        const keysResult: StorageAccountListKeysResult = await storageClient.storageAccounts.listKeys(storageResourceGroup, nonNullProp(storageAccount, 'name'));

        fileShareName = getNewFileShareName(nonNullProp(wizardContext, 'newSiteName'));

        // https://github.com/Azure/azure-sdk-for-node/issues/4706
        const endpointSuffix: string = wizardContext.environment.storageEndpointSuffix.replace(/^\./, '');

        storageConnectionString = '';
        if (keysResult.keys && keysResult.keys[0].value) {
            storageConnectionString = `DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${keysResult.keys[0].value};EndpointSuffix=${endpointSuffix}`;
        }

        newSiteConfig.appSettings = await this.createSiteAppSettings(
            {
                storageConnectionString,
                fileShareName,
                os: nonNullProp(wizardContext, 'newSiteOS'),
                runtime: wizardContext.newSiteRuntime,
                // tslint:disable-next-line: strict-boolean-expressions
                aiInstrumentationKey: wizardContext.appInsightsComponent && wizardContext.appInsightsComponent ? wizardContext.appInsightsComponent.instrumentationKey : undefined
            });

        return newSiteConfig;
    }

    private async createSiteAppSettings(context: IAppSettingsContext): Promise<WebSiteManagementModels.NameValuePair[]> {
        const appSettings: WebSiteManagementModels.NameValuePair[] = [];

        const cliFeedAppSettings: { [key: string]: string } = await cliFeedUtils.getAppSettings(version);
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
        if (version === FuncVersion.v1) {
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
                name: workerRuntimeKey,
                value: context.runtime
            });
        }

        // This setting is not required, but we will set it since it has many benefits https://docs.microsoft.com/en-us/azure/azure-functions/run-functions-from-deployment-package
        // That being said, it doesn't work on v1 C# Script https://github.com/Microsoft/vscode-azurefunctions/issues/684
        // It also doesn't apply for Linux Consumption, which has its own custom deploy logic in the the vscode-azureappservice package
        if (context.os !== 'linux' && !(projectLanguage === ProjectLanguage.CSharpScript && version === FuncVersion.v1)) {
            appSettings.push({
                name: 'WEBSITE_RUN_FROM_PACKAGE',
                value: '1'
            });
        }

        if (context.aiInstrumentationKey) {
            appSettings.push({
                name: 'APPINSIGHTS_INSTRUMENTATIONKEY',
                value: context.aiInstrumentationKey
            });
        }

        return appSettings;
    }

    private getFunctionAppLinuxFxVersion(runtime: string): string {
        let middlePart: string;
        switch (runtime) {
            case 'node':
                middlePart = 'node:2.0-node8';
                break;
            case 'python':
                middlePart = 'python:2.0-python3.6';
                break;
            case 'dotnet':
                middlePart = 'dotnet:2.0';
                break;
            default:
                throw new RangeError(localize('unexpectedRuntime', 'Unexpected runtime "{0}".', runtime));
        }

        return `DOCKER|mcr.microsoft.com/azure-functions/${middlePart}-appservice`;
    }
}
