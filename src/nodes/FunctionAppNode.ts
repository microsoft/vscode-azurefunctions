/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:import-name no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as path from 'path';
import * as vscode from 'vscode';
import { Site } from '../../node_modules/azure-arm-website/lib/models';
import * as errors from '../errors';
import * as util from '../util';
import { INode } from './INode';
import { SubscriptionNode } from './SubscriptionNode';

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
            light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', `${this.contextValue}.svg`),
            dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', `${this.contextValue}.svg`)
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
