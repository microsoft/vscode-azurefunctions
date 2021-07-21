/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as process from 'process';
import { CancellationToken, ShellExecution, ShellExecutionOptions, Task, TaskDefinition, TaskProvider, TaskScope, workspace, WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { buildNativeDeps, extInstallCommand, func, hostStartCommand, packCommand, ProjectLanguage, projectLanguageSetting } from '../constants';
import { ext } from '../extensionVariables';
import { venvUtils } from '../utils/venvUtils';
import { getFuncWatchProblemMatcher, getWorkspaceSetting } from '../vsCodeConfig/settings';
import { getTasks } from '../vsCodeConfig/tasks';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';
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

        await callWithTelemetryAndErrorHandling('provideTasks', async (context: IActionContext) => {
            context.telemetry.properties.isActivationEvent = 'true';
            context.errorHandling.suppressDisplay = true;
            context.telemetry.suppressIfSuccessful = true;

            if (workspace.workspaceFolders) {
                let lastError: unknown;
                for (const folder of workspace.workspaceFolders) {
                    try {
                        const projectRoot: string | undefined = await tryGetFunctionProjectRoot(context, folder);
                        if (projectRoot) {
                            const language: string | undefined = getWorkspaceSetting(projectLanguageSetting, folder.uri.fsPath);

                            const commands: string[] = [extInstallCommand];

                            // Don't add "host start" task if the folder already has that task configured. Instead, defer to `resolveTask`, which will handle any customizations the user has made
                            if (!hasHostStartTask(folder)) {
                                commands.push(hostStartCommand);
                            }

                            if (language === ProjectLanguage.Python) {
                                commands.push(packCommand);
                                commands.push(`${packCommand} ${buildNativeDeps}`);
                            }

                            for (const command of commands) {
                                result.push(await this.createTask(command, folder, projectRoot, language));
                            }
                        }
                    } catch (err) {
                        // ignore and try next folder
                        lastError = err;
                    }
                }

                if (!(lastError === null || lastError === undefined)) {
                    // throw the last error just for the sake of telemetry
                    // (This won't block providing tasks since it's inside callWithTelemetryAndErrorHandling)
                    throw lastError;
                }
            }
        });

        return result;
    }

    public async resolveTask(task: Task, _token?: CancellationToken | undefined): Promise<Task | undefined> {
        return await callWithTelemetryAndErrorHandling('resolveTask', async (context: IActionContext) => {
            context.telemetry.properties.isActivationEvent = 'true';
            context.errorHandling.suppressDisplay = true;
            context.telemetry.suppressIfSuccessful = true;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const command: string | undefined = task.definition.command;
            if (command && task.scope !== undefined && task.scope !== TaskScope.Global && task.scope !== TaskScope.Workspace) {
                const folder: WorkspaceFolder = task.scope;
                const language: string | undefined = getWorkspaceSetting(projectLanguageSetting, folder.uri.fsPath);
                return this.createTask(command, folder, undefined, language, task.definition);
            }

            return undefined;
        });
    }

    private async createTask(command: string, folder: WorkspaceFolder, projectRoot: string | undefined, language: string | undefined, definition?: TaskDefinition): Promise<Task> {
        let commandLine: string = `${ext.funcCliPath} ${command}`;
        if (language === ProjectLanguage.Python) {
            commandLine = venvUtils.convertToVenvCommand(commandLine, folder.uri.fsPath);
        }

        let problemMatcher: string | undefined;
        let options: ShellExecutionOptions | undefined;
        if (/^\s*(host )?start/i.test(command)) {
            problemMatcher = getFuncWatchProblemMatcher(language);
            options = await this.getHostStartOptions(folder, language);
        }

        options = options || {};
        if (projectRoot) {
            options.cwd = projectRoot;
        }

        definition = definition || { type: func, command };
        return new Task(definition, folder, command, func, new ShellExecution(commandLine, options), problemMatcher);
    }

    private async getHostStartOptions(folder: WorkspaceFolder, language: string | undefined): Promise<ShellExecutionOptions | undefined> {
        let debugProvider: FuncDebugProviderBase;
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
                return undefined;
        }

        // Defer to process.env (aka return undefined) if the workerArg variable is already defined
        return process.env[debugProvider.workerArgKey] ? undefined : { env: { [debugProvider.workerArgKey]: await debugProvider.getWorkerArgValue(folder) } };
    }
}

function hasHostStartTask(folder: WorkspaceFolder): boolean {
    try {
        return getTasks(folder).some(t => t.type === func && t.command && /^\s*(host )?start/i.test(t.command));
    } catch {
        return false;
    }
}
