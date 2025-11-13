/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

<<<<<<< HEAD
import { AzExtFsExtra, DialogResponses, UserCancelledError } from "@microsoft/vscode-azext-utils";
import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as vscode from 'vscode';
=======
import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as vscode from 'vscode';
import { type WorkspaceFolder } from "vscode";
>>>>>>> f1ea2b825b2b83206fc51769450aff7c6172fae1
import { hostFileName, McpProjectType, mcpProjectTypeSetting, mcpSelfHostedConfigurationProfile } from "../constants";
import { type IHostJsonV2 } from "../funcConfig/host";
import { type SlotTreeItem } from "../tree/SlotTreeItem";
import { getWorkspaceSetting, updateWorkspaceSetting } from "../vsCodeConfig/settings";

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

export async function isMcpProject(projectPath: string): Promise<boolean> {
    const mcpProjectType = getWorkspaceSetting(mcpProjectTypeSetting, projectPath);
    if (mcpProjectType === McpProjectType.SelfHostedMcpServer || mcpProjectType === McpProjectType.McpExtensionServer) {
        return true;
    }

    const hostFilePath: string = path.join(projectPath, hostFileName);
    if (!(await AzExtFsExtra.pathExists(hostFilePath))) {
        return false;
    }

    const hostJson = await AzExtFsExtra.readJSON(hostFilePath) as IHostJsonV2;
    if (hostJson.configurationProfile === mcpSelfHostedConfigurationProfile) {
        await updateWorkspaceSetting(mcpProjectTypeSetting, McpProjectType.SelfHostedMcpServer, projectPath);
        return true;
    }

    if (hostJson.extensions?.mcp) {
        await updateWorkspaceSetting(mcpProjectTypeSetting, McpProjectType.McpExtensionServer, projectPath);
        return true;
    }

    return false;
}

export async function getOrCreateMcpJson(projectPath: string): Promise<McpJson> {
    const mcpJsonFilePath: string = path.join(projectPath, '.vscode', 'mcp.json');
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

export async function saveMcpJson(projectPath: string, mcpJson: McpJson): Promise<void> {
    const mcpJsonFilePath: string = path.join(projectPath, '.vscode', 'mcp.json');
    const mcpJsonContent: string = JSON.stringify(mcpJson, undefined, 4);
    await AzExtFsExtra.writeFile(mcpJsonFilePath, mcpJsonContent);
}

export function checkIfMcpServerExists(mcpJson: McpJson, serverName: string): boolean {
    if (!mcpJson.servers) {
        mcpJson.servers = {};
        return false;
    }

    if (mcpJson.servers[serverName]) {
        return true;
    }

    return false;
}

export function getLocalServerName(projectPath: string): string {
    return `${path.basename(projectPath)}-local-server`;
}

export function getRemoteServerName(ti: SlotTreeItem): string {
    return `${ti.site.fullName}-remote-server`;
}

export async function addLocalMcpServer(mcpJson: McpJson, serverName: string, projectType: McpProjectType): Promise<McpJson> {
    const url = projectType === McpProjectType.SelfHostedMcpServer ?
        'http://localhost:7071/mcp' :
        'http://localhost:7071/runtime/webhooks/mcp';

    if (!mcpJson.servers) {
        throw new Error(vscode.l10n.t('Internal error: mcp.json servers property is undefined.'));
    }
    mcpJson.servers[serverName] = {
        type: "http",
        url
    };

    return mcpJson;
}

export async function addRemoteMcpServer(mcpJson: McpJson, ti: SlotTreeItem, projectType: McpProjectType): Promise<McpJson> {
    const url = projectType === McpProjectType.SelfHostedMcpServer ?
        ti.site.defaultHostUrl + '/mcp' :
        ti.site.defaultHostUrl + '/runtime/webhooks/mcp';
    const serverName = getRemoteServerName(ti);
    if (!mcpJson.servers) {
        throw new Error(vscode.l10n.t('Internal error: mcp.json servers property is undefined.'));
    }

    mcpJson.servers[serverName] = {
        type: "http",
        url,
        headers: {
            'x-functions-key': `$\{input:${ti.site.fullName}McpHostKey\}`
        }
    };

    mcpJson.inputs = mcpJson.inputs || [];
    mcpJson.inputs.push({
        type: "command",
        id: `${ti.site.fullName}McpHostKey`,
        command: `azureFunctions.getMcpHostKey`,
        args: {
            resourceId: ti.site.id,
            projectType
        }
    });

    return mcpJson;
}
