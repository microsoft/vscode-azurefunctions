/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtLMTool, IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { getRecentLogsPlainText } from '../../../funcCoreTools/funcHostErrorUtils';
import { runningFuncTaskMap, stoppedFuncTasks } from '../../../funcCoreTools/funcHostTask';
import { localize } from '../../../localize';
import { getFunctionProjectFolders, pickWorkspaceFolder } from '../utils/pickWorkspaceFolder';

export interface IGetFuncHostLogsInput {
    /**
     * Optional name of the workspace folder to read logs from.
     * Defaults to the only open folder, or prompts in multi-root workspaces.
     */
    workspaceFolderName?: string;

    /**
     * Optional number of log chunks to return (default: 250).
     * Each chunk is a raw terminal output segment — roughly one to a few lines.
     * getRecentLogs() in funcHostErrorUtils.ts slices the ring-buffer (max 1000 entries) from the tail.
     */
    limit?: number;

    /**
     * If true and no running host is found, return logs from the most recently stopped session.
     * Useful for post-mortem analysis after an unexpected crash or after stopDebugging is called.
     * The stopped session data lives in stoppedFuncTasks[] (newest first) in funcHostTask.ts.
     */
    includeHistory?: boolean;
}

export class GetFuncHostLogs implements AzExtLMTool<IGetFuncHostLogsInput> {
    // No prepareInvocation needed — this is a read-only tool with no side effects.

    public async invoke(
        context: IActionContext,
        options: vscode.LanguageModelToolInvocationOptions<IGetFuncHostLogsInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { workspaceFolderName, limit = 250, includeHistory = false } = options.input;
        const folder = await pickWorkspaceFolder(context, workspaceFolderName);

        // For a read-only tool, multi-root with no folder name is still worth asking about —
        // logs from the wrong folder would be confusing. Return the same re-invoke pattern.
        if (!folder) {
            const available = await getFunctionProjectFolders();
            const list = available.length > 0
                ? available.map(f => `- ${f.name}`).join('\n')
                : localize('getFuncHostLogs.noFunctionsFolders', '(no Azure Functions projects found in the current workspace)');
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    localize('getFuncHostLogs.needsFolderName',
                        'Multiple workspace folders are open. Ask the user which project\'s logs to show and re-invoke this tool with the workspaceFolderName parameter set to their answer.\n\nAvailable Azure Functions projects:\n{0}', list)
                ),
            ]);
        }

        // First, try to get logs from the currently running func host task.
        // runningFuncTaskMap is keyed by WorkspaceFolder and holds IRunningFuncTask objects,
        // each of which has a `logs: string[]` ring-buffer populated by the terminal stream reader
        // in funcHostTask.ts (the `for await (const chunk of task.stream)` loop).
        const runningTask = runningFuncTaskMap.get(folder);

        if (runningTask) {
            // getRecentLogsPlainText strips ANSI control sequences and returns the last `limit` chunks joined.
            // This is the same function used by the "Copy Recent Logs" and "Show Recent Logs" debug view commands.
            const logs = getRecentLogsPlainText(runningTask, limit);

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Func host is running on port ${runningTask.portNumber}. Recent output (last ${limit} chunks):`),
                new vscode.LanguageModelTextPart(logs || localize('getFuncHostLogs.noOutput', 'No output captured yet. The host may still be initializing.')),
            ]);
        }

        // Fall back to the most recently stopped session if requested.
        // stoppedFuncTasks[] is maintained in funcHostTask.ts — entries are prepended (newest first) when
        // onDidEndTaskProcess fires, and cleared by azureFunctions.funcHostDebug.clearStoppedSessions.
        if (includeHistory && stoppedFuncTasks.length > 0) {
            const stoppedTask = stoppedFuncTasks.find(t => typeof t.workspaceFolder === 'object' && t.workspaceFolder.name === folder.name);

            if (stoppedTask) {
                const logs = getRecentLogsPlainText(stoppedTask, limit);
                const ranFor = Math.round((stoppedTask.stopTime.getTime() - stoppedTask.startTime.getTime()) / 1000);

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(`Func host is not currently running. Showing logs from last stopped session (port ${stoppedTask.portNumber}, ran for ${ranFor}s, stopped at ${stoppedTask.stopTime.toLocaleTimeString()}):`),
                    new vscode.LanguageModelTextPart(logs || localize('getFuncHostLogs.noHistoryOutput', 'No logs were captured for the last session.')),
                ]);
            }
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
                localize('getFuncHostLogs.notRunning', 'No func host is currently running for workspace "{0}". Start a debug session first with the Start Debugging tool.', folder.name)
            ),
        ]);
    }
}
