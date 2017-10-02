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
import { NodeBase } from './NodeBase';

export class SubscriptionNode extends NodeBase {
    public static readonly contextValue: string = 'azureFunctionsSubscription';
    public readonly childType: string = 'Function App';

    private readonly subscriptionFilter: AzureResourceFilter;

    private constructor(id: string, name: string, subscriptionFilter: AzureResourceFilter) {
        super(id, name, SubscriptionNode.contextValue);
        this.subscriptionFilter = subscriptionFilter;
    }

    public static CREATE(subscriptionFilter: AzureResourceFilter): SubscriptionNode {
        if (!subscriptionFilter.subscription.displayName || !subscriptionFilter.subscription.subscriptionId) {
            throw new errors.ArgumentError(subscriptionFilter);
        }

        return new SubscriptionNode(subscriptionFilter.subscription.subscriptionId, subscriptionFilter.subscription.displayName, subscriptionFilter);
    }

    public async refreshChildren(): Promise<NodeBase[]> {
        const webApps: WebAppCollection = await this.getWebSiteClient().webApps.list();

        return webApps.filter((s: Site) => s.kind === 'functionapp')
            .map((s: Site) => FunctionAppNode.CREATE(s));
    }

    get tenantId(): string {
        return this.subscriptionFilter.session.tenantId;
    }

    public getWebSiteClient(): WebSiteManagementClient {
        return new WebSiteManagementClient(this.subscriptionFilter.session.credentials, this.id);
    }
}
