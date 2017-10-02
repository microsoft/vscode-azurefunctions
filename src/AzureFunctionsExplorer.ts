/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, TreeDataProvider, TreeItem } from 'vscode';
import { AzureAccount, AzureResourceFilter } from './azure-account.api';
import { NodeBase } from './nodes/NodeBase';
import { SubscriptionNode } from './nodes/SubscriptionNode';
import * as util from './util';

export class AzureFunctionsExplorer implements TreeDataProvider<NodeBase> {
    private onDidChangeTreeDataEmitter: EventEmitter<NodeBase> = new EventEmitter<NodeBase>();
    private azureAccount: AzureAccount;
    private rootNodes: NodeBase[] = [];

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
            return await node.getChildren();
        } else { // Root of the explorer
            this.rootNodes = [];

            if (this.azureAccount.status === 'Initializing' || this.azureAccount.status === 'LoggingIn') {
                return [new NodeBase('azureFunctionsLoading', 'Loading...')];
            } else if (this.azureAccount.status === 'LoggedOut') {
                return [new NodeBase('azureFunctionsSignInToAzure', 'Sign in to Azure...', undefined, 'azure-account.login')];
            } else if (this.azureAccount.filters.length === 0) {
                return [new NodeBase('azureFunctionsNoSubscriptions', 'No subscriptions found. Edit filters...', undefined, 'azure-account.selectSubscriptions')];
            } else {
                this.rootNodes = this.azureAccount.filters.map((filter: AzureResourceFilter) => SubscriptionNode.CREATE(filter));

                return this.rootNodes;
            }
        }
    }

    public refresh(node?: NodeBase): void {
        this.onDidChangeTreeDataEmitter.fire(node);
    }

    public async showNodePicker(expectedContextValue: string): Promise<NodeBase> {
        let childType: string | undefined = 'Subscription';
        let quickPicksTask: Promise<util.PickWithData<NodeBase>[]> = Promise.resolve(this.rootNodes.map((c: NodeBase) => new util.PickWithData<NodeBase>(c, c.label)));

        while (childType) {
            const pick: util.PickWithData<NodeBase> = await util.showQuickPick<NodeBase>(quickPicksTask, `Select a ${childType}`);
            const node: NodeBase = pick.data;
            if (node.contextValue === expectedContextValue) {
                return node;
            }

            childType = node.childType;
            quickPicksTask = node.getChildren(false).then((nodes: NodeBase[]): util.PickWithData<NodeBase>[] => {
                return nodes.map((c: NodeBase) => new util.PickWithData<NodeBase>(c, c.label));
            });
        }

        throw new Error('No matching resources found.');
    }
}
