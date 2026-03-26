/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type IStoppedFuncTask } from '../../funcCoreTools/funcHostTask';
import { buildHostTooltip, formatTimestamp, getScopeLabel } from './funcHostDebugUtils';
import { HostErrorNode } from './HostErrorNode';

enum FuncHostDebugContextValue {
    StoppedHostTask = 'azFunc.funcHostDebug.stoppedHostTask',
}

export class StoppedHostNode {
    public readonly kind = 'stoppedHost' as const;

    constructor(public readonly stoppedTask: IStoppedFuncTask) { }

    public getTreeItem(): vscode.TreeItem {
        const stopped = this.stoppedTask;
        const scopeLabel = getScopeLabel(stopped.workspaceFolder);
        const label = `${scopeLabel} (${stopped.portNumber}) — Stopped`;

        const tooltip = buildHostTooltip({ label, scopeLabel, portNumber: stopped.portNumber, startTime: stopped.startTime, stopTime: stopped.stopTime, cwd: stopped.cwd });

        const errorCount = stopped.errorLogs.length;
        const item = new vscode.TreeItem(label, errorCount > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        item.description = `${formatTimestamp(stopped.startTime)} → ${formatTimestamp(stopped.stopTime)}`;
        item.tooltip = tooltip;
        item.contextValue = FuncHostDebugContextValue.StoppedHostTask;
        item.iconPath = new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('disabledForeground'));
        return item;
    }

    public getChildren(): HostErrorNode[] {
        const stopped = this.stoppedTask;
        return stopped.errorLogs
            .slice()
            .reverse()
            .map((message) => new HostErrorNode(stopped.workspaceFolder, stopped.portNumber, message, stopped.cwd));
    }
}
