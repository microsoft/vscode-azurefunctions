/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { Site, WebAppCollection } from "azure-arm-website/lib/models";
import { OutputChannel } from "vscode";
import { createFunctionApp, SiteClient } from 'vscode-azureappservice';
import { IActionContext, IAzureNode, IAzureTreeItem, IChildProvider } from 'vscode-azureextensionui';
import { localize } from "../localize";
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
        const site: Site = await createFunctionApp(this._outputChannel, parent.ui, actionContext, parent.credentials, parent.subscriptionId, parent.subscriptionDisplayName, showCreatingNode);
        return new FunctionAppTreeItem(new SiteClient(site, parent), this._outputChannel);
    }
}
