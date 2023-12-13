/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, type TaskDefinition, type WorkspaceConfiguration, type WorkspaceFolder } from "vscode";

const tasksKey: string = 'tasks';
const versionKey: string = 'version';
export const tasksVersion: string = '2.0.0';

export function getTasks(folder: WorkspaceFolder): ITask[] {
    return getTasksConfig(folder).get<ITask[]>(tasksKey) || [];
}

export async function updateTasks(folder: WorkspaceFolder, tasks: ITask[]): Promise<void> {
    await getTasksConfig(folder).update(tasksKey, tasks);
}

export function getTasksVersion(folder: WorkspaceFolder): string | undefined {
    return getTasksConfig(folder).get<string>(versionKey);
}

export async function updateTasksVersion(folder: WorkspaceFolder, version: string): Promise<void> {
    await getTasksConfig(folder).update(versionKey, version);
}

function getTasksConfig(folder: WorkspaceFolder): WorkspaceConfiguration {
    return workspace.getConfiguration(tasksKey, folder.uri);
}

export function convertToFunctionsTaskLabel(label: string): string {
    return `${label} (functions)`;
}

export interface ITasksJson {
    version: string;
    tasks?: ITask[];
}

export interface ITask extends TaskDefinition {
    label?: string;
    command?: string;
    options?: ITaskOptions;
}

export interface ITaskOptions {
    cwd?: string;
    env?: {
        [key: string]: string;
    };
}
