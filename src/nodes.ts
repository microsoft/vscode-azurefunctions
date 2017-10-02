/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:import-name no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as path from 'path';
import * as vscode from 'vscode';
import { Site, WebAppCollection } from '../node_modules/azure-arm-website/lib/models';
import { AzureResourceFilter } from './azure-account.api';
import * as errors from './errors';
import * as util from './util';

export interface INode extends vscode.TreeItem {
    id: string;
    tenantId?: string;
    getChildren?(): Promise<INode[]>;
}

export class GenericNode implements INode {
    public readonly contextValue: string;
    public readonly command: vscode.Command;
    public readonly id: string;
    public readonly label: string;

    constructor(id: string, label: string, commandId?: string) {
        this.id = id;
        this.label = label;
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
    public readonly contextValue: string = 'azureFunctionsSubscription';
    public readonly label: string;
    public readonly id: string;
    public readonly tenantId: string;
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    private readonly subscriptionFilter: AzureResourceFilter;

    constructor(subscriptionFilter: AzureResourceFilter) {
        if (!subscriptionFilter.subscription.displayName || !subscriptionFilter.subscription.subscriptionId) {
            throw new errors.ArgumentError(subscriptionFilter);
        }

        this.subscriptionFilter = subscriptionFilter;
        this.label = subscriptionFilter.subscription.displayName;
        this.id = subscriptionFilter.subscription.subscriptionId;
        this.tenantId = subscriptionFilter.session.tenantId;
    }

    get iconPath(): { light: string, dark: string } {
        return {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'AzureSubscription.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'AzureSubscription.svg')
        };
    }

    public async getChildren(): Promise<INode[]> {
        const webApps: WebAppCollection = await this.getWebSiteClient().webApps.list();

        return webApps.filter((s: Site) => s.kind === 'functionapp')
            .map((s: Site) => new FunctionAppNode(s, this))
            .sort((f1: FunctionAppNode, f2: FunctionAppNode) => f1.id.localeCompare(f2.id));
    }

    public getWebSiteClient(): WebSiteManagementClient {
        return new WebSiteManagementClient(this.subscriptionFilter.session.credentials, this.id);
    }
}

export class FunctionAppNode implements INode {
    public readonly contextValue: string = 'azureFunctionsFunctionApp';
    public readonly label: string;
    public readonly id: string;
    public readonly tenantId: string;

    private readonly resourceGroup: string;
    private readonly name: string;
    private readonly subscriptionNode: SubscriptionNode;

    constructor(functionApp: Site, subscriptionNode: SubscriptionNode) {
        if (!functionApp.id || !functionApp.resourceGroup || !functionApp.name) {
            throw new errors.ArgumentError(functionApp);
        }

        this.id = functionApp.id;
        this.resourceGroup = functionApp.resourceGroup;
        this.name = functionApp.name;
        this.subscriptionNode = subscriptionNode;
        this.label = `${functionApp.name} (${this.resourceGroup})`;
        this.tenantId = subscriptionNode.tenantId;
    }

    get iconPath(): { light: string, dark: string } {
        return {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'AzureFunctionsApp.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'AzureFunctionsApp.svg')
        };
    }

    public async start(): Promise<void> {
        const client: WebSiteManagementClient = this.subscriptionNode.getWebSiteClient();
        await client.webApps.start(this.resourceGroup, this.name);
        await util.waitForFunctionAppState(client, this.resourceGroup, this.name, util.FunctionAppState.Running);
    }

    public async stop(): Promise<void> {
        const client: WebSiteManagementClient = this.subscriptionNode.getWebSiteClient();
        await client.webApps.stop(this.resourceGroup, this.name);
        await util.waitForFunctionAppState(client, this.resourceGroup, this.name, util.FunctionAppState.Stopped);
    }

    public async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }
}
