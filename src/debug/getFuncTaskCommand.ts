/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinition, workspace, WorkspaceConfiguration, WorkspaceFolder } from 'vscode';
import { func } from '../constants';

interface IFuncTaskDefinition extends TaskDefinition {
    command?: string;
}

/**
 * Gets the exact command line (aka with any user-specified args) to be used in our provided task
 */
export function getFuncTaskCommand(folder: WorkspaceFolder, defaultCommand: string, commandsToMatch: RegExp): IFuncTaskCommand {
    let command: string = defaultCommand;
    try {
        const config: WorkspaceConfiguration = workspace.getConfiguration('tasks', folder.uri);
        // tslint:disable-next-line: strict-boolean-expressions
        const tasks: IFuncTaskDefinition[] = config.get<IFuncTaskDefinition[]>('tasks') || [];
        const funcTask: IFuncTaskDefinition | undefined = tasks.find(t => t.type === func && !!t.command && commandsToMatch.test(t.command));
        if (funcTask && funcTask.command) {
            command = funcTask.command;
        }
    } catch {
        // ignore and use default
    }
    return {
        taskName: command,
        commandLine: `func ${command}`
    };
}

export interface IFuncTaskCommand {
    /**
     * Used to identify the task. It matches the command as defined in the task by the user and is the same as commandLine, except without 'func' at the beginning.
     */
    taskName: string;

    /**
     * The actual command line to run
     */
    commandLine: string;
}
