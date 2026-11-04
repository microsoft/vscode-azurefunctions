/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { readConnectorTriggerProjectHandoff } from '../../connectorTrigger/connectorTriggerProjectHandoff';
import { AzureConnectorTriggerGatewayAdapter } from './AzureConnectorTriggerF5Adapters';
import { ProjectConnectorTriggerBindingResolver } from './ConnectorTriggerF5BindingResolver';
import { type ConnectorTriggerF5Dependencies } from './connectorTriggerF5Contracts';
import { SwaggerConnectorTriggerOperationResolver } from './SwaggerConnectorTriggerOperationResolver';

export function createConnectorTriggerF5Dependencies(
    _context: IActionContext,
    _projectPath: string,
): Promise<ConnectorTriggerF5Dependencies | undefined> {
    const gateway = new AzureConnectorTriggerGatewayAdapter();
    return Promise.resolve({
        bindingResolver: new ProjectConnectorTriggerBindingResolver(),
        gateway,
        handoffStore: {
            read: readConnectorTriggerProjectHandoff,
            markComplete: async () => {
                // Keep the handoff as recovery metadata if local settings are later removed.
            },
        },
        operationResolver: new SwaggerConnectorTriggerOperationResolver(gateway, gateway),
    });
}
