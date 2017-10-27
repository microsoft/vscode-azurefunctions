/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, TreeDataProvider, TreeItem } from 'vscode';
import { AzureAccount, AzureResourceFilter } from './azure-account.api';
import { localize } from './localize';
import { NodeBase } from './nodes/NodeBase';
import { SubscriptionNode } from './nodes/SubscriptionNode';
import * as uiUtil from "./utils/ui";

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
                return [new NodeBase('azureFunctionsLoading', localize('azFunc.loadingNode', 'Loading...'))];
            } else if (this.azureAccount.status === 'LoggedOut') {
                return [new NodeBase('azureFunctionsSignInToAzure', localize('azFunc.signInNode', 'Sign in to Azure...'), undefined, 'azure-account.login')];
            } else if (this.azureAccount.filters.length === 0) {
                return [new NodeBase('azureFunctionsNoSubscriptions', localize('azFunc.noSubscriptionsNode', 'No subscriptions found. Edit filters...'), undefined, 'azure-account.selectSubscriptions')];
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
        let quickPicksTask: Promise<uiUtil.PickWithData<NodeBase>[]> = Promise.resolve(this.rootNodes.map((c: NodeBase) => new uiUtil.PickWithData<NodeBase>(c, c.label)));

        while (childType) {
            const pick: uiUtil.PickWithData<NodeBase> = await uiUtil.showQuickPick<NodeBase>(quickPicksTask, localize('azFunc.selectNode', 'Select a {0}', childType));
            const node: NodeBase = pick.data;
            if (node.contextValue === expectedContextValue) {
                return node;
            }

            childType = node.childType;
            quickPicksTask = node.getChildren(false).then((nodes: NodeBase[]): uiUtil.PickWithData<NodeBase>[] => {
                return nodes.map((c: NodeBase) => new uiUtil.PickWithData<NodeBase>(c, c.label));
            });
        }

        throw new Error(localize('azFunc.noResourcesError', 'No matching resources found.'));
    }
}
