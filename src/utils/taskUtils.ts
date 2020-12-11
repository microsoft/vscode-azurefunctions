/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Task, tasks as codeTasks, WorkspaceFolder } from "vscode";
import { isPathEqual } from "./fs";

export namespace taskUtils {
    export function getFsPathFromTask(task: Task): string | undefined {
        if (typeof task.scope === 'object') {
            const workspaceFolder: Partial<WorkspaceFolder> = task.scope;
            return workspaceFolder.uri?.fsPath;
        } else {
            return undefined;
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
        // Temporarily disable this behavior because it's not worth the trouble caused by https://github.com/microsoft/vscode/issues/112247
        // if (!codeTasks.taskExecutions.find(t => isTaskEqual(t.task, task))) {
        await codeTasks.executeTask(task);
        // }
    }
}
