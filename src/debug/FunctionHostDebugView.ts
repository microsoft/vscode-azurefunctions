/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { runningFuncTaskMap, stoppedFuncTasks, type IStoppedFuncTask } from '../funcCoreTools/funcHostTask';
import { localize } from '../localize';

enum FuncHostDebugContextValue {
    HostTask = 'azFunc.funcHostDebug.hostTask',
    StoppedHostTask = 'azFunc.funcHostDebug.stoppedHostTask',
    HostError = 'azFunc.funcHostDebug.hostError',
}

type FuncHostDebugNode = INoHostNode | IHostTaskNode | IStoppedHostNode | IHostErrorNode;

interface INoHostNode {
    kind: 'noHost';
}

export interface IHostTaskNode {
    kind: 'hostTask';
    workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope;
    cwd?: string;
    portNumber: string;
    startTime: Date;
}

export interface IStoppedHostNode {
    kind: 'stoppedHost';
    stoppedTask: IStoppedFuncTask;
}

export interface IHostErrorNode {
    kind: 'hostError';
    workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope;
    cwd?: string;
    portNumber: string;
    message: string;
}

function formatTimestamp(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildHostTooltip(opts: { label: string; scopeLabel: string; portNumber: string; startTime: Date; stopTime?: Date; cwd?: string; pid?: number }): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`**${opts.label}**\n\n`);
    tooltip.appendMarkdown(`- ${localize('funcHostDebug.workspace', 'Workspace')}: ${opts.scopeLabel}\n`);
    if (opts.pid !== undefined) {
        tooltip.appendMarkdown(`- ${localize('funcHostDebug.pid', 'PID')}: ${opts.pid}\n`);
    }
    tooltip.appendMarkdown(`- ${localize('funcHostDebug.port', 'Port')}: ${opts.portNumber}\n`);
    tooltip.appendMarkdown(`- ${localize('funcHostDebug.started', 'Started')}: ${opts.startTime.toLocaleString()}\n`);
    if (opts.stopTime) {
        tooltip.appendMarkdown(`- ${localize('funcHostDebug.stopped', 'Stopped')}: ${opts.stopTime.toLocaleString()}\n`);
    }
    if (opts.cwd) {
        tooltip.appendMarkdown(`- ${localize('funcHostDebug.cwd', 'CWD')}: ${opts.cwd}\n`);
    }
    return tooltip;
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

    const tooltip = buildHostTooltip({ label, scopeLabel, portNumber: element.portNumber, startTime: element.startTime, cwd: element.cwd, pid: task?.processId });

    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.description = `${scopeLabel} - ${formatTimestamp(element.startTime)}`;
    item.tooltip = tooltip;
    item.contextValue = FuncHostDebugContextValue.HostTask;
    item.iconPath = new vscode.ThemeIcon('server-process');
    return item;
}

function getStoppedHostTreeItem(element: IStoppedHostNode): vscode.TreeItem {
    const stopped = element.stoppedTask;
    const scopeLabel = typeof stopped.workspaceFolder === 'object'
        ? stopped.workspaceFolder.name
        : localize('funcHostDebug.globalScope', 'Global');

    const label = localize('funcHostDebug.stoppedHostLabel', 'Function Host ({0}) — Stopped', stopped.portNumber);

    const tooltip = buildHostTooltip({ label, scopeLabel, portNumber: stopped.portNumber, startTime: stopped.startTime, stopTime: stopped.stopTime, cwd: stopped.cwd });

    const errorCount = stopped.errorLogs.length;
    const item = new vscode.TreeItem(label, errorCount > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    item.description = `${scopeLabel} - ${formatTimestamp(stopped.startTime)} → ${formatTimestamp(stopped.stopTime)}`;
    item.tooltip = tooltip;
    item.contextValue = FuncHostDebugContextValue.StoppedHostTask;
    item.iconPath = new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('disabledForeground'));
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
            case 'stoppedHost':
                return getStoppedHostTreeItem(element);
            default: {
                // Exhaustive check: if we reach here, the FuncHostDebugNode union is out of sync with this switch.
                throw new Error(`Unexpected FuncHostDebugNode kind: ${(element as { kind?: unknown }).kind}`);
            }
        }
    }

    public async getChildren(element?: FuncHostDebugNode): Promise<FuncHostDebugNode[]> {
        if (element?.kind === 'hostTask') {
            const task = runningFuncTaskMap.get(element.workspaceFolder, element.cwd);
            const errors = task?.errorLogs ?? [];
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
        } else if (element?.kind === 'stoppedHost') {
            const stopped = element.stoppedTask;
            return stopped.errorLogs
                .slice()
                .reverse()
                .map((message): IHostErrorNode => ({
                    kind: 'hostError',
                    workspaceFolder: stopped.workspaceFolder,
                    cwd: stopped.cwd,
                    portNumber: stopped.portNumber,
                    message,
                }));
        } else if (element) {
            return [];
        }

        const nodes: FuncHostDebugNode[] = [];
        let hasRunning = false;

        // Running sessions first (newest on top by insertion order).
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            for (const t of runningFuncTaskMap.getAll(folder)) {
                if (!t) {
                    continue;
                }
                const cwd = (t.taskExecution.task.execution as vscode.ShellExecution | undefined)?.options?.cwd;
                nodes.push({ kind: 'hostTask', workspaceFolder: folder, cwd, portNumber: t.portNumber, startTime: t.startTime });
                hasRunning = true;
            }
        }

        // Always show the hint node when no host is actively running.
        if (!hasRunning) {
            nodes.push({ kind: 'noHost' });
        }

        // Stopped sessions (already newest-first in the array).
        for (const stopped of stoppedFuncTasks) {
            nodes.push({ kind: 'stoppedHost', stoppedTask: stopped });
        }

        return nodes;
    }
}
