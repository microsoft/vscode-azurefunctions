/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerEvent, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { localSettingsFileName } from '../constants';
import { getLocalSettingsJson } from '../funcConfig/local.settings';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

export interface IRunningFuncTask {
    taskExecution: vscode.TaskExecution;
    processId: number;
    portNumber: string;
}

interface DotnetDebugDebugConfiguration extends vscode.DebugConfiguration {
    launchServiceData: { [key: string]: string }
}

namespace DotnetDebugDebugConfiguration {
    export function is(debugConfiguration: vscode.DebugConfiguration): debugConfiguration is DotnetDebugDebugConfiguration {
        return debugConfiguration.type === 'coreclr' && 'launchServiceData' in debugConfiguration
    }
}

export const runningFuncTaskMap: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]> = new Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]>();

const funcTaskStartedEmitter = new vscode.EventEmitter<vscode.WorkspaceFolder | vscode.TaskScope>();
export const onFuncTaskStarted = funcTaskStartedEmitter.event;

export const buildPathToWorkspaceFolderMap = new Map<string, vscode.WorkspaceFolder>();
export const runningFuncPortMap = new Map<vscode.WorkspaceFolder | vscode.TaskScope | undefined, string[]>();
const defaultFuncPort: string = '7071';

export function isFuncHostTask(task: vscode.Task): boolean {
    const commandLine: string | undefined = task.execution && (<vscode.ShellExecution>task.execution).commandLine;
    return /func (host )?start/i.test(commandLine || '');
}

export function registerFuncHostTaskEvents(): void {
    registerEvent('azureFunctions.onDidStartTask', vscode.tasks.onDidStartTaskProcess, async (context: IActionContext, e: vscode.TaskProcessStartEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            const portNumber = await getFuncPortFromTaskOrProject(context, e.execution.task, e.execution.task.scope);
            const runningFuncTask = { processId: e.processId, taskExecution: e.execution, portNumber };
            set(runningFuncTaskMap, e.execution.task.scope, runningFuncTask);
            funcTaskStartedEmitter.fire(e.execution.task.scope);
        }
    });

    registerEvent('azureFunctions.onDidEndTask', vscode.tasks.onDidEndTaskProcess, (context: IActionContext, e: vscode.TaskProcessEndEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        // e.execution.task.execution.options.cwd will be the build path
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            remove(runningFuncTaskMap, e.execution.task.scope, (e.execution.task.execution as vscode.ShellExecution).options?.cwd);
        }
    });

    registerEvent('azureFunctions.onDidTerminateDebugSession', vscode.debug.onDidTerminateDebugSession, (context: IActionContext, debugSession: vscode.DebugSession) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;

        // Used to stop the task started with pickFuncProcess.ts startFuncProcessFromApi.
        if (DotnetDebugDebugConfiguration.is(debugSession.configuration) && debugSession.configuration.launchServiceData.buildPath) {
            const buildPathUri: vscode.Uri = vscode.Uri.file(debugSession.configuration.launchServiceData.buildPath)

            const workspaceFolder = buildPathToWorkspaceFolderMap.get(debugSession.configuration.launchServiceData.buildPath)
            if (workspaceFolder === undefined) {
                throw Error()
            }

            stopFuncTaskIfRunning(workspaceFolder, buildPathUri.fsPath, undefined, true)

            buildPathToWorkspaceFolderMap.delete(debugSession.configuration.launchServiceData.buildPath)
        }

        // NOTE: Only stop the func task if this is the root debug session (aka does not have a parentSession) to fix https://github.com/microsoft/vscode-azurefunctions/issues/2925
        if (getWorkspaceSetting<boolean>('stopFuncTaskPostDebug') && !debugSession.parentSession && debugSession.workspaceFolder) {
            stopFuncTaskIfRunning(debugSession.workspaceFolder, undefined, debugSession.configuration.processId as string);
        }
    });
}

