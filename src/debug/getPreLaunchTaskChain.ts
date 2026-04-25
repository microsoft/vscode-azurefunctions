/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITask } from '../vsCodeConfig/tasks';

/**
 * Resolves the full chain of tasks associated with a given `preLaunchTask`.
 * Recursively follows the `dependsOn` references found in the `tasks.json`.
 */
export function getPreLaunchTaskChain(tasks: ITask[], preLaunchTask: string): string[] {
    const tasksMap = new Map<string, ITask>();

    for (const task of tasks) {
        if (task.label) {
            tasksMap.set(task.label, task);
        }
    }

    const dependentTasks = new Set<string>();

    function getDependentTasks(name: string): void {
        const task = tasksMap.get(name);
        if (!task || dependentTasks.has(name)) {
            return;
        }
        dependentTasks.add(name);

        const dependsOn: unknown = task?.dependsOn;
        if (typeof dependsOn === 'string') {
            getDependentTasks(dependsOn);
        } else if (Array.isArray(dependsOn)) {
            for (const dep of dependsOn) {
                if (typeof dep === 'string') {
                    getDependentTasks(dep);
                }
            }
        }
    }

    if (!tasksMap.has(preLaunchTask)) {
        return [];
    }

    getDependentTasks(preLaunchTask);
    return Array.from(dependentTasks.values());
}
