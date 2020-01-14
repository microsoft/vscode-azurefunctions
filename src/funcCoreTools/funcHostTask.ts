/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext, registerEvent } from 'vscode-azureextensionui';
import { delay } from '../utils/delay';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

export interface IRunningFuncTask {
    startTime: number;
    processId: number;
}

export const runningFuncTaskMap: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask> = new Map();

export function isFuncHostTask(task: vscode.Task): boolean {
    const commandLine: string | undefined = task.execution && (<vscode.ShellExecution>task.execution).commandLine;
    // tslint:disable-next-line: strict-boolean-expressions
    return /func (host )?start/i.test(commandLine || '');
}

export function registerFuncHostTaskEvents(): void {
    registerEvent('azureFunctions.onDidStartTask', vscode.tasks.onDidStartTaskProcess, async (context: IActionContext, e: vscode.TaskProcessStartEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            runningFuncTaskMap.set(e.execution.task.scope, { startTime: Date.now(), processId: e.processId });
        }
    });

    registerEvent('azureFunctions.onDidEndTask', vscode.tasks.onDidEndTaskProcess, async (context: IActionContext, e: vscode.TaskProcessEndEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            runningFuncTaskMap.delete(e.execution.task.scope);
        }
    });

    registerEvent('azureFunctions.onDidTerminateDebugSession', vscode.debug.onDidTerminateDebugSession, stopFuncTaskIfRunning);
}

async function stopFuncTaskIfRunning(context: IActionContext, debugSession: vscode.DebugSession): Promise<void> {
    context.errorHandling.suppressDisplay = true;
    context.telemetry.suppressIfSuccessful = true;

    if (getWorkspaceSetting<boolean>('stopFuncTaskPostDebug')) {
        if (debugSession.workspaceFolder) {
            const funcExecution: vscode.TaskExecution | undefined = vscode.tasks.taskExecutions.find((te: vscode.TaskExecution) => {
                return te.task.scope === debugSession.workspaceFolder && isFuncHostTask(te.task);
            });

            if (funcExecution) {
                context.telemetry.suppressIfSuccessful = false; // only track telemetry if it's actually the func task

                const runningFuncTask: IRunningFuncTask | undefined = runningFuncTaskMap.get(debugSession.workspaceFolder);
                if (runningFuncTask !== undefined) {
                    // Wait at least 10 seconds after the func task started before calling `terminate` since that will remove task output and we want the user to see any startup errors
                    await delay(Math.max(0, runningFuncTask.startTime + 10 * 1000 - Date.now()));

                    if (runningFuncTaskMap.get(debugSession.workspaceFolder) === runningFuncTask) {
                        funcExecution.terminate();
                    }
                }
            }
        }
    }
}
