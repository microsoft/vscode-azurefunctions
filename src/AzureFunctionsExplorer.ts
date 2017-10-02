/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, TreeDataProvider, TreeItem } from 'vscode';
import { AzureAccount, AzureResourceFilter } from './azure-account.api';
import { GenericNode } from './nodes/GenericNode';
import { NodeBase } from './nodes/NodeBase';
import { SubscriptionNode } from './nodes/SubscriptionNode';

export class AzureFunctionsExplorer implements TreeDataProvider<NodeBase> {
    private onDidChangeTreeDataEmitter: EventEmitter<NodeBase> = new EventEmitter<NodeBase>();
    private azureAccount: AzureAccount;

    constructor(azureAccount: AzureAccount) {
        this.azureAccount = azureAccount;
    }

    public get onDidChangeTreeData(): Event<NodeBase> {
        return this.onDidChangeTreeDataEmitter.event;
    }

    public getTreeItem(node: NodeBase): TreeItem {
        return node;
    }

    public async getChildren(node?: NodeBase): Promise<NodeBase[]> {
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
                return this.azureAccount.filters.map((filter: AzureResourceFilter) => new SubscriptionNode(filter));
            }
        }
    }

    public refresh(node?: NodeBase): void {
        this.onDidChangeTreeDataEmitter.fire(node);
    }
}
