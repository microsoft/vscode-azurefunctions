/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, TreeDataProvider, TreeItem } from 'vscode';
import { AzureAccount, AzureResourceFilter } from './azure-account.api';
import { IUserInterface, PickWithData } from './IUserInterface';
import { localize } from './localize';
import { NodeBase } from './nodes/NodeBase';
import { SubscriptionNode } from './nodes/SubscriptionNode';
import { VSCodeUI } from './VSCodeUI';

export class AzureFunctionsExplorer implements TreeDataProvider<NodeBase> {
    private _onDidChangeTreeDataEmitter: EventEmitter<NodeBase> = new EventEmitter<NodeBase>();
    private _azureAccount: AzureAccount;
    private _rootNodes: NodeBase[] = [];
    private _ui: IUserInterface;

    constructor(azureAccount: AzureAccount, ui: IUserInterface = new VSCodeUI()) {
        this._azureAccount = azureAccount;
        this._ui = ui;
    }

    public get onDidChangeTreeData(): Event<NodeBase> {
        return this._onDidChangeTreeDataEmitter.event;
    }

    public getTreeItem(node: NodeBase): TreeItem {
        return node;
    }

    public async getChildren(node?: NodeBase): Promise<NodeBase[]> {
        if (node) {
            return await node.getChildren();
        } else { // Root of the explorer
            this._rootNodes = [];

            if (this._azureAccount.status === 'Initializing' || this._azureAccount.status === 'LoggingIn') {
                return [new NodeBase('azureFunctionsLoading', localize('azFunc.loadingNode', 'Loading...'))];
            } else if (this._azureAccount.status === 'LoggedOut') {
                return [new NodeBase('azureFunctionsSignInToAzure', localize('azFunc.signInNode', 'Sign in to Azure...'), undefined, 'azure-account.login')];
            } else if (this._azureAccount.filters.length === 0) {
                return [new NodeBase('azureFunctionsNoSubscriptions', localize('azFunc.noSubscriptionsNode', 'No subscriptions found. Edit filters...'), undefined, 'azure-account.selectSubscriptions')];
            } else {
                this._rootNodes = this._azureAccount.filters.map((filter: AzureResourceFilter) => SubscriptionNode.CREATE(filter));

                return this._rootNodes;
            }
        }
    }

    public refresh(node?: NodeBase): void {
        this._onDidChangeTreeDataEmitter.fire(node);
    }

    public async showNodePicker(expectedContextValue: string): Promise<NodeBase> {
        let childType: string | undefined = 'Subscription';
        let quickPicksTask: Promise<PickWithData<NodeBase>[]> = Promise.resolve(this._rootNodes.map((c: NodeBase) => new PickWithData<NodeBase>(c, c.label)));

        while (childType) {
            const pick: PickWithData<NodeBase> = await this._ui.showQuickPick<NodeBase>(quickPicksTask, localize('azFunc.selectNode', 'Select a {0}', childType));
            const node: NodeBase = pick.data;
            if (node.contextValue === expectedContextValue) {
                return node;
            }

            childType = node.childType;
            quickPicksTask = node.getChildren(false).then((nodes: NodeBase[]): PickWithData<NodeBase>[] => {
                return nodes.map((c: NodeBase) => new PickWithData<NodeBase>(c, c.label));
            });
        }

        throw new Error(localize('azFunc.noResourcesError', 'No matching resources found.'));
    }
}
