/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMcpToolWithTelemetry } from '@microsoft/vscode-inproc-mcp/vscode';
import type { McpServer } from '@modelcontextprotocol/server';
import { ext } from '../../../extensionVariables';
import { createHttpInvocationTool } from './createHttpInvocationTool';
import { listHttpInvocationsTool } from './listHttpInvocationsTool';
import { runHttpInvocationTool } from './runHttpInvocationTool';

export function registerAzureInvokeTools(mcpServer: McpServer): void {
    // HTTP invocations
    registerMcpToolWithTelemetry(mcpServer, createHttpInvocationTool(ext.invocationCollection));
    registerMcpToolWithTelemetry(mcpServer, listHttpInvocationsTool(ext.invocationCollection, ext.chainInvocationRunner));
    registerMcpToolWithTelemetry(mcpServer, runHttpInvocationTool(ext.invocationCollection, ext.chainInvocationRunner));
}
