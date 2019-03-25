/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ShellExecution, Task, TaskProvider, workspace, WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { extInstallCommand, func, funcExtInstallCommand, funcHostStartCommand, funcWatchProblemMatcher, hostStartCommand, ProjectLanguage, projectLanguageSetting } from '../constants';
import { getFuncExtensionSetting } from '../ProjectSettings';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';
import { getPythonTasks } from './getPythonTasks';
import { JavaDebugProvider } from './JavaDebugProvider';
import { NodeDebugProvider } from './NodeDebugProvider';
import { PowerShellDebugProvider } from './PowerShellDebugProvider';
import { PythonDebugProvider } from './PythonDebugProvider';

export class FuncTaskProvider implements TaskProvider {
    private readonly _nodeDebugProvider: NodeDebugProvider;
    private readonly _pythonDebugProvider: PythonDebugProvider;
    private readonly _javaDebugProvider: JavaDebugProvider;
    private readonly _powershellDebugProvider: PowerShellDebugProvider;

    constructor(nodeDebugProvider: NodeDebugProvider, pythonDebugProvider: PythonDebugProvider, javaDebugProvider: JavaDebugProvider, powershellDebugProvider: PowerShellDebugProvider) {
        this._nodeDebugProvider = nodeDebugProvider;
        this._pythonDebugProvider = pythonDebugProvider;
        this._javaDebugProvider = javaDebugProvider;
        this._powershellDebugProvider = powershellDebugProvider;
    }

    public async provideTasks(_token?: CancellationToken | undefined): Promise<Task[]> {
        // tslint:disable-next-line: no-this-assignment
        const me: FuncTaskProvider = this;
        const tasks: Task[] | undefined = await callWithTelemetryAndErrorHandling('provideTasks', async function (this: IActionContext): Promise<Task[]> {
            this.properties.isActivationEvent = 'true';
            this.suppressErrorDisplay = true;
            this.suppressTelemetry = true;

            const result: Task[] = [];
            if (workspace.workspaceFolders) {
                for (const folder of workspace.workspaceFolders) {
                    const projectRoot: string | undefined = await tryGetFunctionProjectRoot(folder.uri.fsPath);
                    if (projectRoot) {
                        result.push(getExtensionInstallTask(folder, projectRoot));
                        const language: string | undefined = getFuncExtensionSetting(projectLanguageSetting, folder.uri.fsPath);
                        const hostStartTask: Task | undefined = await me.getHostStartTask(folder, projectRoot, language);
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
        });

        // tslint:disable-next-line: strict-boolean-expressions
        return tasks || [];
    }

    public async resolveTask(_task: Task, _token?: CancellationToken | undefined): Promise<Task | undefined> {
        await callWithTelemetryAndErrorHandling('resolveTask', async function (this: IActionContext): Promise<void> {
            this.properties.isActivationEvent = 'true';
            this.suppressErrorDisplay = true;
            this.suppressTelemetry = true;
        });

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
            case ProjectLanguage.PowerShell:
                debugProvider = this._powershellDebugProvider;
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
