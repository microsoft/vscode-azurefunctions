/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext, registerEvent } from 'vscode-azureextensionui';
import { localize } from '../localize';

// The name of the task before we started providing it in FuncTaskProvider.ts
export const oldFuncHostNameRegEx: RegExp = /run\s*functions\s*host/i;

const isFuncHostRunningMap: Map<vscode.WorkspaceFolder | vscode.TaskScope, boolean> = new Map();
export function isFuncHostRunning(folder: vscode.WorkspaceFolder): boolean {
    return !!isFuncHostRunningMap.get(folder);
}

const stopFuncHostPromiseMap: Map<vscode.WorkspaceFolder, Promise<void>> = new Map();
export async function stopFuncHost(folder: vscode.WorkspaceFolder): Promise<void> {
    const promise: Promise<void> | undefined = stopFuncHostPromiseMap.get(folder);
    if (promise) {
        await promise;
    }
}

export function isFuncHostTask(task: vscode.Task): boolean {
    const commandLine: string | undefined = task.execution && (<vscode.ShellExecution>task.execution).commandLine;
    // tslint:disable-next-line: strict-boolean-expressions
    return /func (host )?start/i.test(commandLine || '');
}

export function registerFuncHostTaskEvents(): void {
    registerEvent('azureFunctions.onDidStartTask', vscode.tasks.onDidStartTask, async function (this: IActionContext, e: vscode.TaskStartEvent): Promise<void> {
        this.suppressErrorDisplay = true;
        this.suppressTelemetry = true;
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            isFuncHostRunningMap.set(e.execution.task.scope, true);
        }
    });

    registerEvent('azureFunctions.onDidEndTask', vscode.tasks.onDidEndTask, async function (this: IActionContext, e: vscode.TaskEndEvent): Promise<void> {
        this.suppressErrorDisplay = true;
        this.suppressTelemetry = true;
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            isFuncHostRunningMap.set(e.execution.task.scope, false);
        }
    });

    registerEvent('azureFunctions.onDidTerminateDebugSession', vscode.debug.onDidTerminateDebugSession, stopFuncTaskIfRunning);
}

async function stopFuncTaskIfRunning(this: IActionContext, debugSession: vscode.DebugSession): Promise<void> {
    this.suppressErrorDisplay = true;
    this.suppressTelemetry = true;

    if (debugSession.workspaceFolder) {
        const funcExecution: vscode.TaskExecution | undefined = vscode.tasks.taskExecutions.find((te: vscode.TaskExecution) => {
            return te.task.scope === debugSession.workspaceFolder && isFuncHostTask(te.task);
        });

        if (funcExecution && isFuncHostRunning(debugSession.workspaceFolder)) {
            this.suppressTelemetry = false; // only track telemetry if it's actually the func task
            const stopFuncHostPromise: Promise<void> = new Promise((resolve: () => void, reject: (e: Error) => void): void => {
                const listener: vscode.Disposable = vscode.tasks.onDidEndTask((e: vscode.TaskEndEvent) => {
                    if (e.execution === funcExecution) {
                        resolve();
                        listener.dispose();
                    }
                });

                const timeoutInSeconds: number = 30;
                const timeoutError: Error = new Error(localize('failedToFindFuncHost', 'Failed to stop previous running Functions host within "{0}" seconds. Make sure the task has stopped before you debug again.', timeoutInSeconds));
                setTimeout(() => { reject(timeoutError); }, timeoutInSeconds * 1000);
            });
            stopFuncHostPromiseMap.set(debugSession.workspaceFolder, stopFuncHostPromise);
            funcExecution.terminate();
            await stopFuncHostPromise;
        }
    }
}
