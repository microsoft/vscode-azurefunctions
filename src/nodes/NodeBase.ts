/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as path from 'path';
import * as vscode from 'vscode';
import { TreeItem } from 'vscode';

export class NodeBase implements TreeItem {
    public static readonly contextValue: string = 'azureFunctionsNode';
    public contextValue: string;
    public label: string;
    public id: string;
    public collapsibleState: vscode.TreeItemCollapsibleState;
    public parent: NodeBase;
    public command?: vscode.Command;
    public childType?: string;

    private children: NodeBase[] | undefined;

    constructor(id: string, label: string, contextValue?: string, commandId?: string) {
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
            this.children.forEach((node: NodeBase) => node.parent = this);
        }

        return this.children ? this.children : [];
    }

    get tenantId(): string {
        // SubscriptionNode is the only node that needs to overwrite this
        return this.parent.tenantId;
    }

    public getWebSiteClient(): WebSiteManagementClient {
        // SubscriptionNode is the only node that needs to overwrite this
        return this.parent.getWebSiteClient();
    }

    protected refreshChildren?(): Promise<NodeBase[]>;
}