export function stopFuncTaskIfRunning(workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string, pid?: string, terminate?: boolean): void {
    let runningFuncTask: IRunningFuncTask | undefined
    if (buildPath) {
        runningFuncTask = get(runningFuncTaskMap, workspaceFolder, buildPath);
    } else if (pid) {
        runningFuncTask = getByProcessId(runningFuncTaskMap, workspaceFolder, pid);
    }

    if (runningFuncTask !== undefined) {
        if (terminate) {
            runningFuncTask.taskExecution.terminate()
        }
        else {
            // Use `process.kill` because `TaskExecution.terminate` closes the terminal pane and erases all output
            // Also to hopefully fix https://github.com/microsoft/vscode-azurefunctions/issues/1401
            process.kill(runningFuncTask.processId);
            remove(runningFuncTaskMap, workspaceFolder, buildPath);
        }
    }
}

export async function getFuncPortFromTaskOrProject(context: IActionContext, funcTask: vscode.Task | undefined, projectPathOrTaskScope: string | vscode.WorkspaceFolder | vscode.TaskScope): Promise<string> {
    try {
        // First, check the task itself
        if (funcTask && funcTask.execution instanceof vscode.ShellExecution) {
            const match = funcTask.execution?.commandLine?.match(/\s+(?:"|'|)(?:-p|--port)(?:"|'|)\s+(?:"|'|)([0-9]+)/i);
            if (match) {
                return match[1];
            }
        }

        // Second, check local.settings.json
        let projectPath: string | undefined;
        if (typeof projectPathOrTaskScope === 'string') {
            projectPath = projectPathOrTaskScope;
        } else if (typeof projectPathOrTaskScope === 'object') {
            projectPath = await tryGetFunctionProjectRoot(context, projectPathOrTaskScope);
        }

        if (projectPath) {
            const localSettings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
            if (localSettings.Host) {
                const key = Object.keys(localSettings.Host).find(k => k.toLowerCase() === 'localhttpport');
                if (key && localSettings.Host[key]) {
                    return localSettings.Host[key];
                }
            }
        }
    } catch {
        // ignore and use default
    }

    // Finally, fall back to the default port
    return defaultFuncPort;
}

function set(map: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]>, key: vscode.WorkspaceFolder | vscode.TaskScope, value: IRunningFuncTask): void {
    const values = map.get(key) || [];
    values.push(value)
    map.set(key, values);
}

export function get(map: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]>, key: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string): IRunningFuncTask | undefined {
    const values = map.get(key) || [];
    return values.find(t => {
        const taskExecution = t.taskExecution.task.execution as vscode.ShellExecution;
        // the cwd will include ${workspaceFolder} from our tasks.json so we need to replace it with the actual path
        const taskDirectory = taskExecution.options?.cwd?.replace('${workspaceFolder}', (t.taskExecution.task?.scope as vscode.WorkspaceFolder).uri?.path)
        return taskDirectory && buildPath && normalizePath(vscode.Uri.parse(taskDirectory).fsPath) === normalizePath(vscode.Uri.parse(buildPath).fsPath);
    });
}

export function getByProcessId(map: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]>, key: vscode.WorkspaceFolder | vscode.TaskScope, pid: string): IRunningFuncTask | undefined {
    const values = map.get(key) || [];
    return values.find(t => {
        return t.processId.toString() === pid;
    });
}

export function has(map: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]>, key: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string): boolean {
    return !!get(map, key, buildPath);
}

function remove(map: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]>, key: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string): void {
    const value = get(map, key, buildPath)
    const values = map.get(key) || [];

    if (value) {
        // remove the individual entry from the array
        values.splice(values.indexOf(value), 1);
        map.set(key, values);
    }

    if (values?.length === 0) {
        map.delete(key);
    }
}

function normalizePath(fsPath: string): string {
    return path.normalize(fsPath).replace(/^(\/|\\)+|(\/|\\)+$/g, '')
}
