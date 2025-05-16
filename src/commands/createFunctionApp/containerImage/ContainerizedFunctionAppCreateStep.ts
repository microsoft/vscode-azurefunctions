/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site, type WebSiteManagementClient } from "@azure/arm-appservice";
import { type ServiceClient } from "@azure/core-client";
import { createHttpHeaders, createPipelineRequest } from "@azure/core-rest-pipeline";
import { LocationListStep, createGenericClient } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardExecuteStepWithActivityOutput, nonNullProp } from "@microsoft/vscode-azext-utils";
import { type AppResource } from "@microsoft/vscode-azext-utils/hostapi";
import { type Progress } from "vscode";
import { webProvider } from "../../../constants";
import { localize } from "../../../localize";
import { createWebSiteClient } from "../../../utils/azureClients";
import { getStorageConnectionString } from "../../appSettings/connectionSettings/getLocalConnectionSetting";
import { type IFunctionAppWizardContext } from "../IFunctionAppWizardContext";

export class ContainerizedFunctionAppCreateStep extends AzureWizardExecuteStepWithActivityOutput<IFunctionAppWizardContext> {
    public stepName: string = 'containerizedFunctionAppCreateStep';
    public priority: number = 140;

    protected getTreeItemLabel(context: IFunctionAppWizardContext): string {
        const siteName: string = nonNullProp(context, 'newSiteName');
        return localize('creatingNewApp', 'Create containerized function app "{0}"', siteName);
    }
    protected getOutputLogSuccess(context: IFunctionAppWizardContext): string {
        const siteName: string = nonNullProp(context, 'newSiteName');
        return localize('createdNewApp', 'Successfully created containerized function app "{0}".', siteName);
    }
    protected getOutputLogFail(context: IFunctionAppWizardContext): string {
        const siteName: string = nonNullProp(context, 'newSiteName');
        return localize('failedToCreateNewApp', 'Failed to create containerized function app "{0}".', siteName);
    }
    protected getOutputLogProgress(context: IFunctionAppWizardContext): string {
        const siteName: string = nonNullProp(context, 'newSiteName');
        return localize('creatingNewApp', 'Creating containerized function app "{0}"...', siteName);
    }

    public async execute(context: IFunctionAppWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        if (!context.deployWorkspaceResult?.registryLoginServer || !context.deployWorkspaceResult?.imageName) {
            throw new Error(localize('failToCreateApp', 'Failed to create containerized function app. There was an error creating the necessary container resources.'));
        }

        const message: string = localize('creatingNewApp', 'Creating containerized function app "{0}"...', context.newSiteName);
        progress.report({ message });

        const siteName: string = nonNullProp(context, 'newSiteName');
        const rgName: string = nonNullProp(nonNullProp(context, 'resourceGroup'), 'name');
        const client: WebSiteManagementClient = await createWebSiteClient(context);
        context.site = await client.webApps.beginCreateOrUpdateAndWait(rgName, siteName, await this.getNewSite(context));
        context.activityResult = context.site as AppResource;
        await pingContainerizedFunctionApp(context, client, context.site);
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
