/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerCommand, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { getRecentLogsPlainText } from '../funcCoreTools/funcHostErrorUtils';
import { clearStoppedSessions, onRunningFuncTasksChanged, runningFuncTaskMap, type IRunningFuncTask } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';
import { stripAnsiControlCharacters } from '../utils/ansiUtils';
import { FuncHostDebugViewProvider, HostErrorNode, HostTaskNode, StoppedHostNode } from './FunctionHostDebugView';
import { getScopeLabel } from './nodes/funcHostDebugUtils';

const viewId = 'azureFunctions.funcHostDebugView';

function isHostTaskNode(node: unknown): node is HostTaskNode {
    return node instanceof HostTaskNode;
}

function isStoppedHostNode(node: unknown): node is StoppedHostNode {
    return node instanceof StoppedHostNode;
}

function isHostErrorNode(node: unknown): node is HostErrorNode {
    return node instanceof HostErrorNode;
}

function formatErrorLogs(errorLogs: string[]): string {
    return errorLogs.map(m => stripAnsiControlCharacters(m).trim()).filter(Boolean).join('\n\n')
        || localize('funcHostDebug.noErrors', 'No errors detected.');
}

function getNodeContext(args: unknown): { scopeLabel: string; portNumber: string; cwd?: string; errorOutput: string } | undefined {
    if (isHostErrorNode(args)) {
        return {
            scopeLabel: getScopeLabel(args.workspaceFolder),
            portNumber: args.portNumber,
            cwd: args.cwd,
            errorOutput: stripAnsiControlCharacters(args.message).trim() || args.message,
        };
    } else if (isHostTaskNode(args)) {
        const task = runningFuncTaskMap.get(args.workspaceFolder, args.cwd);
        return {
            scopeLabel: getScopeLabel(args.workspaceFolder),
            portNumber: args.portNumber,
            cwd: args.cwd,
            errorOutput: formatErrorLogs(task?.errorLogs ?? []),
        };
    } else if (isStoppedHostNode(args)) {
        const stopped = args.stoppedTask;
        return {
            scopeLabel: getScopeLabel(stopped.workspaceFolder),
            portNumber: stopped.portNumber,
            cwd: stopped.cwd,
            errorOutput: formatErrorLogs(stopped.errorLogs),
        };
    }
    return undefined;
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

    registerCommand('azureFunctions.funcHostDebug.clearStoppedSessions', async (actionContext: IActionContext) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        clearStoppedSessions();
    });

    registerCommand('azureFunctions.funcHostDebug.copyRecentLogs', async (actionContext: IActionContext, args: unknown) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        if (isHostTaskNode(args)) {
            const task = runningFuncTaskMap.get(args.workspaceFolder, args.cwd);
            const text = getRecentLogsPlainText(task);
            await vscode.env.clipboard.writeText(text);
        } else if (isStoppedHostNode(args)) {
            const text = getRecentLogsPlainText(args.stoppedTask);
            await vscode.env.clipboard.writeText(text);
        }
    });

    registerCommand('azureFunctions.funcHostDebug.showRecentLogs', async (actionContext: IActionContext, args: unknown) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        let text: string | undefined;
        if (isHostTaskNode(args)) {
            const task = runningFuncTaskMap.get(args.workspaceFolder, args.cwd);
            text = getRecentLogsPlainText(task);
        } else if (isStoppedHostNode(args)) {
            text = getRecentLogsPlainText(args.stoppedTask);
        } else {
            return;
        }

        const doc = await vscode.workspace.openTextDocument({
            content: text || localize('funcHostDebug.noLogs', 'No logs captured yet.'),
            language: 'log',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    });

    registerCommand('azureFunctions.funcHostDebug.askCopilot', async (actionContext: IActionContext, args: unknown) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';

        const ctx = getNodeContext(args);
        if (!ctx) {
            return;
        }

        const { scopeLabel, portNumber, cwd, errorOutput } = ctx;

        const prompt = [
            'I am debugging an Azure Functions project locally in VS Code.',
            `Function Host Port: ${portNumber}`,
            `Workspace: ${scopeLabel}`,
            cwd ? `CWD: ${cwd}` : undefined,
            '',
            'The Functions host produced an error. Diagnose the likely cause and suggest concrete next steps to fix it.',
            '',
            'Error output:',
            errorOutput,
        ].filter((l): l is string => Boolean(l)).join('\n');

        await vscode.commands.executeCommand('workbench.action.chat.open', { mode: 'agent', query: prompt });
    });

    registerCommand('azureFunctions.funcHostDebug.refresh', async (actionContext: IActionContext) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        provider.refresh();
    });
}
