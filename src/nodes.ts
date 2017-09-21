/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'path';
import * as WebSiteModels from '../node_modules/azure-arm-website/lib/models';

import { AzureResourceFilter } from './azure-account.api';
import WebSiteManagementClient = require('azure-arm-website');

export interface INode extends vscode.TreeItem {
    id: string;
    tenantId?: string;
    getChildren?(): Promise<INode[]>;
}

export class GenericNode implements INode {
    readonly contextValue: string;
    readonly command: vscode.Command;
    constructor(readonly id: string, readonly label: string, commandId?: string) {
        this.contextValue = id;
        if (commandId) {
            this.command = {
                command: commandId,
                title: ''
            };
        }
    }
}

export class SubscriptionNode implements INode {
    readonly contextValue: string = 'azureFunctionsSubscription';
    readonly label: string;
    readonly id: string;

    readonly collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private readonly subscriptionFilter: AzureResourceFilter) {
        this.label = subscriptionFilter.subscription.displayName!;
        this.id = subscriptionFilter.subscription.subscriptionId!;
    }

    get iconPath(): any {
        return {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'AzureSubscription.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'AzureSubscription.svg')
        };
    }

    async getChildren(): Promise<INode[]> {
        const client = new WebSiteManagementClient(this.subscriptionFilter.session.credentials, this.id);
        const webApps = await client.webApps.list();
        return webApps.filter(s => s.kind === "functionapp")
            .sort((s1, s2) => s1.id!.localeCompare(s2.id!))
            .map(s => new FunctionAppNode(s, this.subscriptionFilter.session.tenantId));
    }
}

export class FunctionAppNode implements INode {
    readonly contextValue: string = 'azureFunctionsFunctionApp';
    readonly label: string;
    readonly id: string;

    constructor(readonly functionApp: WebSiteModels.Site, readonly tenantId?: string) {
        this.label = `${functionApp.name} (${this.functionApp.resourceGroup})`;
        this.id = functionApp.id!;
    }

    get iconPath(): any {
        return {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'AzureFunctionsApp.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'AzureFunctionsApp.svg')
        };
    }
}
