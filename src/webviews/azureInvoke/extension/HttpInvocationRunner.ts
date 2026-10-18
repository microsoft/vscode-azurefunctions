/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type Disposable } from 'vscode';
import { localize } from '../../../localize';
import { copyInvocation, planInvocationChain } from '../../../tree/azureInvoke/invocationCollection';
import { getRequestDependencies, type HttpInvocation, type HttpRequest, type HttpRequestStateMessage, type HttpResponse } from '../shared/httpRequest';
import { HttpRequestRunner, InvocationBlockedError } from './HttpRequestRunner';
import { isLocalHttpRequest, resolveRequestBindings, validateRequestTemplate, type HttpInvocationResult } from './requestBindings';

interface RunOutput extends HttpInvocationResult {
    definition: string;
    inputs: Map<string, RunOutput>;
}

interface InvocationRunSnapshot {
    invocation: HttpInvocation;
    request: HttpRequest;
    canShareResponse: boolean;
}

export interface InvocationRunOptions {
    signal?: AbortSignal;
    saved?: boolean;
    runDependencies?: boolean;
}

export class HttpInvocationRunner implements Disposable {
    private readonly runners = new Map<string, HttpRequestRunner>();
    private readonly outputs = new Map<string, RunOutput>();
    private readonly reservations = new Map<string, symbol>();
    private readonly lastRuns = new Map<string, InvocationRunSnapshot>();
    private epoch = 0;

    public constructor(
        private readonly getInvocation: (id: string) => HttpInvocation | undefined,
        private readonly onChange: (id: string, message: HttpRequestStateMessage) => void,
    ) { }

    public get running(): boolean {
        return this.reservations.size > 0;
    }

    public isRunning(id: string): boolean {
        return this.reservations.has(id);
    }

    public getLastRun(id: string) {
        const run = this.lastRuns.get(id);
        const message = this.runners.get(id)?.messages.at(-1);
        if (!run || this.isRunning(id) || !message || message.command === 'requestStarted' ||
            (message.command === 'requestError' && (message.cancelled || message.blocked))) {
            return undefined;
        }
        return { run, message };
    }

    public get messages(): { id: string; message: HttpRequestStateMessage }[] {
        return [...this.runners].flatMap(([id, runner]) => runner.messages.map(message => ({ id, message })));
    }

    public getRunner(id: string): HttpRequestRunner {
        let runner = this.runners.get(id);
        if (!runner) {
            runner = new HttpRequestRunner();
            runner.onDidChange(message => this.onChange(id, message));
            this.runners.set(id, runner);
        }
        return runner;
    }

    private getOutput(id: string): RunOutput | undefined {
        const output = this.outputs.get(id);
        const invocation = this.getInvocation(id);
        if (!output || !invocation || output.definition !== JSON.stringify(copyInvocation(invocation).request) ||
            [...output.inputs].some(([sourceId, source]) => this.getOutput(sourceId) !== source)) {
            this.outputs.delete(id);
            return undefined;
        }
        return output;
    }

