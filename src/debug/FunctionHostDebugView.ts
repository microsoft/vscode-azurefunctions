/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { runningFuncTaskMap } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';

enum FuncHostDebugContextValue {
    HostTask = 'azFunc.funcHostDebug.hostTask',
    HostError = 'azFunc.funcHostDebug.hostError',
}

type FuncHostDebugNode = INoHostNode | IHostTaskNode | IHostErrorNode;

interface INoHostNode {
    kind: 'noHost';
}

export interface IHostTaskNode {
    kind: 'hostTask';
    workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope;
    cwd?: string;
    portNumber: string;
}

export interface IHostErrorNode {
    kind: 'hostError';
    workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope;
    cwd?: string;
    portNumber: string;
    message: string;
}

function getNoHostTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(localize('funcHostDebug.noneRunning', 'No Function Host task is currently running.'), vscode.TreeItemCollapsibleState.None);
    item.description = localize('funcHostDebug.startDebuggingHint', 'Start debugging (F5) to launch the host.');
    item.iconPath = new vscode.ThemeIcon('debug');
    return item;
}

function getHostErrorTreeItem(element: IHostErrorNode): vscode.TreeItem {
    const firstLine = element.message.split(/\r?\n/)[0].trim();
    const label = firstLine || localize('funcHostDebug.errorDetected', 'Error detected');

    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('error');
    item.tooltip = element.message;
    item.contextValue = FuncHostDebugContextValue.HostError;
    return item;
}

function getHostTaskTreeItem(element: IHostTaskNode): vscode.TreeItem {
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

    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.description = scopeLabel;
    item.tooltip = tooltip;
    item.contextValue = FuncHostDebugContextValue.HostTask;
    item.iconPath = new vscode.ThemeIcon('server-process');
    return item;
}

export class FuncHostDebugViewProvider implements vscode.TreeDataProvider<FuncHostDebugNode> {
    private readonly _onDidChangeTreeDataEmitter = new vscode.EventEmitter<FuncHostDebugNode | undefined>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeDataEmitter.event;

    public refresh(): void {
        this._onDidChangeTreeDataEmitter.fire(undefined);
    }

    public getTreeItem(element: FuncHostDebugNode): vscode.TreeItem {
        switch (element.kind) {
            case 'noHost':
                return getNoHostTreeItem();
            case 'hostError':
                return getHostErrorTreeItem(element);
            case 'hostTask':
                return getHostTaskTreeItem(element);
            default:
                // Exhaustive check
                return getNoHostTreeItem();
        }
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
