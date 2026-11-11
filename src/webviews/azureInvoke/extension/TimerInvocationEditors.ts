/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { openTimerInvocationDebugChat } from '../../../commands/azureInvoke/openAzureInvokeChat';
import { resolveInvocationDebugSession, type InvocationDebugSession } from '../../../commands/azureInvoke/resolveInvocationDebugSession';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { validateCollectionInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { type HttpRequestStateMessage } from '../shared/httpRequest';
import { copyTimerInvocation, type TimerInvocation, type TimerInvocationState } from '../shared/timerInvocation';
import { HttpRequestRunner } from './HttpRequestRunner';
import { TimerInvocationController } from './TimerInvocationController';

interface TimerDebugTarget {
    id: string;
    invocation: TimerInvocation;
    session: InvocationDebugSession;
    consumed: boolean;
    breakpointGuidance?: string;
}

export class TimerInvocationEditors implements vscode.Disposable {
    private readonly controllers = new Map<string, TimerInvocationController>();
    private readonly runners = new Map<string, HttpRequestRunner>();
    private readonly messages = new Map<string, TimerInvocationState>();
    private readonly changeEmitter = new vscode.EventEmitter<{ id: string; message: TimerInvocationState }>();
    private readonly subscriptions: vscode.Disposable[];
    private debugTarget: TimerDebugTarget | undefined;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly provider: AzureInvokeTreeDataProvider,
        private readonly debugging = { resolveSession: resolveInvocationDebugSession, openChat: openTimerInvocationDebugChat },
    ) {
        this.subscriptions = [
            provider.onDidChangeTreeData(() => {
                const target = this.debugTarget;
                if (target && JSON.stringify(provider.getTimerInvocation(target.invocation.id)?.request) !== JSON.stringify(target.invocation.request)) {
                    this.runners.get(target.invocation.id)?.cancel();
                    this.debugTarget = undefined;
                }
            }),
            vscode.debug.onDidChangeActiveDebugSession(session => {
                if (this.debugTarget && this.debugTarget.session.id !== session?.id) {
                    this.runners.get(this.debugTarget.invocation.id)?.cancel();
                    this.debugTarget = undefined;
                }
            }),
        ];
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
            debug: (context, guidance) => this.debugInvocation(context, invocation.id, guidance),
            state: () => this.messages.get(invocation.id),
            onDidChange: this.changeEmitter.event,
        });
        this.controllers.set(invocation.id, controller);
        controller.onDisposed(() => {
            this.controllers.delete(invocation.id);
            this.runners.get(invocation.id)?.dispose();
            this.runners.delete(invocation.id);
            this.messages.delete(invocation.id);
            if (this.debugTarget?.invocation.id === invocation.id) {
                this.debugTarget = undefined;
            }
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

    public async run(context: IActionContext, invocation: TimerInvocation, signal?: AbortSignal, target?: TimerDebugTarget) {
        validateCollectionInvocation(invocation);
        const snapshot = copyTimerInvocation(invocation);
        context.valuesToMask.push(snapshot.request.hostUrl, snapshot.request.functionName, snapshot.request.schedule);
        context.telemetry.maskEntireErrorMessage = true;
        const termination = target && vscode.debug.onDidTerminateDebugSession(session => {
            if (session.id === target.session.id) {
                this.runners.get(snapshot.id)?.cancel();
            }
        });
        try {
            const response = await this.getRunner(snapshot.id).sendRequest(context, undefined, {
                signal, saved: !!this.provider.getTimerInvocation(snapshot.id),
                ...(target ? { timeout: null } : {}),
                prepare: async () => {
                    if (target) {
                        await this.requireDebugTarget(context, snapshot.id, target.id, target);
                    }
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
        } finally {
            termination?.dispose();
        }
    }

    public async debugInvocation(context: IActionContext, id: string, guidance: string): Promise<void> {
        context.valuesToMask.push(guidance);
        if (guidance.length > 500) {
            throw new Error(localize('azureInvoke.breakpointGuidanceTooLong', 'Keep breakpoint guidance within 500 characters.'));
        }
        const invocation = this.provider.getTimerInvocation(id);
        if (!invocation) {
            throw new Error(localize('azureInvoke.timerNotSaved', 'Save this Timer invocation first, then try again.'));
        }
        if (this.runners.get(id)?.running) {
            throw new Error(localize('azureInvoke.alreadySending', 'A request is already running.'));
        }
        const session = await this.debugging.resolveSession(context);
        const target: TimerDebugTarget = { id: randomUUID(), invocation, session, consumed: false, breakpointGuidance: guidance.trim() || undefined };
        this.debugTarget = target;
        try {
            await this.requireDebugTarget(context, id, target.id);
            await this.debugging.openChat(id, target.id);
        } catch (error) {
            if (this.debugTarget === target) {
                this.debugTarget = undefined;
            }
            throw error;
        }
    }

    private async requireDebugTarget(context: IActionContext, id: string, debugId: string, executing?: TimerDebugTarget): Promise<TimerDebugTarget> {
        const target = this.debugTarget;
        if (!target || target.id !== debugId || target.invocation.id !== id ||
            (target.consumed && target !== executing) ||
            JSON.stringify(this.provider.getTimerInvocation(id)?.request) !== JSON.stringify(target.invocation.request)) {
            throw new Error(localize('azureInvoke.timerDebugExpired', 'Timer invocation authorization expired or the definition changed. Select Run with Copilot breakpoints again. No invocation was sent.'));
        }
        const session = await this.debugging.resolveSession(context);
        if (session.id !== target.session.id || this.debugTarget !== target || (target.consumed && target !== executing)) {
            throw new Error(localize('azureInvoke.timerDebuggerChanged', 'The debugger changed. Select Run with Copilot breakpoints again. No invocation was sent.'));
        }
        return target;
    }

    public async getDebugContext(context: IActionContext, id: string, debugId: string) {
        const target = await this.requireDebugTarget(context, id, debugId);
        return {
            id, debugId, workspaceFolder: target.session.workspaceFolder, trigger: 'timer' as const,
            functionName: target.invocation.request.functionName, schedule: target.invocation.request.schedule,
            ...(target.breakpointGuidance ? { breakpointGuidance: target.breakpointGuidance } : {}),
        };
    }

    public async runDebug(context: IActionContext, id: string, debugId: string, signal?: AbortSignal) {
        const target = await this.requireDebugTarget(context, id, debugId);
        target.consumed = true;
        return this.run(context, target.invocation, signal, target);
    }

    public closeAll(): void {
        this.debugTarget = undefined;
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
