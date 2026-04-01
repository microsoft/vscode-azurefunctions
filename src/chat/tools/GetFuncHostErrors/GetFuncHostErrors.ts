/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtLMTool, IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { runningFuncTaskMap, stoppedFuncTasks } from '../../../funcCoreTools/funcHostTask';
import { localize } from '../../../localize';
import { stripAnsiControlCharacters } from '../../../utils/ansiUtils';
import { getFunctionProjectFolders, pickWorkspaceFolder } from '../utils/pickWorkspaceFolder';

export interface IGetFuncHostErrorsInput {
    /**
     * Optional name of the workspace folder to read errors from.
     */
    workspaceFolderName?: string;

    /**
     * If true, also check stoppedFuncTasks[] for the most recently stopped session's errors.
     * Defaults to true so that errors are surfaced even after the host has shut down —
     * this is the most common scenario when the LM is diagnosing a crash or startup failure.
     */
    includeHistory?: boolean;
}

export class GetFuncHostErrors implements AzExtLMTool<IGetFuncHostErrorsInput> {
    // No prepareInvocation needed — read-only, no side effects.

    public async invoke(
        context: IActionContext,
        options: vscode.LanguageModelToolInvocationOptions<IGetFuncHostErrorsInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { workspaceFolderName, includeHistory = true } = options.input;
        const folder = await pickWorkspaceFolder(context, workspaceFolderName);

        if (!folder) {
            const available = await getFunctionProjectFolders();
            const list = available.length > 0
                ? available.map(f => `- ${f.name}`).join('\n')
                : localize('getFuncHostErrors.noFunctionsFolders', '(no Azure Functions projects found in the current workspace)');
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    localize('getFuncHostErrors.needsFolderName',
                        'Multiple workspace folders are open. Ask the user which project\'s errors to show and re-invoke this tool with the workspaceFolderName parameter set to their answer.\n\nAvailable Azure Functions projects:\n{0}', list)
                ),
            ]);
        }

        // errorLogs[] is a deduplicated subset of the full log stream — only lines that triggered the
        // red-ANSI detector in funcHostErrorUtils.ts (basicRedRegex / extended256RedRegex).
        // Each entry is a raw terminal chunk that may span multiple logical lines.
        // They are populated by addErrorLinesFromChunk() inside the stream-reading loop in funcHostTask.ts.
        const runningTask = runningFuncTaskMap.get(folder);

        if (runningTask) {
            const errorLogs = runningTask.errorLogs ?? [];
            const cleanErrors = errorLogs.map(e => stripAnsiControlCharacters(e).trim()).filter(Boolean);

            if (cleanErrors.length === 0) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(`Func host is running on port ${runningTask.portNumber} with no errors detected so far.`),
                ]);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Func host is running on port ${runningTask.portNumber}. ${cleanErrors.length} error(s) detected:`),
                // Each error is its own LanguageModelTextPart so the LM can reason about them individually.
                // The "prefer conversational explanation" instruction mirrors the pattern used in GetAzureActivityLog
                // in vscode-azureresourcegroups to discourage the LM from just re-printing raw output.
                new vscode.LanguageModelTextPart('Diagnose the likely cause of each error and suggest concrete next steps to fix it. Prefer conversational explanations over repeating raw log text.'),
                ...cleanErrors.map(e => new vscode.LanguageModelTextPart(e)),
            ]);
        }

        // Check the most recently stopped session — critical for startup crashes where the host exits
        // before the user has a chance to read the output. stoppedFuncTasks[] is preserved until
        // the user explicitly clears it via azureFunctions.funcHostDebug.clearStoppedSessions.
        if (includeHistory && stoppedFuncTasks.length > 0) {
            const stoppedTask = stoppedFuncTasks.find(t => typeof t.workspaceFolder === 'object' && t.workspaceFolder.name === folder.name);

            if (stoppedTask) {
                const cleanErrors = stoppedTask.errorLogs
                    .map(e => stripAnsiControlCharacters(e).trim())
                    .filter(Boolean);

                const ranFor = Math.round((stoppedTask.stopTime.getTime() - stoppedTask.startTime.getTime()) / 1000);
                const header = `Func host is not currently running (port ${stoppedTask.portNumber}, stopped at ${stoppedTask.stopTime.toLocaleTimeString()}, ran for ${ranFor}s).`;

                if (cleanErrors.length === 0) {
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(`${header} No errors were detected in the last session.`),
                    ]);
                }

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(`${header} ${cleanErrors.length} error(s) from last session:`),
                    new vscode.LanguageModelTextPart('Diagnose the likely cause of each error and suggest concrete next steps to fix it. Prefer conversational explanations over repeating raw log text.'),
                    ...cleanErrors.map(e => new vscode.LanguageModelTextPart(e)),
                ]);
            }
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
                localize('getFuncHostErrors.notRunning', 'No func host is currently running for workspace "{0}" and no recent session history is available.', folder.name)
            ),
        ]);
    }
}
