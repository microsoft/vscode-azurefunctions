/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerCommand, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { getRecentLogsPlainText } from '../funcCoreTools/funcHostErrorUtils';
import { onRunningFuncTasksChanged, runningFuncTaskMap, type IRunningFuncTask } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';
import { stripAnsiControlCharacters } from '../utils/ansiUtils';
import { FuncHostDebugViewProvider, type IHostErrorNode, type IHostTaskNode } from './FunctionHostDebugView';

const viewId = 'azureFunctions.funcHostDebugView';

function isHostTaskNode(node: unknown): node is IHostTaskNode {
    return !!node && typeof node === 'object' && (node as IHostTaskNode).kind === 'hostTask';
}

function isHostErrorNode(node: unknown): node is IHostErrorNode {
    return !!node && typeof node === 'object' && (node as IHostErrorNode).kind === 'hostError';
}

async function tryOpenDebugViewOnFirstFuncHostError(): Promise<void> {
    const newlyErroredTasks: IRunningFuncTask[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        for (const t of runningFuncTaskMap.getAll(folder)) {
            if (!t) {
                continue;
            }

            if ((t.errorLogs?.length ?? 0) > 0 && !t.hasReportedLiveErrors) {
                newlyErroredTasks.push(t);
            }
        }
    }

    if (newlyErroredTasks.length === 0) {
        return;
    }

    // Show Run & Debug view (Debug container) so the view (contributed under it) is visible.
    try {
        // Focus the specific tree view to expand it within the Debug sidebar.
        await vscode.commands.executeCommand(`${viewId}.focus`);
        // Mark as revealed only after the view open attempt, to avoid repeated calls.
        for (const t of newlyErroredTasks) {
            t.hasReportedLiveErrors = true;
        }
    } catch {
        // If this fails, leave flags untouched so we can try again later.
    }
}

export function registerFunctionHostDebugView(context: vscode.ExtensionContext): void {
    const provider = new FuncHostDebugViewProvider();

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(viewId, provider),
        onRunningFuncTasksChanged(() => {
            provider.refresh();
            void tryOpenDebugViewOnFirstFuncHostError();
        }),
    );

    registerCommand('azureFunctions.funcHostDebug.clearErrors', async (actionContext: IActionContext) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            for (const t of runningFuncTaskMap.getAll(folder)) {
                if (!t) {
                    continue;
                }

                if ((t.errorLogs?.length ?? 0) > 0) {
                    t.errorLogs = [];
                }
            }
        }

        provider.refresh();
    });

    registerCommand('azureFunctions.funcHostDebug.copyRecentLogs', async (actionContext: IActionContext, args: unknown) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        if (!isHostTaskNode(args)) {
            return;
        }

        const task = runningFuncTaskMap.get(args.workspaceFolder, args.cwd);
        const text = getRecentLogsPlainText(task);
        await vscode.env.clipboard.writeText(text);
    });

    registerCommand('azureFunctions.funcHostDebug.showRecentLogs', async (actionContext: IActionContext, args: unknown) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        if (!isHostTaskNode(args)) {
            return;
        }

        const task = runningFuncTaskMap.get(args.workspaceFolder, args.cwd);
        const text = getRecentLogsPlainText(task);

        const doc = await vscode.workspace.openTextDocument({
            content: text || localize('funcHostDebug.noLogs', 'No logs captured yet.'),
            language: 'log',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    });

    registerCommand('azureFunctions.funcHostDebug.askCopilot', async (actionContext: IActionContext, args: unknown) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        if (!isHostErrorNode(args)) {
            return;
        }

        // Use the exact message shown in the error node tooltip.
        const errorContext = stripAnsiControlCharacters(args.message).trim() || args.message;

        const scopeLabel = typeof args.workspaceFolder === 'object'
            ? args.workspaceFolder.name
            : localize('funcHostDebug.globalScope', 'Global');

        const prompt = [
            'I am debugging an Azure Functions project locally in VS Code.',
            `Function Host Port: ${args.portNumber}`,
            `Workspace: ${scopeLabel}`,
            args.cwd ? `CWD: ${args.cwd}` : undefined,
            '',
            'The Functions host produced an error. Diagnose the likely cause and suggest concrete next steps to fix it.',
            '',
            'Error output:',
            errorContext,
        ].filter((l): l is string => Boolean(l)).join('\n');

        await vscode.commands.executeCommand('workbench.action.chat.open', { mode: 'agent', query: prompt });
    });

    registerCommand('azureFunctions.funcHostDebug.refresh', async (actionContext: IActionContext) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        provider.refresh();
    });
}
