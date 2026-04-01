/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtLMTool, IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { runningFuncTaskMap, stopFuncTaskIfRunning } from '../../../funcCoreTools/funcHostTask';
import { localize } from '../../../localize';
import { getFunctionProjectFolders, pickWorkspaceFolder } from '../utils/pickWorkspaceFolder';

export interface IStopDebuggingInput {
    /**
     * Optional name of the workspace folder whose debug session should be stopped.
     * If omitted and only one workspace folder is running a func host, it will be used automatically.
     */
    workspaceFolderName?: string;
}

export class StopDebugging implements AzExtLMTool<IStopDebuggingInput> {
    public async prepareInvocation(
        context: IActionContext,
        options: vscode.LanguageModelToolInvocationPrepareOptions<IStopDebuggingInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation> {
        // Always show a confirmation. Include the port if we can resolve the running task,
        // fall back to a generic message if the folder isn't known yet.
        const folder = await pickWorkspaceFolder(context, options.input.workspaceFolderName);
        const task = folder ? runningFuncTaskMap.get(folder) : undefined;
        const portLabel = task ? ` (port ${task.portNumber})` : '';
        const folderLabel = folder ? `**${folder.name}**` : 'your project';

        return {
            invocationMessage: localize('stopDebugging.stopping', 'Stopping func host...'),
            confirmationMessages: {
                title: localize('stopDebugging.confirmTitle', 'Stop Debugging'),
                message: new vscode.MarkdownString(
                    localize('stopDebugging.confirmMessage', 'Stop the func host{0} and debug session for {1}?', portLabel, folderLabel)
                ),
            },
        };
    }

    public async invoke(
        context: IActionContext,
        options: vscode.LanguageModelToolInvocationOptions<IStopDebuggingInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const folder = await pickWorkspaceFolder(context, options.input.workspaceFolderName);

        if (!folder) {
            const available = await getFunctionProjectFolders();
            const list = available.length > 0
                ? available.map(f => `- ${f.name}`).join('\n')
                : localize('stopDebugging.noFunctionsFolders', '(no Azure Functions projects found in the current workspace)');
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    localize('stopDebugging.needsFolderName',
                        'Multiple workspace folders are open. Ask the user which func host to stop and re-invoke this tool with the workspaceFolderName parameter set to their answer.\n\nAvailable Azure Functions projects:\n{0}', list)
                ),
            ]);
        }
        const hasRunning = runningFuncTaskMap.has(folder);
        if (!hasRunning) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(localize('stopDebugging.notRunning', 'No running func host found for workspace "{0}".', folder.name)),
            ]);
        }

        // stopFuncTaskIfRunning first tries to terminate the real func process by finding the PID
        // listening on the port (via lsof/netstat), then falls back to terminating the task shell.
        // killAll=true handles multi-host scenarios (e.g., multiple func processes in the same folder).
        await stopFuncTaskIfRunning(folder, undefined, true, false);

        // Also stop the VS Code debug session (the "Attach to * Functions" session) if one is active.
        // Without this, the debugger UI remains in a broken "attached" state even after the host exits.
        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession && activeSession.workspaceFolder?.name === folder.name) {
            await vscode.debug.stopDebugging(activeSession);
        } else {
            // Fallback: stop whatever the active session is.
            // TODO: iterate debug sessions to find the exact session for this workspace folder
            // when multiple debug sessions are open.
            await vscode.debug.stopDebugging();
        }

        // After stopping, a StoppedHostNode will appear in the Function Host Debug View.
        // The errorLogs and logs from the session are preserved in stoppedFuncTasks[] so they remain
        // available via azurefunctions_getFuncHostErrors even after the host exits.
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
                localize('stopDebugging.success', 'Stopped the func host and debug session for workspace "{0}". Use "Get Func Host Errors" to review any errors that occurred before shutdown.', folder.name)
            ),
        ]);
    }
}
