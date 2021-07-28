/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { IActionContext, registerEvent } from 'vscode-azureextensionui';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { localSettingsFileName } from '../constants';
import { getLocalSettingsJson } from '../funcConfig/local.settings';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

export interface IRunningFuncTask {
    processId: number;
}

export const runningFuncTaskMap: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask> = new Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask>();

const funcTaskStartedEmitter = new vscode.EventEmitter<vscode.WorkspaceFolder | vscode.TaskScope | undefined>();
export const onFuncTaskStarted = funcTaskStartedEmitter.event;

export const runningFuncPortMap = new Map<vscode.WorkspaceFolder | vscode.TaskScope | undefined, string>();
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
            runningFuncTaskMap.set(e.execution.task.scope, { processId: e.processId });
            runningFuncPortMap.set(e.execution.task.scope, await getFuncPortFromTaskOrProject(context, e.execution.task, e.execution.task.scope));
            funcTaskStartedEmitter.fire(e.execution.task.scope);
        }
    });

    registerEvent('azureFunctions.onDidEndTask', vscode.tasks.onDidEndTaskProcess, (context: IActionContext, e: vscode.TaskProcessEndEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            runningFuncTaskMap.delete(e.execution.task.scope);
        }
    });

    registerEvent('azureFunctions.onDidTerminateDebugSession', vscode.debug.onDidTerminateDebugSession, (context: IActionContext, debugSession: vscode.DebugSession) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;

        if (getWorkspaceSetting<boolean>('stopFuncTaskPostDebug') && debugSession.workspaceFolder) {
            stopFuncTaskIfRunning(debugSession.workspaceFolder);
        }
    });
}

export function stopFuncTaskIfRunning(workspaceFolder: vscode.WorkspaceFolder): void {
    const runningFuncTask: IRunningFuncTask | undefined = runningFuncTaskMap.get(workspaceFolder);
    if (runningFuncTask !== undefined) {
        // Use `process.kill` because `TaskExecution.terminate` closes the terminal pane and erases all output
        // Also to hopefully fix https://github.com/microsoft/vscode-azurefunctions/issues/1401
        process.kill(runningFuncTask.processId);
        runningFuncTaskMap.delete(workspaceFolder);
    }
}

export async function getFuncPortFromTaskOrProject(context: IActionContext, funcTask: vscode.Task | undefined, projectPathOrTaskScope: string | vscode.WorkspaceFolder | vscode.TaskScope): Promise<string> {
    try {
        // First, check the task itself
        if (funcTask && typeof funcTask.definition.command === 'string') {
            const match = funcTask.definition.command.match(/\s+(?:"|'|)(?:-p|--port)(?:"|'|)\s+(?:"|'|)([0-9]+)/i);
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
