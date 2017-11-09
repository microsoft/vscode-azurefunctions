/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { Site, WebAppCollection } from 'azure-arm-website/lib/models';
import { Memento, OutputChannel } from 'vscode';
import * as appServiceTools from 'vscode-azureappservice';
import { AzureResourceFilter } from '../azure-account.api';
import * as errors from '../errors';
import { UserCancelledError } from '../errors';
import { localize } from '../localize';
import { FunctionAppNode } from './FunctionAppNode';
import { NodeBase } from './NodeBase';

export class SubscriptionNode extends NodeBase {
    public static readonly contextValue: string = 'azureFunctionsSubscription';
    public readonly childType: string = 'Function App';

    public readonly subscriptionFilter: AzureResourceFilter;

    private constructor(id: string, name: string, subscriptionFilter: AzureResourceFilter) {
        super(undefined, id, name, SubscriptionNode.contextValue);
        this.subscriptionFilter = subscriptionFilter;
    }

    public static CREATE(subscriptionFilter: AzureResourceFilter): SubscriptionNode {
        if (!subscriptionFilter.subscription.displayName || !subscriptionFilter.subscription.subscriptionId) {
            throw new errors.ArgumentError(subscriptionFilter);
        }

        return new SubscriptionNode(subscriptionFilter.subscription.subscriptionId, subscriptionFilter.subscription.displayName, subscriptionFilter);
    }

    public async refreshChildren(): Promise<NodeBase[]> {
        const webApps: WebAppCollection = await getWebSiteClient(this).webApps.list();

        return webApps.filter((s: Site) => s.kind === 'functionapp')
            .map((s: Site) => FunctionAppNode.CREATE(this, s));
    }

    public createChild = async (globalState: Memento, outputChannel: OutputChannel): Promise<NodeBase> => {
        const site: Site | undefined = await appServiceTools.createFunctionApp(outputChannel, globalState, this.subscriptionFilter.session.credentials, this.subscriptionFilter.subscription);
        if (site) {
            return FunctionAppNode.CREATE(this, site);
        } else {
            throw new UserCancelledError();
        }
    }
}

export function getTenantId(node: NodeBase): string {
    const subscriptionNode: SubscriptionNode = getSubscriptionNode(node);
    return subscriptionNode.subscriptionFilter.session.tenantId;
}

export function getWebSiteClient(node: NodeBase): WebSiteManagementClient {
    const subscriptionNode: SubscriptionNode = getSubscriptionNode(node);
    return new WebSiteManagementClient(subscriptionNode.subscriptionFilter.session.credentials, subscriptionNode.id);
}

function getSubscriptionNode(node: NodeBase): SubscriptionNode {
    while (!(node instanceof SubscriptionNode)) {
        if (node.parent) {
            node = node.parent;
        } else {
            throw new Error(localize('azFunc.NoSubscriptionNode', 'Could not find Subscription Node'));
        }
    }

    return node;
}
