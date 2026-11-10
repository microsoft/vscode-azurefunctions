/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { validateCollectionInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { type HttpRequestStateMessage } from '../shared/httpRequest';
import { copyTimerInvocation, type TimerInvocation, type TimerInvocationState } from '../shared/timerInvocation';
import { HttpRequestRunner } from './HttpRequestRunner';
import { TimerInvocationController } from './TimerInvocationController';

export class TimerInvocationEditors implements vscode.Disposable {
    private readonly controllers = new Map<string, TimerInvocationController>();
    private readonly runners = new Map<string, HttpRequestRunner>();
    private readonly messages = new Map<string, TimerInvocationState>();
    private readonly changeEmitter = new vscode.EventEmitter<{ id: string; message: TimerInvocationState }>();
    private readonly subscriptions: vscode.Disposable[];

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly provider: AzureInvokeTreeDataProvider,
    ) {
        this.subscriptions = [];
    }

    public get size(): number {
        return this.controllers.size;
    }

    public open(invocation: TimerInvocation, saved: boolean): TimerInvocationController {
        const existing = this.controllers.get(invocation.id);
        if (existing) {
            existing.revealToForeground(vscode.ViewColumn.Active);
            return existing;
        }
        const controller = new TimerInvocationController(this.context, invocation, saved, {
            save: snapshot => this.provider.saveRequest(snapshot),
            run: (context, snapshot) => this.run(context, snapshot),
            cancel: () => this.runners.get(invocation.id)?.cancel(),
            state: () => this.messages.get(invocation.id),
            onDidChange: this.changeEmitter.event,
        });
        this.controllers.set(invocation.id, controller);
        controller.onDisposed(() => {
            this.controllers.delete(invocation.id);
            this.runners.get(invocation.id)?.dispose();
            this.runners.delete(invocation.id);
            this.messages.delete(invocation.id);
        });
        return controller;
    }

    private getRunner(id: string): HttpRequestRunner {
        let runner = this.runners.get(id);
        if (!runner) {
            runner = new HttpRequestRunner();
            runner.onDidChange(message => this.publish(id, message));
            this.runners.set(id, runner);
        }
        return runner;
    }

    private publish(id: string, state: HttpRequestStateMessage): void {
        const message: TimerInvocationState = state.command === 'requestStarted' ? { command: 'invocationStarted' } :
            state.command === 'response' && state.response.status >= 200 && state.response.status < 300 ?
                { command: 'invocationResult', result: { status: state.response.status, duration: state.response.duration, functionExecution: 'notObserved' } } :
                {
                    command: 'invocationError', cancelled: state.command === 'requestError' && !!state.cancelled,
                    message: state.command === 'requestError' ? state.message : localize('azureInvoke.timerRejected', 'The Functions host rejected the invocation (HTTP {0}). Check the host and function name.', state.response.status),
                };
        this.messages.set(id, message);
        this.provider.updateTimerStatus(id, message);
        this.changeEmitter.fire({ id, message });
    }

    public async run(context: IActionContext, invocation: TimerInvocation, signal?: AbortSignal) {
        validateCollectionInvocation(invocation);
        const snapshot = copyTimerInvocation(invocation);
        context.valuesToMask.push(snapshot.request.hostUrl, snapshot.request.functionName, snapshot.request.schedule);
        context.telemetry.maskEntireErrorMessage = true;
        const response = await this.getRunner(snapshot.id).sendRequest(context, undefined, {
            signal, saved: !!this.provider.getTimerInvocation(snapshot.id),
            prepare: async () => {
                return {
                    method: 'POST',
                    url: new URL(`/admin/functions/${encodeURIComponent(snapshot.request.functionName)}`, snapshot.request.hostUrl).toString(),
                    headers: [{ name: 'Content-Type', value: 'application/json' }], query: [], body: JSON.stringify({ input: '' }),
                };
            },
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(localize('azureInvoke.timerRejected', 'The Functions host rejected the invocation (HTTP {0}). Check the host and function name.', response.status));
        }
        return { status: response.status, duration: response.duration, functionExecution: 'notObserved' as const };
    }

    public closeAll(): void {
        this.runners.forEach(runner => runner.dispose());
        this.runners.clear();
        this.controllers.forEach(controller => controller.dispose());
        this.controllers.clear();
        this.messages.clear();
    }

    public dispose(): void {
        this.closeAll();
        this.subscriptions.forEach(subscription => subscription.dispose());
        this.changeEmitter.dispose();
    }
}
