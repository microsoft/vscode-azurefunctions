/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNullOrUndefined } from 'util';
import { CancellationToken, ShellExecution, Task, TaskProvider, workspace, WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { extInstallCommand, func, funcExtInstallCommand, funcWatchProblemMatcher, hostStartCommand, ProjectLanguage, projectLanguageSetting } from '../constants';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';
import { getFuncTaskCommand, IFuncTaskCommand } from './getFuncTaskCommand';
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
        const result: Task[] = [];

        // tslint:disable-next-line: no-this-assignment
        const me: FuncTaskProvider = this;
        await callWithTelemetryAndErrorHandling('provideTasks', async function (this: IActionContext): Promise<void> {
            this.properties.isActivationEvent = 'true';
            this.suppressErrorDisplay = true;
            this.suppressTelemetry = true;

            if (workspace.workspaceFolders) {
                // tslint:disable-next-line: no-any
                let lastError: any;
                for (const folder of workspace.workspaceFolders) {
                    try {
                        const projectRoot: string | undefined = await tryGetFunctionProjectRoot(folder.uri.fsPath, true /* suppressPrompt */);
                        if (projectRoot) {
                            result.push(getExtensionInstallTask(folder, projectRoot));
                            const language: string | undefined = getWorkspaceSetting(projectLanguageSetting, folder.uri.fsPath);
                            const hostStartTask: Task | undefined = await me.getHostStartTask(folder, projectRoot, language);
                            if (hostStartTask) {
                                result.push(hostStartTask);
                            }

                            if (language === ProjectLanguage.Python) {
                                result.push(...getPythonTasks(folder, projectRoot));
                            }
                        }
                    } catch (err) {
                        // ignore and try next folder
                        lastError = err;
                    }
                }

                if (!isNullOrUndefined(lastError)) {
                    // throw the last error just for the sake of telemetry
                    // (This won't block providing tasks since it's inside callWithTelemetryAndErrorHandling)
                    throw lastError;
                }
            }
        });

        return result;
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

        const funcCommand: IFuncTaskCommand = getFuncTaskCommand(folder, hostStartCommand, /^\s*(host )?start/i);
        const shellExecution: ShellExecution = debugProvider ? await debugProvider.getShellExecution(folder, funcCommand.commandLine) : new ShellExecution(funcCommand.commandLine);
        if (!shellExecution.options) {
            shellExecution.options = {};
        }

        shellExecution.options.cwd = projectRoot;
        return new Task(
            {
                type: func,
                command: funcCommand.taskName
            },
            folder,
            funcCommand.taskName,
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
