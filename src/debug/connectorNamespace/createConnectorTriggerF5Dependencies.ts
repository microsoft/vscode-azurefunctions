/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { commands } from 'vscode';
import { readConnectorTriggerProjectMetadata } from '../../connectorTrigger/connectorTriggerProjectMetadata';
import { ext } from '../../extensionVariables';
import { AzureConnectorTriggerGatewayAdapter } from './AzureConnectorTriggerF5Adapters';
import { ProjectConnectorTriggerBindingResolver } from './ConnectorTriggerF5BindingResolver';
import { type ConnectorTriggerF5Dependencies, type ConnectorTriggerSetupScopes } from './connectorTriggerF5Contracts';
import { SwaggerConnectorTriggerOperationResolver } from './SwaggerConnectorTriggerOperationResolver';

export function createConnectorTriggerF5Dependencies(
    _context: IActionContext,
    _projectPath: string,
): Promise<ConnectorTriggerF5Dependencies | undefined> {
    const gateway = new AzureConnectorTriggerGatewayAdapter();
    const operationResolver = new SwaggerConnectorTriggerOperationResolver(gateway, gateway);
    return Promise.resolve({
        bindingResolver: new ProjectConnectorTriggerBindingResolver(),
        gateway,
        projectStore: {
            read: readConnectorTriggerProjectMetadata,
            markComplete: async () => {
                // Keep the connector/event selection if local settings are later removed.
            },
        },
        operationResolver,
        openSetup: async (context, request) => {
            const { ConnectorTriggerSetupController } = await import('./ConnectorTriggerSetupController.js');
            const { ConnectorTriggerDataClient } = await import('../../commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient.js');
            const data = new ConnectorTriggerDataClient();
            const scopes: ConnectorTriggerSetupScopes = {
                listSubscriptions: async () => await data.listSubscriptions(true),
                getSubscription: async (_context, id) => {
                    const subscription = await data.getSubscriptionContext(id);
                    return {
                        id: subscription.subscriptionId,
                        tenantId: subscription.tenantId,
                        environment: {
                            name: subscription.environment.name,
                            resourceManagerEndpointUrl: subscription.environment.resourceManagerEndpointUrl,
                        },
                    };
                },
                listRegions: async (actionContext, id) =>
                    (await data.listLocations(actionContext, id)).map(location => ({ id: location.name, label: location.label })),
                signIn: async () => {
                    await commands.executeCommand('azureResourceGroups.logIn');
                    data.invalidateSubscriptions();
                },
            };
            return ConnectorTriggerSetupController.open(ext.context, context, request, gateway, operationResolver, scopes);
        },
    });
}
