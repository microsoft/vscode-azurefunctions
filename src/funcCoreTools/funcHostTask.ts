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

export const runningFuncTaskMap: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask> = new Map();

/**
 * Need to track failed tasks to workaround this issue: https://github.com/microsoft/vscode/issues/112247
 */
export const failedFuncExecutionMap: Map<vscode.WorkspaceFolder | vscode.TaskScope, boolean> = new Map();

export function isFuncHostTask(task: vscode.Task): boolean {
    const commandLine: string | undefined = task.execution && (<vscode.ShellExecution>task.execution).commandLine;
    // tslint:disable-next-line: strict-boolean-expressions
    return /func (host )?start/i.test(commandLine || '');
}

export function registerFuncHostTaskEvents(): void {
    registerEvent('azureFunctions.onDidStartTask', vscode.tasks.onDidStartTaskProcess, async (context: IActionContext, e: vscode.TaskProcessStartEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (e.execution.task.scope !== undefined) {
            failedFuncExecutionMap.set(e.execution.task.scope, false);

            if (isFuncHostTask(e.execution.task)) {
                runningFuncTaskMap.set(e.execution.task.scope, { processId: e.processId });
            }
        }
    });

    registerEvent('azureFunctions.onDidEndTask', vscode.tasks.onDidEndTaskProcess, async (context: IActionContext, e: vscode.TaskProcessEndEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (e.execution.task.scope !== undefined) {
            if (e.exitCode !== 0) {
                failedFuncExecutionMap.set(e.execution.task.scope, true);
            }

            if (isFuncHostTask(e.execution.task)) {
                runningFuncTaskMap.delete(e.execution.task.scope);
            }
        }
    });

    registerEvent('azureFunctions.onDidTerminateDebugSession', vscode.debug.onDidTerminateDebugSession, async (context: IActionContext, debugSession: vscode.DebugSession) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;

        if (getWorkspaceSetting<boolean>('stopFuncTaskPostDebug') && debugSession.workspaceFolder) {
            await stopFuncTaskIfRunning(debugSession.workspaceFolder);
        }
    });
}

export async function stopFuncTaskIfRunning(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const runningFuncTask: IRunningFuncTask | undefined = runningFuncTaskMap.get(workspaceFolder);
    if (runningFuncTask !== undefined) {
        // Use `process.kill` because `TaskExecution.terminate` closes the terminal pane and erases all output
        // Also to hopefully fix https://github.com/microsoft/vscode-azurefunctions/issues/1401
        process.kill(runningFuncTask.processId);
    }
}
