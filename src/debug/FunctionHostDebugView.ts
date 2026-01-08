/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerCommand, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { extractFuncHostErrorContextForErrorMessage } from '../funcCoreTools/funcHostErrorUtils';
import { onRunningFuncTasksChanged, refreshFuncHostDebugContext, runningFuncTaskMap, stopFuncTaskIfRunning, type IRunningFuncTask } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';
import { stripAnsiControlCharacters } from '../utils/ansiUtils';
import { openCopilotChat } from '../utils/copilotChat';

const viewId = 'azureFunctions.funcHostDebugView';

enum FuncHostDebugContextValue {
    HostTask = 'azFunc.funcHostDebug.hostTask',
    HostError = 'azFunc.funcHostDebug.hostError',
}

type FuncHostDebugNode = INoHostNode | IHostTaskNode | IHostErrorNode;

interface INoHostNode {
    kind: 'noHost';
}

interface IHostTaskNode {
    kind: 'hostTask';
    workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope;
    cwd?: string;
    portNumber: string;
}

interface IHostErrorNode {
    kind: 'hostError';
    workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope;
    cwd?: string;
    portNumber: string;
    message: string;
}

export class FuncHostDebugViewProvider implements vscode.TreeDataProvider<FuncHostDebugNode> {
    private readonly _onDidChangeTreeDataEmitter = new vscode.EventEmitter<FuncHostDebugNode | undefined>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeDataEmitter.event;

    public refresh(): void {
        this._onDidChangeTreeDataEmitter.fire(undefined);
    }

    public getTreeItem(element: FuncHostDebugNode): vscode.TreeItem {
        if (element.kind === 'noHost') {
            const item = new vscode.TreeItem(localize('funcHostDebug.noneRunning', 'No Function Host task is currently running.'), vscode.TreeItemCollapsibleState.None);
            item.description = localize('funcHostDebug.startDebuggingHint', 'Start debugging (F5) to launch the host.');
            item.iconPath = new vscode.ThemeIcon('debug');
            return item;
        }

        if (element.kind === 'hostError') {
            const firstLine = element.message.split(/\r?\n/)[0].trim();
            const label = firstLine || localize('funcHostDebug.errorDetected', 'Error detected');

            const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('error');
            item.tooltip = element.message;
            item.contextValue = FuncHostDebugContextValue.HostError;
            return item;
        }

        const task = runningFuncTaskMap.get(element.workspaceFolder, element.cwd);
        const scopeLabel = typeof element.workspaceFolder === 'object'
            ? element.workspaceFolder.name
            : localize('funcHostDebug.globalScope', 'Global');

        const label = localize('funcHostDebug.hostLabel', 'Function Host ({0})', element.portNumber);

        const tooltip = new vscode.MarkdownString(undefined, true);
        tooltip.appendMarkdown(`**${label}**\n\n`);
        tooltip.appendMarkdown(`- ${localize('funcHostDebug.workspace', 'Workspace')}: ${scopeLabel}\n`);
        tooltip.appendMarkdown(`- ${localize('funcHostDebug.pid', 'PID')}: ${task?.processId ?? localize('funcHostDebug.unknown', 'Unknown')}\n`);
        tooltip.appendMarkdown(`- ${localize('funcHostDebug.port', 'Port')}: ${element.portNumber}\n`);
        if (element.cwd) {
            tooltip.appendMarkdown(`- ${localize('funcHostDebug.cwd', 'CWD')}: ${element.cwd}\n`);
        }

        const hasErrors = (task?.errorLogs?.length ?? 0) > 0;
        const item = new vscode.TreeItem(label, hasErrors ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        item.description = scopeLabel;
        item.tooltip = tooltip;
        item.contextValue = FuncHostDebugContextValue.HostTask;
        item.iconPath = new vscode.ThemeIcon('server-process');
        return item;
    }

    public async getChildren(element?: FuncHostDebugNode): Promise<FuncHostDebugNode[]> {
        if (element?.kind === 'hostTask') {
            const task = runningFuncTaskMap.get(element.workspaceFolder, element.cwd);
            const errors = task?.errorLogs ?? [];
            // Show most recent errors first.
            return errors
                .slice()
                .reverse()
                .map((message): IHostErrorNode => ({
                    kind: 'hostError',
                    workspaceFolder: element.workspaceFolder,
                    cwd: element.cwd,
                    portNumber: element.portNumber,
                    message,
                }));
        } else if (element) {
            return [];
        }

        const hostTasks: IHostTaskNode[] = [];

        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            for (const t of runningFuncTaskMap.getAll(folder)) {
                if (!t) {
                    continue;
                }
                const cwd = (t.taskExecution.task.execution as vscode.ShellExecution | undefined)?.options?.cwd;
                hostTasks.push({ kind: 'hostTask', workspaceFolder: folder, cwd, portNumber: t.portNumber });
            }
        }

        for (const t of runningFuncTaskMap.getAll(vscode.TaskScope.Global)) {
            if (!t) {
                continue;
            }
            const cwd = (t.taskExecution.task.execution as vscode.ShellExecution | undefined)?.options?.cwd;
            hostTasks.push({ kind: 'hostTask', workspaceFolder: vscode.TaskScope.Global, cwd, portNumber: t.portNumber });
        }

        if (hostTasks.length === 0) {
            return [{ kind: 'noHost' }];
        }

        return hostTasks;
    }
}

