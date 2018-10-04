/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient } from 'azure-arm-website';
import { AppServicePlan, Site, WebAppCollection } from "azure-arm-website/lib/models";
import { createFunctionApp, IAppCreateOptions, SiteClient } from 'vscode-azureappservice';
import { addExtensionUserAgent, createTreeItemsWithErrorHandling, IActionContext, IAzureNode, IAzureTreeItem, IChildProvider, parseError } from 'vscode-azureextensionui';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting } from '../constants';
import { tryGetLocalRuntimeVersion } from '../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from "../localize";
import { convertStringToRuntime, getFuncExtensionSetting } from '../ProjectSettings';
import { getCliFeedAppSettings } from '../utils/getCliFeedJson';
import { FunctionAppTreeItem } from "./FunctionAppTreeItem";

export class FunctionAppProvider implements IChildProvider {
    public readonly childTypeLabel: string = localize('azFunc.FunctionApp', 'Function App');

    private _nextLink: string | undefined;

    public hasMoreChildren(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildren(node: IAzureNode, clearCache: boolean): Promise<IAzureTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const client: WebSiteManagementClient = new WebSiteManagementClient(node.credentials, node.subscriptionId, node.environment.resourceManagerEndpointUrl);
        addExtensionUserAgent(client);
        let webAppCollection: WebAppCollection;
        try {
            webAppCollection = this._nextLink === undefined ?
                await client.webApps.list() :
                await client.webApps.listNext(this._nextLink);
        } catch (error) {
            if (parseError(error).errorType.toLowerCase() === 'notfound') {
                // This error type means the 'Microsoft.Web' provider has not been registered in this subscription
                // In that case, we know there are no function apps, so we can return an empty array
                // (The provider will be registered automatically if the user creates a new function app)
                return [];
            } else {
                throw error;
            }
        }

        this._nextLink = webAppCollection.nextLink;

        return await createTreeItemsWithErrorHandling(
            webAppCollection,
            'azFuncInvalidFunctionApp',
            async (site: Site) => {
                const siteClient: SiteClient = new SiteClient(site, node);
                if (siteClient.isFunctionApp) {
                    const asp: AppServicePlan = await siteClient.getAppServicePlan();
                    const isLinuxPreview: boolean = siteClient.kind.toLowerCase().includes('linux') && !!asp.sku && !!asp.sku.tier && asp.sku.tier.toLowerCase() === 'dynamic';
                    return new FunctionAppTreeItem(siteClient, isLinuxPreview);
                }
                return undefined;
            },
            (site: Site) => {
                return site.name;
            }
        );
    }

    public async createChild(parent: IAzureNode, showCreatingNode: (label: string) => void, userOptions?: { actionContext: IActionContext, resourceGroup?: string }): Promise<IAzureTreeItem> {
        // Ideally actionContext should always be defined, but there's a bug with the NodePicker. Create a 'fake' actionContext until that bug is fixed
        // https://github.com/Microsoft/vscode-azuretools/issues/120
        // tslint:disable-next-line:strict-boolean-expressions
        const actionContext: IActionContext = userOptions ? userOptions.actionContext : <IActionContext>{ properties: {}, measurements: {} };
        const resourceGroup: string | undefined = userOptions ? userOptions.resourceGroup : undefined;
        const runtime: ProjectRuntime = await getDefaultRuntime(actionContext);
        const functionAppSettings: { [key: string]: string } = await getCliFeedAppSettings(runtime);
        const language: string | undefined = getFuncExtensionSetting(projectLanguageSetting);
        const createOptions: IAppCreateOptions = { functionAppSettings, resourceGroup };

        // There are two things in preview right now:
        // 1. Python support
        // 2. Linux support
        // Python only works on Linux, so we have to use Linux when creating a function app. For other languages, we will stick with Windows until Linux GA's
        if (language === ProjectLanguage.Python) {
            createOptions.os = 'linux';
            createOptions.runtime = 'python';
        } else {
            createOptions.os = 'windows';
            if (language !== ProjectLanguage.CSharpScript || runtime !== ProjectRuntime.v1) {
                // WEBSITE_RUN_FROM_PACKAGE has several benefits, so make that the default
                // https://docs.microsoft.com/en-us/azure/azure-functions/run-functions-from-deployment-package
                functionAppSettings.WEBSITE_RUN_FROM_PACKAGE = '1';
            }
        }

        const site: Site = await createFunctionApp(actionContext, parent, createOptions, showCreatingNode);
        return new FunctionAppTreeItem(new SiteClient(site, parent), createOptions.os === 'linux' /* isLinuxPreview */);
    }
}

async function getDefaultRuntime(actionContext: IActionContext): Promise<ProjectRuntime> {
    // Try to get VS Code setting for runtime (aka if they have a project open)
    let runtime: string | undefined = convertStringToRuntime(getFuncExtensionSetting(projectRuntimeSetting));
    actionContext.properties.runtimeSource = 'VSCodeSetting';

    if (!runtime) {
        // Try to get the runtime that matches their local func cli version
        runtime = await tryGetLocalRuntimeVersion();
        actionContext.properties.runtimeSource = 'LocalFuncCli';
    }

    if (!runtime) {
        // Default to v2 if all else fails
        runtime = ProjectRuntime.v2;
        actionContext.properties.runtimeSource = 'Backup';
    }

    actionContext.properties.projectRuntime = runtime;

    return <ProjectRuntime>runtime;
}
