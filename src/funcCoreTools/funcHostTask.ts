/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext, registerEvent } from 'vscode-azureextensionui';
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
    registerEvent('azureFunctions.onDidStartTask', vscode.tasks.onDidStartTaskProcess, (context: IActionContext, e: vscode.TaskProcessStartEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            runningFuncTaskMap.set(e.execution.task.scope, { processId: e.processId });
            runningFuncPortMap.set(e.execution.task.scope, getFuncPortFromTask(e.execution.task));
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
    }
}

export function getFuncPortFromTask(funcTask: vscode.Task | undefined): string {
    let port: string = defaultFuncPort;
    if (funcTask && typeof funcTask.definition.command === 'string') {
        const match = funcTask.definition.command.match(/\s+(?:"|'|)(?:-p|--port)(?:"|'|)\s+(?:"|'|)([0-9]+)/i);
        if (match) {
            port = match[1];
        }
    }

    return port;
}
