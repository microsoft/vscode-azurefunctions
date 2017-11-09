/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, Memento, OutputChannel, TreeDataProvider, TreeItem } from 'vscode';
import { AzureAccount, AzureResourceFilter } from './azure-account.api';
import { IUserInterface, PickWithData } from './IUserInterface';
import { localize } from './localize';
import { CreateChildFunction, NodeBase } from './nodes/NodeBase';
import { SubscriptionNode } from './nodes/SubscriptionNode';
import { VSCodeUI } from './VSCodeUI';

export class AzureFunctionsExplorer implements TreeDataProvider<NodeBase> {
    private _onDidChangeTreeDataEmitter: EventEmitter<NodeBase> = new EventEmitter<NodeBase>();
    private _azureAccount: AzureAccount;
    private _globalState: Memento;
    private _outputChannel: OutputChannel;
    private _rootNodes: NodeBase[] = [];
    private _ui: IUserInterface;

    private _loginCommandId: string = 'azure-account.login';

    constructor(globalState: Memento, outputChannel: OutputChannel, azureAccount: AzureAccount, ui: IUserInterface = new VSCodeUI()) {
        this._globalState = globalState;
        this._outputChannel = outputChannel;
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
                return [new NodeBase(undefined, 'azureFunctionsLoading', localize('azFunc.loadingNode', 'Loading...', undefined, this._loginCommandId))];
            } else if (this._azureAccount.status === 'LoggedOut') {
                return [new NodeBase(undefined, 'azureFunctionsSignInToAzure', localize('azFunc.signInNode', 'Sign in to Azure...'), undefined, this._loginCommandId)];
            } else if (this._azureAccount.filters.length === 0) {
                return [new NodeBase(undefined, 'azureFunctionsNoSubscriptions', localize('azFunc.noSubscriptionsNode', 'No subscriptions found. Edit filters...'), undefined, 'azure-account.selectSubscriptions')];
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
        let quickPicksTask: Promise<PickWithData<NodeBase | CreateChildFunction>[]> = Promise.resolve(this._rootNodes.map((c: NodeBase) => new PickWithData<NodeBase>(c, c.label)));

        while (childType) {
            const pick: PickWithData<NodeBase | CreateChildFunction> = await this._ui.showQuickPick<NodeBase | CreateChildFunction>(quickPicksTask, localize('azFunc.selectNode', 'Select a {0}', childType));
            let node: NodeBase;
            if (pick.data instanceof NodeBase) {
                node = pick.data;
            } else {
                node = await pick.data(this._globalState, this._outputChannel);
            }

            if (node.contextValue === expectedContextValue) {
                return node;
            }

            childType = node.childType;
            quickPicksTask = node.getChildren(false).then((nodes: NodeBase[]): PickWithData<NodeBase | CreateChildFunction>[] => {
                const picks: PickWithData<NodeBase | CreateChildFunction>[] = nodes.map((c: NodeBase) => new PickWithData<NodeBase | CreateChildFunction>(c, c.label));
                if (node.createChild && node.childType) {
                    picks.unshift(new PickWithData<CreateChildFunction>(node.createChild, localize('azFunc.NodePickerCreateNew', '$(plus) Create New {0}', node.childType)));
                }
                return picks;
            });
        }

        throw new Error(localize('azFunc.noResourcesError', 'No matching resources found.'));
    }
}
