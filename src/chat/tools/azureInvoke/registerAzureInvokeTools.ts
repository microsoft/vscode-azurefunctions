/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMcpToolWithTelemetry } from '@microsoft/vscode-inproc-mcp/vscode';
import type { McpServer } from '@modelcontextprotocol/server';
import { type AzureInvokeClients } from '../../../webviews/azureInvoke/extension/AzureInvokeClients';
import { createHttpInvocationTool } from './createHttpInvocationTool';
import { listHttpInvocationsTool } from './listHttpInvocationsTool';
import { runHttpInvocationTool } from './runHttpInvocationTool';

export function registerAzureInvokeTools(mcpServer: McpServer, azureInvoke: AzureInvokeClients): void {
    // HTTP invocations
    registerMcpToolWithTelemetry(mcpServer, createHttpInvocationTool(azureInvoke.provider));
    registerMcpToolWithTelemetry(mcpServer, listHttpInvocationsTool(azureInvoke.provider));
    registerMcpToolWithTelemetry(mcpServer, runHttpInvocationTool(azureInvoke.provider, azureInvoke.editors));
}