    public async send(context: IActionContext, invocation: HttpInvocation, options: InvocationRunOptions = {}): Promise<HttpResponse> {
        if (!this.isRunning(invocation.id)) {
            this.lastRuns.delete(invocation.id);
        }
        this.outputs.delete(invocation.id);
        const plan = planInvocationChain(invocation, this.getInvocation);
        const executing = options.runDependencies ? plan : [plan[plan.length - 1]];
        executing.forEach(item => validateRequestTemplate(item.request));
        if (executing.some(item => this.reservations.has(item.id))) {
            throw new Error(localize('azureInvoke.chainBusy', 'A request in this chain is already running. Wait or cancel it before starting another run.'));
        }
        const reservation = Symbol();
        const epoch = this.epoch;
        const attempted = new Set<string>();
        const failedPrerequisites = new Set<string>();
        for (const item of executing) {
            this.reservations.set(item.id, reservation);
            this.outputs.delete(item.id);
        }
        const run = async (item: HttpInvocation, signal?: AbortSignal, prerequisites?: HttpInvocation[]): Promise<HttpResponse> => {
            attempted.add(item.id);
            this.lastRuns.delete(item.id);
            let inputs = new Map<string, RunOutput>();
            let resolvedRequest = item.request;
            const response = await this.getRunner(item.id).sendRequest(context, item.request, {
                signal, saved: item.id === invocation.id ? options.saved : true,
                prepare: async signal => {
                    for (const prerequisite of prerequisites ?? []) {
                        if (signal.aborted) {
                            throw new UserCancelledError('azureInvoke.request');
                        }
                        try {
                            const result = await run(prerequisite, signal);
                            if (result.status < 200 || result.status >= 300) {
                                throw new InvocationBlockedError(localize('azureInvoke.prerequisiteFailed', 'A prerequisite returned a non-success status. The chain stopped before sending the dependent request.'));
                            }
                        } catch (error) {
                            if (isUserCancelledError(error)) {
                                throw error;
                            }
                            failedPrerequisites.add(prerequisite.id);
                            throw error instanceof InvocationBlockedError ? error : new InvocationBlockedError();
                        }
                    }
                    inputs = new Map(getRequestDependencies(item.request).map(id => {
                        const output = this.getOutput(id);
                        if (!output) {
                            throw new InvocationBlockedError(localize('azureInvoke.prerequisiteNotRun', 'A prerequisite has no current successful result. Save and send it first, or use Run chain to execute prerequisites.'));
                        }
                        return [id, output];
                    }));
                    resolvedRequest = resolveRequestBindings(item.request, id => {
                        const output = inputs.get(id);
                        if (!output) {
                            throw new InvocationBlockedError(localize('azureInvoke.prerequisiteNotRun', 'A prerequisite has no current successful result. Save and send it first, or use Run chain to execute prerequisites.'));
                        }
                        return output;
                    });
                    this.lastRuns.set(item.id, {
                        invocation: copyInvocation(item),
                        request: copyInvocation({ ...item, request: resolvedRequest }).request,
                        canShareResponse: planInvocationChain(item, id => plan.find(input => input.id === id)).every(input => isLocalHttpRequest(input.request)),
                    });
                    return resolvedRequest;
                },
            });
            if (epoch === this.epoch && response.status >= 200 && response.status < 300) {
                this.outputs.set(item.id, { request: resolvedRequest, response, definition: JSON.stringify(item.request), inputs });
            }
            return response;
        };
        try {
            if (options.signal?.aborted) {
                throw new UserCancelledError('azureInvoke.request');
            }
            return await run(executing[executing.length - 1], options.signal, options.runDependencies ? executing.slice(0, -1) : undefined);
        } catch (error) {
            if (epoch === this.epoch && error instanceof InvocationBlockedError) {
                for (const item of executing) {
                    if (!attempted.has(item.id) && getRequestDependencies(item.request).some(id => failedPrerequisites.has(id))) {
                        failedPrerequisites.add(item.id);
                        this.lastRuns.delete(item.id);
                        this.getRunner(item.id).block(error.message);
                    }
                }
            }
            throw error;
        } finally {
            for (const item of executing) {
                if (this.reservations.get(item.id) === reservation) {
                    this.reservations.delete(item.id);
                }
            }
        }
    }

    public async replay(context: IActionContext, snapshot: InvocationRunSnapshot, signal: AbortSignal): Promise<HttpResponse> {
        const { id } = snapshot.invocation;
        if (this.reservations.has(id)) {
            throw new Error(localize('azureInvoke.chainBusy', 'A request in this chain is already running. Wait or cancel it before starting another run.'));
        }
        const reservation = Symbol();
        this.reservations.set(id, reservation);
        this.outputs.delete(id);
        this.lastRuns.delete(id);
        try {
            return await this.getRunner(id).sendRequest(context, snapshot.request, {
                signal, saved: true, timeout: null,
                prepare: async () => {
                    this.lastRuns.set(id, snapshot);
                    return snapshot.request;
                },
            });
        } finally {
            if (this.reservations.get(id) === reservation) {
                this.reservations.delete(id);
            }
        }
    }

    public canShareResponse(invocation: HttpInvocation): boolean {
        return planInvocationChain(invocation, this.getInvocation).every(item => isLocalHttpRequest(item.request));
    }

    public cancel(id?: string): void {
        for (const [key, runner] of this.runners) {
            if (!id || id === key) {
                runner.cancel();
            }
        }
    }

    public clear(): void {
        this.epoch++;
        for (const runner of this.runners.values()) {
            runner.dispose();
        }
        this.runners.clear();
        this.outputs.clear();
        this.reservations.clear();
        this.lastRuns.clear();
    }

    public dispose(): void {
        this.clear();
    }
}
