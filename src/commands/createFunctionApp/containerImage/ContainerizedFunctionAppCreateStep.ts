/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site, type WebSiteManagementClient } from "@azure/arm-appservice";
import { type ServiceClient } from "@azure/core-client";
import { createHttpHeaders, createPipelineRequest } from "@azure/core-rest-pipeline";
import { LocationListStep, createGenericClient } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardExecuteStep, nonNullProp } from "@microsoft/vscode-azext-utils";
import { type AppResource } from "@microsoft/vscode-azext-utils/hostapi";
import { type Progress } from "vscode";
import { webProvider } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { createWebSiteClient } from "../../../utils/azureClients";
import { getStorageConnectionString } from "../../appSettings/connectionSettings/getLocalConnectionSetting";
import { type IFunctionAppWizardContext } from "../IFunctionAppWizardContext";
import { showSiteCreated } from "../showSiteCreated";

export class ContainerizedFunctionAppCreateStep extends AzureWizardExecuteStep<IFunctionAppWizardContext> {
    public priority: number = 140;

    public async execute(context: IFunctionAppWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const message: string = localize('creatingNewApp', 'Creating new function app "{0}"...', context.newSiteName);
        ext.outputChannel.appendLog(message);
        progress.report({ message });

        if (!context.deployWorkspaceResult?.registryLoginServer || !context.deployWorkspaceResult?.imageName) {
            throw new Error(localize('failToCreateApp', 'Failed to create function app. There was an error creating the necessary container resources.'));
        }

        const siteName: string = nonNullProp(context, 'newSiteName');
        const rgName: string = nonNullProp(nonNullProp(context, 'resourceGroup'), 'name');
        const client: WebSiteManagementClient = await createWebSiteClient(context);
        context.site = await client.webApps.beginCreateOrUpdateAndWait(rgName, siteName, await this.getNewSite(context));
        context.activityResult = context.site as AppResource;

        const containerSite = Object.assign(context.site, { defaultHostUrl: `https://${context.site.defaultHostName}`, fullName: context.site.name, isSlot: false });

        await pingContainerizedFunctionApp(context, client, context.site);
        showSiteCreated(containerSite, context);
    }

    public shouldExecute(context: IFunctionAppWizardContext): boolean {
        return !!context.dockerfilePath
    }

    private async getNewSite(context: IFunctionAppWizardContext): Promise<Site> {
        const location = await LocationListStep.getLocation(context, webProvider);
        return {
            name: context.newSiteName,
            kind: 'functionapp',
            location: nonNullProp(location, 'name'),
            managedEnvironmentId: context.deployWorkspaceResult?.managedEnvironmentId,
            siteConfig: {
                linuxFxVersion: `Docker|${context.deployWorkspaceResult?.registryLoginServer}/${context.deployWorkspaceResult?.imageName}`,
                appSettings: [
                    {
                        name: 'AzureWebJobsStorage',
                        value: (await getStorageConnectionString(context)).connectionString
                    },
                    {
                        name: 'APPLICATIONINSIGHTS_CONNECTION_STRING',
                        value: context.appInsightsComponent?.connectionString
                    },
                    {
                        name: 'FUNCTIONS_EXTENSION_VERSION',
                        value: context.version
                    },
                    {
                        name: 'DOCKER_REGISTRY_SERVER_URL',
                        value: context.deployWorkspaceResult?.registryLoginServer
                    },
                    {
                        name: 'DOCKER_REGISTRY_SERVER_USERNAME',
                        value: context.deployWorkspaceResult?.registryUsername
                    },
                    {
                        name: 'DOCKER_REGISTRY_SERVER_PASSWORD',
                        value: context.deployWorkspaceResult?.registryPassword
                    }
                ]
            }
        }
    }
}

async function pingContainerizedFunctionApp(context: IFunctionAppWizardContext, client: WebSiteManagementClient, site: Site): Promise<void> {
    const genericClient: ServiceClient = await createGenericClient(context, undefined);
    const headers = createHttpHeaders({
        'x-functions-key': (await client.webApps.listHostKeys(nonNullProp(site, 'resourceGroup'), nonNullProp(site, 'name'))).masterKey || ''
    });

    await genericClient.sendRequest(createPipelineRequest({
        method: 'POST',
        url: `https://${site.defaultHostName}/admin/host/status`,
        headers
    }));
}
