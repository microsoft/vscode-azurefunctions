/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServer } from '@modelcontextprotocol/server';
import { type AzureInvokeClients } from '../../webviews/azureInvoke/extension/AzureInvokeClients';
import { registerAzureInvokeTools } from './azureInvoke/registerAzureInvokeTools';

export function registerMcpTools(mcpServer: McpServer, azureInvoke: AzureInvokeClients): void {
    // Azure Invoke Tools
    registerAzureInvokeTools(mcpServer, azureInvoke);
}
