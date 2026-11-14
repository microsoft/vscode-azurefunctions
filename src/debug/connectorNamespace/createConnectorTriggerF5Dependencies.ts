/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { commands } from 'vscode';
import { type ConnectorTriggerAzureContext, type ConnectorTriggerDataClient } from '../../commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient';
import { readConnectorTriggerProjectEvents, readConnectorTriggerProjectMetadata } from '../../connectorTrigger/connectorTriggerProjectMetadata';
import { ext } from '../../extensionVariables';
import { AzureConnectorTriggerGatewayAdapter } from './AzureConnectorTriggerF5Adapters';
import { ProjectConnectorTriggerBindingResolver } from './ConnectorTriggerF5BindingResolver';
import { type ConnectorTriggerF5Dependencies, type ConnectorTriggerSetupScopes, type ConnectorTriggerSetupScope } from './connectorTriggerF5Contracts';
import { SwaggerConnectorTriggerOperationResolver } from './SwaggerConnectorTriggerOperationResolver';

export function createConnectorTriggerF5Dependencies(
    _context: IActionContext,
    _projectPath: string,
): Promise<ConnectorTriggerF5Dependencies> {
    const gateway = new AzureConnectorTriggerGatewayAdapter();
    const operationResolver = new SwaggerConnectorTriggerOperationResolver(gateway, gateway);
    return Promise.resolve({
        bindingResolver: new ProjectConnectorTriggerBindingResolver(),
        gateway,
        projectStore: {
            read: readConnectorTriggerProjectMetadata,
            readEvents: readConnectorTriggerProjectEvents,
        },
        operationResolver,
        openSetup: async (context, request) => {
            const { ConnectorTriggerSetupController } = await import('./ConnectorTriggerSetupController.js');
            const { ConnectorTriggerDataClient } = await import('../../commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient.js');
            const scopes = createConnectorTriggerSetupScopes(new ConnectorTriggerDataClient(), async () => {
                await commands.executeCommand('azureResourceGroups.logIn');
            });
            return ConnectorTriggerSetupController.open(ext.context, context, request, gateway, operationResolver, scopes);
        },
    });
}

/**
 * The same subscription ID can be listed under several Azure Resources accounts, so every lookup carries the
 * selected option's account rather than resolving the first subscription with that ID.
 */
export function createConnectorTriggerSetupScopes(
    data: Pick<ConnectorTriggerDataClient,
        'listSubscriptionScopes' | 'getSubscriptionContext' | 'listLocations' | 'getCatalog' |
        'listConnectorOperations' | 'invalidateSubscriptions'>,
    signIn: () => Promise<void>,
): ConnectorTriggerSetupScopes {
    return {
        listSubscriptions: async (_context, showAll) => await data.listSubscriptionScopes(showAll),
        getSubscription: async (_context, option) => {
            const subscription = await data.getSubscriptionContext(option.id, option.accountId);
            return {
                id: subscription.subscriptionId,
                tenantId: subscription.tenantId,
                accountId: option.accountId,
                environment: {
                    name: subscription.environment.name,
                    resourceManagerEndpointUrl: subscription.environment.resourceManagerEndpointUrl,
                },
            };
        },
        listRegions: async (actionContext, option) =>
            (await data.listLocations(actionContext, option.id, option.accountId)).map(location => ({
                id: location.name, label: location.label, regionCategory: location.regionCategory,
            })),
        listConnectors: async (actionContext, scope) =>
            (await data.getCatalog(actionContext, toCatalogContext(scope))).catalog.connectors,
        listEvents: async (actionContext, scope, connectorId) =>
            (await data.listConnectorOperations(actionContext, toCatalogContext(scope), connectorId))
                .map(operation => ({ id: operation.id, label: operation.label })),
        signIn: async () => {
            await signIn();
            data.invalidateSubscriptions();
        },
    };
}

function toCatalogContext(scope: ConnectorTriggerSetupScope): ConnectorTriggerAzureContext {
    return {
        subscriptionId: scope.subscription.id,
        accountId: scope.subscription.accountId,
        subscriptionName: scope.subscription.id,
        region: scope.region,
        regionDisplayName: scope.region,
    };
}
