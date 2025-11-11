/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as vscode from 'vscode';
import { type WorkspaceFolder } from "vscode";
import { hostFileName, mcpSelfHostedConfigurationProfile } from "../constants";
import { type IHostJsonV2 } from "../funcConfig/host";
import { type SlotTreeItem } from "../tree/SlotTreeItem";

export type McpJson = {
    servers?: {
        [key: string]: McpServerDefinition,
    };
    inputs?: Array<{
        type?: string;
        id?: string;
        command?: string;
        args?: {
            [key: string]: string;
        };
    }>;
}

type McpServerDefinition = {
    type: string;
    url: string;
    headers?: {
        [key: string]: string;
    };
}

export async function isMcpProject(workspaceFolder: WorkspaceFolder): Promise<boolean> {
    // TODO: Add a workspace setting that gets added on creation, other prompt the user if we detect the custom handler. Or MCP profile, we can assume it is MCP
    const hostFilePath: string = path.join(workspaceFolder.uri.fsPath, hostFileName);
    if (!(await AzExtFsExtra.pathExists(hostFilePath))) {
        return false;
    }

    const hostJson = await AzExtFsExtra.readJSON(hostFilePath) as IHostJsonV2;
    if (hostJson.configurationProfile === mcpSelfHostedConfigurationProfile) {
        return true;
    } else if (hostJson?.customHandler?.description?.defaultExecutablePath) {
        return true;
    }

    return false;
}

export async function getOrCreateMcpJson(workspaceFolder: WorkspaceFolder): Promise<McpJson> {
    const mcpJsonFilePath: string = path.join(workspaceFolder.uri.fsPath, '.vscode', 'mcp.json');
    if (await AzExtFsExtra.pathExists(mcpJsonFilePath)) {
        const mcpJsonContent: string = await AzExtFsExtra.readFile(mcpJsonFilePath);
        const errors: jsonc.ParseError[] = [];
        const parsed = jsonc.parse(mcpJsonContent, errors, {
            allowTrailingComma: true,
            disallowComments: false
        }) as McpJson;
        if (errors.length !== 0) {
            const errorString = errors.map(e => vscode.l10n.t(`Error at offset ${e.offset}: ${jsonc.printParseErrorCode(e.error)}`)).join(', ');
            throw new Error(vscode.l10n.t('Failed to parse mcp.json: {0}', errorString));
        }
        return parsed;
    } else {
        await AzExtFsExtra.ensureDir(path.dirname(mcpJsonFilePath));
        await AzExtFsExtra.ensureFile(mcpJsonFilePath);
        await AzExtFsExtra.writeFile(mcpJsonFilePath, '{}');
        return {};
    }
}

export async function saveMcpJson(workspaceFolder: WorkspaceFolder, mcpJson: McpJson): Promise<void> {
    const mcpJsonFilePath: string = path.join(workspaceFolder.uri.fsPath, '.vscode', 'mcp.json');
    const mcpJsonContent: string = JSON.stringify(mcpJson, undefined, 4);
    await AzExtFsExtra.writeFile(mcpJsonFilePath, mcpJsonContent);
}

export async function addRemoteMcpServer(mcpJson: McpJson, ti: SlotTreeItem): Promise<McpJson> {
    if (!mcpJson.servers) {
        mcpJson.servers = {};
    }

    mcpJson.servers[`${ti.site.fullName}-remote-server`] = {
        type: "http",
        url: ti.site.defaultHostUrl + '/mcp',
        headers: {
            'x-functions-key': `$\{input:${ti.site.fullName}McpHostKey\}`
        }
    };

    mcpJson.inputs = mcpJson.inputs || [];
    mcpJson.inputs.push({
        type: "command",
        id: `${ti.site.fullName}McpHostKey`,
        command: `azureFunctions.getDefaultHostKey`,
        args: {
            resourceId: ti.site.id
        }
    });

    return mcpJson;
}