function getRecentLogs(task: IRunningFuncTask | undefined, limit: number = 250): string {
    const logs = task?.logs ?? [];
    const recent = logs.slice(Math.max(0, logs.length - limit));
    return recent.join('');
}

function getRecentLogsPlainText(task: IRunningFuncTask | undefined, limit: number = 250): string {
    return stripAnsiControlCharacters(getRecentLogs(task, limit));
}

function getErrorContextForCopilot(task: IRunningFuncTask | undefined, errorMessage: string): string {
    const logs = task?.logs ?? [];
    const extracted = extractFuncHostErrorContextForErrorMessage(logs, errorMessage, { before: 5, after: 25, max: 250 });
    const plainLines = extracted.map((l) => stripAnsiControlCharacters(l));
    return plainLines.join('').trim();
}

export function registerFunctionHostDebugView(context: vscode.ExtensionContext): void {
    const provider = new FuncHostDebugViewProvider();

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(viewId, provider),
        onRunningFuncTasksChanged(() => provider.refresh()),
    );

    // Ensure the context key is correct on activation.
    void refreshFuncHostDebugContext();

    registerCommand('azureFunctions.funcHostDebug.stop', async (actionContext: IActionContext, args: IHostTaskNode) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        await stopFuncTaskIfRunning(args.workspaceFolder, args.cwd, false, false);
    });

    registerCommand('azureFunctions.funcHostDebug.terminate', async (actionContext: IActionContext, args: IHostTaskNode) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        await stopFuncTaskIfRunning(args.workspaceFolder, args.cwd, false, true);
    });

    registerCommand('azureFunctions.funcHostDebug.copyRecentLogs', async (actionContext: IActionContext, args: IHostTaskNode) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        const task = runningFuncTaskMap.get(args.workspaceFolder, args.cwd);
        const text = getRecentLogsPlainText(task);
        await vscode.env.clipboard.writeText(text);
        vscode.window.setStatusBarMessage(localize('funcHostDebug.copiedLogs', 'Copied recent Function Host logs to clipboard.'), 3000);
    });

    registerCommand('azureFunctions.funcHostDebug.showRecentLogs', async (actionContext: IActionContext, args: IHostTaskNode) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        const task = runningFuncTaskMap.get(args.workspaceFolder, args.cwd);
        const text = getRecentLogsPlainText(task);

        const doc = await vscode.workspace.openTextDocument({
            content: text || localize('funcHostDebug.noLogs', 'No logs captured yet.'),
            language: 'log',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    });

    registerCommand('azureFunctions.funcHostDebug.askCopilot', async (actionContext: IActionContext, args: IHostErrorNode) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        const task = runningFuncTaskMap.get(args.workspaceFolder, args.cwd);

        const errorContext = getErrorContextForCopilot(task, args.message) || args.message;

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
            'Error output (with surrounding context):',
            errorContext,
        ].filter((l): l is string => Boolean(l)).join('\n');

        await openCopilotChat(prompt);
    });

    registerCommand('azureFunctions.funcHostDebug.refresh', async (actionContext: IActionContext) => {
        actionContext.telemetry.properties.source = 'funcHostDebugView';
        provider.refresh();
        await refreshFuncHostDebugContext();
    });
}
