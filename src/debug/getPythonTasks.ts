/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShellExecution, Task, WorkspaceFolder } from 'vscode';
import { func, funcPackCommand, packCommand } from '../constants';
import { venvUtils } from '../utils/venvUtils';

export function getPythonTasks(folder: WorkspaceFolder, projectRoot: string): Task[] {
    const commandLine: string = venvUtils.convertToVenvCommand(funcPackCommand, folder.uri.fsPath);
    const basicPack: Task = new Task(
        {
            type: func,
            command: packCommand
        },
        folder,
        packCommand,
        func,
        new ShellExecution(commandLine, { cwd: projectRoot })
    );

    const buildNativeDeps: string = '--build-native-deps';
    const advancedPackCommand: string = `${packCommand} ${buildNativeDeps}`;
    const advancedCommandLine: string = `${commandLine} ${buildNativeDeps}`;
    const advancedPack: Task = new Task(
        {
            type: func,
            command: advancedPackCommand
        },
        folder,
        advancedPackCommand,
        func,
        new ShellExecution(advancedCommandLine, { cwd: projectRoot })
    );

    return [basicPack, advancedPack];
}
