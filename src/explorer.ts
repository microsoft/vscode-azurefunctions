/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, TreeDataProvider, TreeItem } from 'vscode';
import { AzureAccount } from './azure-account.api';
import { GenericNode, INode, SubscriptionNode } from './nodes';

export class AzureFunctionsExplorer implements TreeDataProvider<INode> {
    private _onDidChangeTreeData: EventEmitter<INode> = new EventEmitter<INode>();
    public readonly onDidChangeTreeData: Event<INode> = this._onDidChangeTreeData.event;

    constructor(private azureAccount: AzureAccount) {
    }

    public getTreeItem(node: INode): TreeItem {
        return node;
    }

    public async getChildren(node?: INode): Promise<INode[]> {
        if (node) {
            return node.getChildren ? await node.getChildren() : [];
        } else { // Root of the explorer
            if (this.azureAccount.status === 'Initializing' || this.azureAccount.status === 'LoggingIn') {
                return [new GenericNode('azureFunctionsLoading', 'Loading...')];
            } else if (this.azureAccount.status === 'LoggedOut') {
                return [new GenericNode('azureFunctionsSignInToAzure', 'Sign in to Azure...', 'azure-account.login')];
            } else if (this.azureAccount.filters.length === 0) {
                return [new GenericNode('azureFunctionsNoSubscriptions', 'No subscriptions found. Edit filters...', 'azure-account.selectSubscriptions')];
            } else {
                return this.azureAccount.filters.map(filter => new SubscriptionNode(filter));
            }
        }
    }

    public refresh(node?: INode): void {
        this._onDidChangeTreeData.fire(node);
    }
}
