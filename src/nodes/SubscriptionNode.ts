/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as path from 'path';
import * as vscode from 'vscode';
import { Site, WebAppCollection } from '../../node_modules/azure-arm-website/lib/models';
import { AzureResourceFilter } from '../azure-account.api';
import * as errors from '../errors';
import { FunctionAppNode } from './FunctionAppNode';
import { INode } from './INode';

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
            light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'AzureSubscription.svg'),
            dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'AzureSubscription.svg')
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
