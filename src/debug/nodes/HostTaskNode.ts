/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { runningFuncTaskMap } from '../../funcCoreTools/funcHostTask';
import { buildHostTooltip, formatTimestamp, getScopeLabel } from './funcHostDebugUtils';
import { HostErrorNode } from './HostErrorNode';

export class HostTaskNode {
    public readonly kind = 'hostTask' as const;

    constructor(
        public readonly workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope,
        public readonly portNumber: string,
        public readonly startTime: Date,
        public readonly cwd?: string,
    ) { }

    public getTreeItem(): vscode.TreeItem {
        const task = runningFuncTaskMap.get(this.workspaceFolder, this.cwd);
        const scopeLabel = getScopeLabel(this.workspaceFolder);
        const label = `${scopeLabel} (${this.portNumber})`;

        const tooltip = buildHostTooltip({ label, scopeLabel, portNumber: this.portNumber, startTime: this.startTime, cwd: this.cwd, pid: task?.processId });

        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
        item.description = formatTimestamp(this.startTime);
        item.tooltip = tooltip;
        item.contextValue = 'azFunc.funcHostDebug.hostTask';
        item.iconPath = new vscode.ThemeIcon('server-process');
        return item;
    }

    public getChildren(): HostErrorNode[] {
        const task = runningFuncTaskMap.get(this.workspaceFolder, this.cwd);
        const errors = task?.errorLogs ?? [];
        return errors
            .slice()
            .reverse()
            .map((message) => new HostErrorNode(this.workspaceFolder, this.portNumber, message, this.cwd));
    }
}
