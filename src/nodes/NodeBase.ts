/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { Memento, OutputChannel, TreeItem } from 'vscode';

export class NodeBase implements TreeItem {
    public static readonly contextValue: string = 'azureFunctionsNode';
    public contextValue: string;
    public label: string;
    public id: string;
    public collapsibleState: vscode.TreeItemCollapsibleState;
    public readonly parent: NodeBase | undefined;
    public command?: vscode.Command;
    public childType?: string;
    public readonly createChild?: CreateChildFunction;

    private children: NodeBase[] | undefined;

    constructor(parent: NodeBase | undefined, id: string, label: string, contextValue?: string, commandId?: string) {
        this.parent = parent;
        this.id = id;
        this.label = label;
        this.contextValue = contextValue || NodeBase.contextValue;

        if (commandId) {
            this.command = {
                command: commandId,
                title: ''
            };
        }

        if (this.refreshChildren) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
    }

    get iconPath(): { light: string, dark: string } | undefined {
        return this.contextValue === NodeBase.contextValue ? undefined : {
            light: path.join(__filename, '..', '..', '..', '..', 'resources', `${this.contextValue}.svg`),
            dark: path.join(__filename, '..', '..', '..', '..', 'resources', `${this.contextValue}.svg`)
        };
    }

    public async getChildren(forceRefresh: boolean = true): Promise<NodeBase[]> {
        if (this.refreshChildren && (!this.children || forceRefresh)) {
            this.children = await this.refreshChildren();
        }

        return this.children ? this.children : [];
    }

    protected refreshChildren?(): Promise<NodeBase[]>;
}

export type CreateChildFunction = (globalState: Memento, outputChannel: OutputChannel) => Promise<NodeBase>;
