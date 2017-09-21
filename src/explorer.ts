/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeDataProvider, Event, EventEmitter, TreeItem } from 'vscode';
import { LoadingNode, NoSubscriptionsNode, SignInToAzureNode, SubscriptionNode, INode } from './nodes';
import { AzureAccount } from './azure-account.api';

export class AzureFunctionsExplorer implements TreeDataProvider<INode> {
    private _onDidChangeTreeData: EventEmitter<INode> = new EventEmitter<INode>();
    readonly onDidChangeTreeData: Event<INode> = this._onDidChangeTreeData.event;

    constructor(private azureAccount: AzureAccount) {
    }

    getTreeItem(node: INode): TreeItem {
        return node;
    }

    async getChildren(node?: INode): Promise<INode[]> {
        if (node) {
            return node.getChildren ? await node.getChildren() : [];
        } else { // Root of the explorer
            if (this.azureAccount.status === "Initializing" || this.azureAccount.status === "LoggingIn") {
                return [new LoadingNode()];
            } else if (this.azureAccount.status === "LoggedOut") {
                return [new SignInToAzureNode()];
            } else if (this.azureAccount.filters.length === 0) {
                return [new NoSubscriptionsNode()];
            } else {
                return this.azureAccount.filters.map(filter => new SubscriptionNode(filter))
            }
        }
    }

    refresh(node?: INode): void {
        this._onDidChangeTreeData.fire(node);
    }
}