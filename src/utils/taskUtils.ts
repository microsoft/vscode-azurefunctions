/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Task, tasks as codeTasks, TaskScope, WorkspaceFolder } from "vscode";
import { isPathEqual, isSubpath } from "./fs";

export namespace taskUtils {
    export function getFsPathFromTask(task: Task): string | undefined {
        if (typeof task.scope === 'object') {
            const workspaceFolder: Partial<WorkspaceFolder> = task.scope;
            return workspaceFolder.uri?.fsPath;
        } else {
            return undefined;
        }
    }

    /**
     * Returns true if the task's scope is a workspace folder matching the given path or if the task is not associated with a path
     */
    export function isTaskInScopeOfPath(task: Task, fsPath: string): boolean {
        if (task.scope === TaskScope.Global || task.scope === TaskScope.Workspace) {
            return true;
        } else {
            const taskPath: string | undefined = getFsPathFromTask(task);
            return !!taskPath && (isPathEqual(taskPath, fsPath) || isSubpath(taskPath, fsPath));
        }
    }

    export function isTaskScopeEqual(task1: Task, task2: Task): boolean {
        if (task1.scope === task2.scope) { // handles the case where the scopes are not associated with a path
            return true;
        } else {
            const task1Path: string | undefined = getFsPathFromTask(task1);
            const task2Path: string | undefined = getFsPathFromTask(task2);
            return !!task1Path && !!task2Path && isPathEqual(task1Path, task2Path);
        }
    }

    export function isTaskEqual(task1: Task, task2: Task): boolean {
        return isTaskScopeEqual(task1, task2) && task1.name === task2.name && task1.source === task2.source && task1.definition.type === task2.definition.type;
    }

    /**
     * Handles condition where we don't need to start the task because it's already running
     */
    export async function executeIfNotActive(task: Task): Promise<void> {
        if (!codeTasks.taskExecutions.find(t => isTaskEqual(t.task, task))) {
            await codeTasks.executeTask(task);
        }
    }
}
