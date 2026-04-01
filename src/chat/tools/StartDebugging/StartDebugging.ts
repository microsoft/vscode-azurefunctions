/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtLMTool, IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../../localize';
import { getDebugConfigs } from '../../../vsCodeConfig/launch';

export interface IStartDebuggingInput {
    /**
     * The name of the launch configuration to run (from launch.json).
     * If not provided or not found, the tool returns available configurations
     * so the LM can ask the user which one to use.
     */
    launchConfigurationName?: string;

    /**
     * Optional name of the workspace folder to start debugging in.
     * If omitted and only one workspace folder exists, it will be used automatically.
     * In multi-root workspaces, the LM will ask the user to choose if this is not provided.
     */
    workspaceFolderName?: string;
}

function resolveWorkspaceFolder(name?: string): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (name) {
        return folders.find(f => f.name.toLowerCase() === name.toLowerCase());
    }
    return folders.length === 1 ? folders[0] : undefined;
}

export class StartDebugging implements AzExtLMTool<IStartDebuggingInput> {
    public async prepareInvocation(
        _context: IActionContext,
        options: vscode.LanguageModelToolInvocationPrepareOptions<IStartDebuggingInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation> {
        const folder = resolveWorkspaceFolder(options.input.workspaceFolderName);
        const folderLabel = folder ? `**${folder.name}**` : 'your project';
        const configLabel = options.input.launchConfigurationName
            ? ` using "${options.input.launchConfigurationName}"`
            : '';

        return {
            invocationMessage: localize('startDebugging.starting', 'Starting debug session...'),
            confirmationMessages: {
                title: localize('startDebugging.confirmTitle', 'Start Debugging'),
                message: new vscode.MarkdownString(
                    localize('startDebugging.confirmMessage', 'Start a debug session{0} for {1}?', configLabel, folderLabel)
                ),
            },
        };
    }

    public async invoke(
        _context: IActionContext,
        options: vscode.LanguageModelToolInvocationOptions<IStartDebuggingInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { launchConfigurationName, workspaceFolderName } = options.input;
        const folder = resolveWorkspaceFolder(workspaceFolderName);

        if (!folder) {
            const folders = vscode.workspace.workspaceFolders ?? [];
            const list = folders.map(f => `- ${f.name}`).join('\n');
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    localize('startDebugging.needsFolderName',
                        'Multiple workspace folders are open. Ask the user which project to debug and re-invoke this tool with the workspaceFolderName parameter.\n\nAvailable workspace folders:\n{0}', list)
                ),
            ]);
        }

        const configs = getDebugConfigs(folder);

        if (configs.length === 0) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    localize('startDebugging.noConfigs', 'No launch configurations found in launch.json for workspace "{0}".', folder.name)
                ),
            ]);
        }

        let debugConfig: vscode.DebugConfiguration | undefined;
        if (launchConfigurationName) {
            debugConfig = configs.find(c => c.name.toLowerCase() === launchConfigurationName.toLowerCase());
        }

        if (!debugConfig) {
            const configList = configs.map(c => `- ${c.name}`).join('\n');
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    localize('startDebugging.needsConfigName',
                        'Ask the user which launch configuration to use and re-invoke this tool with the launchConfigurationName parameter.\n\nAvailable launch configurations for "{0}":\n{1}', folder.name, configList)
                ),
            ]);
        }

        const started = await vscode.debug.startDebugging(folder, debugConfig);
        if (!started) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    localize('startDebugging.failed', 'Failed to start the debug session for configuration "{0}".', debugConfig.name)
                ),
            ]);
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
                localize('startDebugging.success', 'Debug session started for workspace "{0}" using configuration "{1}".', folder.name, debugConfig.name)
            ),
        ]);
    }
}
