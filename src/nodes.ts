/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as util from './util';
import * as vscode from 'vscode';
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
    readonly tenantId: string;

    readonly collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private readonly _subscriptionFilter: AzureResourceFilter) {
        this.label = _subscriptionFilter.subscription.displayName!;
        this.id = _subscriptionFilter.subscription.subscriptionId!;
        this.tenantId = _subscriptionFilter.session.tenantId;
    }

    get iconPath(): any {
        return {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'AzureSubscription.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'AzureSubscription.svg')
        };
    }

    async getChildren(): Promise<INode[]> {
        const webApps = await this.getWebSiteClient().webApps.list();
        return webApps.filter(s => s.kind === "functionapp")
            .sort((s1, s2) => s1.id!.localeCompare(s2.id!))
            .map(s => new FunctionAppNode(s, this));
    }

    getWebSiteClient() {
        return new WebSiteManagementClient(this._subscriptionFilter.session.credentials, this.id);
    }
}

export class FunctionAppNode implements INode {
    readonly contextValue: string = 'azureFunctionsFunctionApp';
    readonly label: string;
    readonly id: string;
    readonly tenantId: string;

    constructor(private readonly _functionApp: WebSiteModels.Site, private readonly _subscriptionNode: SubscriptionNode) {
        this.label = `${_functionApp.name} (${this._functionApp.resourceGroup})`;
        this.id = _functionApp.id!;
        this.tenantId = _subscriptionNode.tenantId;
    }

    get iconPath(): any {
        return {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'AzureFunctionsApp.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'AzureFunctionsApp.svg')
        };
    }

    async start() {
        const client = this._subscriptionNode.getWebSiteClient();
        await client.webApps.start(this._functionApp.resourceGroup!, this._functionApp.name!);
        await util.waitForFunctionAppState(client, this._functionApp.resourceGroup!, this._functionApp.name!, util.FunctionAppState.Running);
    }

    async stop() {
        const client = this._subscriptionNode.getWebSiteClient();
        await client.webApps.stop(this._functionApp.resourceGroup!, this._functionApp.name!);
        await util.waitForFunctionAppState(client, this._functionApp.resourceGroup!, this._functionApp.name!, util.FunctionAppState.Stopped);
    }

    async restart() {
        await this.stop();
        await this.start();
    }
}
