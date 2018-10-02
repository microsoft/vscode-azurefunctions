/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Task, TaskExecution } from 'vscode';
import { IActionContext, registerEvent } from 'vscode-azureextensionui';
import { localize } from '../localize';

let isFuncHostRunning: boolean = false;

export const funcHostTaskLabel: string = 'runFunctionsHost';
export const funcHostCommand: string = 'func host start';
export const funcHostNameRegEx: RegExp = /run\s*functions\s*host/i;

export let stopFuncHostPromise: Promise<void> = Promise.resolve();

export function isFuncHostTask(task: Task): boolean {
    // task.name resolves to the task's id (deprecated https://github.com/Microsoft/vscode/issues/57707), then label
    return funcHostNameRegEx.test(task.name);
}

export function registerFuncHostTaskEvents(): void {
    registerEvent('azureFunctions.onDidStartTask', vscode.tasks.onDidStartTask, async function (this: IActionContext, e: vscode.TaskStartEvent): Promise<void> {
        this.suppressErrorDisplay = true;
        this.suppressTelemetry = true;
        if (isFuncHostTask(e.execution.task)) {
            isFuncHostRunning = true;
        }
    });

    registerEvent('azureFunctions.onDidEndTask', vscode.tasks.onDidEndTask, async function (this: IActionContext, e: vscode.TaskEndEvent): Promise<void> {
        this.suppressErrorDisplay = true;
        this.suppressTelemetry = true;
        if (isFuncHostTask(e.execution.task)) {
            isFuncHostRunning = false;
        }
    });

    registerEvent('azureFunctions.onDidTerminateDebugSession', vscode.debug.onDidTerminateDebugSession, stopFuncTaskIfRunning);
}

async function stopFuncTaskIfRunning(this: IActionContext): Promise<void> {
    this.suppressErrorDisplay = true;
    this.suppressTelemetry = true;

    const funcExecution: TaskExecution | undefined = vscode.tasks.taskExecutions.find((te: TaskExecution) => isFuncHostTask(te.task));
    if (funcExecution && isFuncHostRunning) {
        this.suppressTelemetry = false; // only track telemetry if it's actually the func task
        stopFuncHostPromise = new Promise((resolve: () => void, reject: (e: Error) => void): void => {
            const listener: vscode.Disposable = vscode.tasks.onDidEndTask((e: vscode.TaskEndEvent) => {
                if (isFuncHostTask(e.execution.task)) {
                    resolve();
                    listener.dispose();
                }
            });

            const timeoutInSeconds: number = 30;
            const timeoutError: Error = new Error(localize('failedToFindFuncHost', 'Failed to stop previous running Functions host within "{0}" seconds. Make sure the task has stopped before you debug again.', timeoutInSeconds));
            setTimeout(() => { reject(timeoutError); }, timeoutInSeconds * 1000);
        });
        funcExecution.terminate();
        await stopFuncHostPromise;
    }
}
