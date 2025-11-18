/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityInfoContext, AzureWizardExecuteStep, createContextValue, nonNullProp, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import * as path from 'path';
import { ThemeIcon, Uri } from "vscode";
import { mcpProjectTypeSetting, type McpProjectType } from "../../constants";
import { localize } from "../../localize";
import { addRemoteMcpServer, checkIfMcpServerExists, getOrCreateMcpJson, getRemoteServerName, saveMcpJson } from "../../utils/mcpUtils";
import { getWorkspaceSetting } from "../../vsCodeConfig/settings";
import { type IFuncDeployContext } from "./deploy";

export class CreateRemoteMcpServerExecuteStep<T extends IFuncDeployContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 999;
    public stepName: string = 'CreateRemoteMcpServerExecuteStep';

    public async execute(context: T): Promise<void> {
        const node = nonNullProp(context, 'deployedNode');
        const mcpJson = await getOrCreateMcpJson(context.workspaceFolder.uri.fsPath);
        const serverName = getRemoteServerName(node);
        const mcpProjectType = getWorkspaceSetting(mcpProjectTypeSetting, context.workspaceFolder.uri.fsPath) as McpProjectType;
        // only add if it doesn't already exist
        if (!checkIfMcpServerExists(mcpJson, serverName)) {
            const newMcpJson = await addRemoteMcpServer(mcpJson, node, mcpProjectType);
            await saveMcpJson(context.workspaceFolder.uri.fsPath, newMcpJson);
        }
    }

    public createSuccessOutput(context: T): ExecuteActivityOutput {
        const connectMcpServer: string = localize('connectMcpServer', 'Connect to MCP Server');
        const mcpJsonFilePath: string = path.join(context.workspaceFolder.uri.fsPath, '.vscode', 'mcp.json');
        return {
            item: new ActivityChildItem({
                label: connectMcpServer,
                id: `${context.site?.id}-connectMcpServer`,
                command: {
                    command: 'vscode.open',
                    title: connectMcpServer,
                    arguments: [Uri.file(mcpJsonFilePath)]
                },
                activityType: ActivityChildType.Info,
                contextValue: createContextValue([activityInfoContext, 'connectMcpServer']),
                iconPath: new ThemeIcon('debug-disconnect'),
                // a little trick to remove the description timer on activity children
                description: ' '
            })
        };
    }

    public shouldExecute(context: T): boolean {
        return context.isMcpProject === true;
    }
}
