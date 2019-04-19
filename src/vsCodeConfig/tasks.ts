/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinition, workspace, WorkspaceConfiguration, WorkspaceFolder } from "vscode";

const tasksKey: string = 'tasks';
const versionKey: string = 'version';
export const tasksVersion: string = '2.0.0';

export function getTasks(folder: WorkspaceFolder): ITask[] {
    // tslint:disable-next-line: strict-boolean-expressions
    return getTasksConfig(folder).get<ITask[]>(tasksKey) || [];
}

export function updateTasks(folder: WorkspaceFolder, tasks: ITask[]): void {
    getTasksConfig(folder).update(tasksKey, tasks);
}

export function getTasksVersion(folder: WorkspaceFolder): string | undefined {
    return getTasksConfig(folder).get<string>(versionKey);
}

export function updateTasksVersion(folder: WorkspaceFolder, version: string): void {
    getTasksConfig(folder).update(versionKey, version);
}

function getTasksConfig(folder: WorkspaceFolder): WorkspaceConfiguration {
    return workspace.getConfiguration(tasksKey, folder.uri);
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
