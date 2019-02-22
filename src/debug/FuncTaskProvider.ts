/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ShellExecution, Task, TaskProvider, workspace, WorkspaceFolder } from 'vscode';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/isFunctionProject';
import { extInstallCommand, func, funcExtInstallCommand, funcHostStartCommand, funcWatchProblemMatcher, hostStartCommand, ProjectLanguage, projectLanguageSetting } from '../constants';
import { getFuncExtensionSetting } from '../ProjectSettings';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';
import { getPythonTasks } from './getPythonTasks';
import { JavaDebugProvider } from './JavaDebugProvider';
import { NodeDebugProvider } from './NodeDebugProvider';
import { PythonDebugProvider } from './PythonDebugProvider';

export class FuncTaskProvider implements TaskProvider {
    private readonly _nodeDebugProvider: NodeDebugProvider;
    private readonly _pythonDebugProvider: PythonDebugProvider;
    private readonly _javaDebugProvider: JavaDebugProvider;

    constructor(nodeDebugProvider: NodeDebugProvider, pythonDebugProvider: PythonDebugProvider, javaDebugProvider: JavaDebugProvider) {
        this._nodeDebugProvider = nodeDebugProvider;
        this._pythonDebugProvider = pythonDebugProvider;
        this._javaDebugProvider = javaDebugProvider;
    }

    public async provideTasks(_token?: CancellationToken | undefined): Promise<Task[]> {
        const result: Task[] = [];
        if (workspace.workspaceFolders) {
            for (const folder of workspace.workspaceFolders) {
                const projectRoot: string | undefined = await tryGetFunctionProjectRoot(folder.uri.fsPath);
                if (projectRoot) {
                    result.push(getExtensionInstallTask(folder, projectRoot));
                    const language: string | undefined = getFuncExtensionSetting(projectLanguageSetting, folder.uri.fsPath);
                    const hostStartTask: Task | undefined = await this.getHostStartTask(folder, projectRoot, language);
                    if (hostStartTask) {
                        result.push(hostStartTask);
                    }

                    if (language === ProjectLanguage.Python) {
                        result.push(...getPythonTasks(folder, projectRoot));
                    }
                }
            }
        }

        return result;
    }

    public async resolveTask(_task: Task, _token?: CancellationToken | undefined): Promise<Task | undefined> {
        // The resolveTask method returns undefined and is currently not called by VS Code. It is there to optimize task loading in the future.
        // https://code.visualstudio.com/docs/extensions/example-tasks
        return undefined;
    }

    private async getHostStartTask(folder: WorkspaceFolder, projectRoot: string, language: string | undefined): Promise<Task | undefined> {
        let debugProvider: FuncDebugProviderBase | undefined;
        switch (language) {
            case ProjectLanguage.Python:
                debugProvider = this._pythonDebugProvider;
                break;
            case ProjectLanguage.JavaScript:
            case ProjectLanguage.TypeScript:
                debugProvider = this._nodeDebugProvider;
                break;
            case ProjectLanguage.Java:
                debugProvider = this._javaDebugProvider;
                break;
            default:
        }

        const shellExecution: ShellExecution = debugProvider ? await debugProvider.getShellExecution(folder) : new ShellExecution(funcHostStartCommand);
        if (!shellExecution.options) {
            shellExecution.options = {};
        }

        shellExecution.options.cwd = projectRoot;
        return new Task(
            {
                type: func,
                command: hostStartCommand
            },
            folder,
            hostStartCommand,
            func,
            shellExecution,
            funcWatchProblemMatcher
        );
    }
}

function getExtensionInstallTask(folder: WorkspaceFolder, projectRoot: string): Task {
    return new Task(
        {
            type: func,
            command: extInstallCommand
        },
        folder,
        extInstallCommand,
        func,
        new ShellExecution(funcExtInstallCommand, { cwd: projectRoot })
    );
}
