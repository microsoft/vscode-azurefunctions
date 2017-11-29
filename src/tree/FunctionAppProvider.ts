/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { Site, WebAppCollection } from "azure-arm-website/lib/models";
import { Memento, OutputChannel } from "vscode";
import * as appServiceTools from 'vscode-azureappservice';
import { IAzureNode, IAzureTreeItem, IChildProvider, UserCancelledError } from 'vscode-azureextensionui';
import { localize } from "../localize";
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionAppTreeItem } from "./FunctionAppTreeItem";

export class FunctionAppProvider implements IChildProvider {
    public readonly childTypeLabel: string = localize('azFunc.FunctionApp', 'Function App');

    private _nextLink: string | undefined;
    private readonly _globalState: Memento;
    private readonly _outputChannel: OutputChannel;

    public constructor(globalState: Memento, outputChannel: OutputChannel) {
        this._globalState = globalState;
        this._outputChannel = outputChannel;
    }

    public hasMoreChildren(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildren(node: IAzureNode): Promise<IAzureTreeItem[]> {
        const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
        const webAppCollection: WebAppCollection = this._nextLink === undefined ?
            await client.webApps.list() :
            await client.webApps.listNext(this._nextLink);

        this._nextLink = webAppCollection.nextLink;

        return webAppCollection
            .filter((site: Site) => site.kind === 'functionapp')
            .map((site: Site) => new FunctionAppTreeItem(site, this._outputChannel));
    }

    public async createChild(parent: IAzureNode, showCreatingNode: (label: string) => void): Promise<IAzureTreeItem> {
        const site: Site | undefined = await appServiceTools.createFunctionApp(this._outputChannel, this._globalState, parent.credentials, parent.subscription, showCreatingNode);
        if (site) {
            return new FunctionAppTreeItem(site, this._outputChannel);
        } else {
            throw new UserCancelledError();
        }
    }
}
