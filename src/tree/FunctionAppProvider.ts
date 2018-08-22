/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient } from 'azure-arm-website';
import { Site, WebAppCollection } from "azure-arm-website/lib/models";
import { OutputChannel } from "vscode";
import { createFunctionApp, SiteClient } from 'vscode-azureappservice';
import { addExtensionUserAgent, IActionContext, IAzureNode, IAzureTreeItem, IChildProvider } from 'vscode-azureextensionui';
import { ProjectRuntime, projectRuntimeSetting } from '../constants';
import { tryGetLocalRuntimeVersion } from '../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from "../localize";
import { getFuncExtensionSetting } from '../ProjectSettings';
import { getCliFeedAppSettings } from '../utils/getCliFeedJson';
import { FunctionAppTreeItem } from "./FunctionAppTreeItem";

export class FunctionAppProvider implements IChildProvider {
    public readonly childTypeLabel: string = localize('azFunc.FunctionApp', 'Function App');

    private _nextLink: string | undefined;
    private readonly _outputChannel: OutputChannel;

    public constructor(outputChannel: OutputChannel) {
        this._outputChannel = outputChannel;
    }

    public hasMoreChildren(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildren(node: IAzureNode, clearCache: boolean): Promise<IAzureTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const client: WebSiteManagementClient = new WebSiteManagementClient(node.credentials, node.subscriptionId);
        addExtensionUserAgent(client);
        const webAppCollection: WebAppCollection = this._nextLink === undefined ?
            await client.webApps.list() :
            await client.webApps.listNext(this._nextLink);

        this._nextLink = webAppCollection.nextLink;

        const treeItems: IAzureTreeItem[] = [];
        for (const site of webAppCollection) {
            const siteClient: SiteClient = new SiteClient(site, node);
            if (siteClient.isFunctionApp) {
                treeItems.push(new FunctionAppTreeItem(siteClient, this._outputChannel));
            }
        }
        return treeItems;
    }

    public async createChild(parent: IAzureNode, showCreatingNode: (label: string) => void, actionContext: IActionContext): Promise<IAzureTreeItem> {
        // Ideally actionContext should always be defined, but there's a bug with the NodePicker. Create a 'fake' actionContext until that bug is fixed
        // https://github.com/Microsoft/vscode-azuretools/issues/120
        // tslint:disable-next-line:strict-boolean-expressions
        actionContext = actionContext || <IActionContext>{ properties: {}, measurements: {} };

        const runtime: ProjectRuntime = await getDefaultRuntime(actionContext);
        const appSettings: { [key: string]: string } = await getCliFeedAppSettings(runtime);
        const site: Site = await createFunctionApp(actionContext, parent.credentials, parent.subscriptionId, parent.subscriptionDisplayName, showCreatingNode, appSettings);
        return new FunctionAppTreeItem(new SiteClient(site, parent), this._outputChannel);
    }
}

async function getDefaultRuntime(actionContext: IActionContext): Promise<ProjectRuntime> {
    // Try to get VS Code setting for runtime (aka if they have a project open)
    let runtime: string | undefined = getFuncExtensionSetting(projectRuntimeSetting);
    actionContext.properties.runtimeSource = 'VSCodeSetting';

    if (!runtime) {
        // Try to get the runtime that matches their local func cli version
        runtime = await tryGetLocalRuntimeVersion();
        actionContext.properties.runtimeSource = 'LocalFuncCli';
    }

    if (!runtime) {
        // Default to v1 if all else fails
        runtime = ProjectRuntime.one;
        actionContext.properties.runtimeSource = 'Backup';
    }

    actionContext.properties.projectRuntime = runtime;

    return <ProjectRuntime>runtime;
}
