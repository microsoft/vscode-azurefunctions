/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { runningFuncTaskMap, stoppedFuncTasks } from '../funcCoreTools/funcHostTask';
import { HostErrorNode } from './nodes/HostErrorNode';
import { HostTaskNode } from './nodes/HostTaskNode';
import { NoHostNode } from './nodes/NoHostNode';
import { StoppedHostNode } from './nodes/StoppedHostNode';

export { getScopeLabel } from './nodes/funcHostDebugUtils';
export { HostErrorNode } from './nodes/HostErrorNode';
export { HostTaskNode } from './nodes/HostTaskNode';
export { StoppedHostNode } from './nodes/StoppedHostNode';

export type FuncHostDebugNode = NoHostNode | HostTaskNode | StoppedHostNode | HostErrorNode;

export class FuncHostDebugViewProvider implements vscode.TreeDataProvider<FuncHostDebugNode> {
    private readonly _onDidChangeTreeDataEmitter = new vscode.EventEmitter<FuncHostDebugNode | undefined>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeDataEmitter.event;

    public refresh(): void {
        this._onDidChangeTreeDataEmitter.fire(undefined);
    }

    public getTreeItem(element: FuncHostDebugNode): vscode.TreeItem {
        return element.getTreeItem();
    }

    public async getChildren(element?: FuncHostDebugNode): Promise<FuncHostDebugNode[]> {
        if (element) {
            return element.getChildren();
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
                nodes.push(new HostTaskNode(folder, t.portNumber, t.startTime, cwd));
                hasRunning = true;
            }
        }

        // Always show the hint node when no host is actively running.
        if (!hasRunning) {
            nodes.push(new NoHostNode());
        }

        // Stopped sessions (already newest-first in the array).
        for (const stopped of stoppedFuncTasks) {
            nodes.push(new StoppedHostNode(stopped));
        }

        return nodes;
    }
}
