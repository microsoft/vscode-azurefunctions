/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../localize';
import { getRequestDependencies, type HttpInvocation, type HttpRequestStateMessage, type HttpResponse } from './model';
import { InvocationRunner, InvocationBlockedError } from './InvocationRunner';
import { copyInvocation, planInvocationChain } from './httpInvocation';
import { type InvocationCollection } from './InvocationCollection';
import { assertLocalHttpRequest, isLocalHttpRequest, resolveRequestBindings, validateRequestTemplate, type HttpInvocationResult } from './requestBindings';

export const invocationRunStates = ['notRun', 'running', 'succeeded', 'failed', 'blocked', 'cancelled'] as const;
export type InvocationRunState = typeof invocationRunStates[number];

export interface InvocationRunStatus {
    readonly state: Exclude<InvocationRunState, 'notRun'>;
    readonly lastRun: Date;
    readonly statusCode?: number;
    readonly duration?: number;
}

interface RunOutput extends HttpInvocationResult {
    definition: string;
    inputs: Map<string, RunOutput>;
}

export interface InvocationRunOptions {
    signal?: AbortSignal;
    saved?: boolean;
    runDependencies?: boolean;
}

/**
 * Runs saved invocations, optionally with their prerequisite chain, and records each one's latest run status.
 * Reuses a prerequisite's output only while its definition and inputs are unchanged. Never edits the collection.
 */
export class ChainInvocationRunner implements vscode.Disposable {
    private readonly invocationRunners = new Map<string, InvocationRunner>();
    private readonly outputs = new Map<string, RunOutput>();
    private readonly reservations = new Map<string, symbol>();
    private readonly statuses = new Map<string, InvocationRunStatus>();
    private readonly onDidChangeStatusEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;
    private epoch = 0;

    public constructor(private readonly collection: InvocationCollection) { }

    public getStatus(id: string): InvocationRunStatus | undefined {
        return this.statuses.get(id);
    }

    /** Returns the invocation's shared runner, so a run started by a tool shows live in its open editor. */
    public getInvocationRunner(id: string): InvocationRunner {
        let runner = this.invocationRunners.get(id);
        if (!runner) {
            runner = new InvocationRunner();
            runner.onDidChange(message => this.updateStatus(id, message));
            this.invocationRunners.set(id, runner);
        }
        return runner;
    }

    private updateStatus(id: string, message: HttpRequestStateMessage): void {
        const lastRun = message.command === 'requestStarted' ? new Date() : this.statuses.get(id)?.lastRun ?? new Date();
        let status: InvocationRunStatus;
        if (message.command === 'requestStarted') {
            status = { state: 'running', lastRun };
        } else if (message.command === 'response') {
            const { status: statusCode, duration } = message.response;
            status = { state: statusCode >= 200 && statusCode < 300 ? 'succeeded' : 'failed', lastRun, statusCode, duration };
        } else {
            status = { state: message.blocked ? 'blocked' : message.cancelled ? 'cancelled' : 'failed', lastRun };
        }
        this.statuses.set(id, status);
        this.onDidChangeStatusEmitter.fire();
    }

    private getOutput(id: string): RunOutput | undefined {
        const output = this.outputs.get(id);
        const invocation = this.collection.get(id);
        if (!output || !invocation || output.definition !== JSON.stringify(copyInvocation(invocation).request) ||
            [...output.inputs].some(([sourceId, source]) => this.getOutput(sourceId) !== source)) {
            this.outputs.delete(id);
            return undefined;
        }
        return output;
    }

    public async send(context: IActionContext, invocation: HttpInvocation, options: InvocationRunOptions = {}): Promise<HttpResponse> {
        this.outputs.delete(invocation.id);
        const plan = planInvocationChain(invocation, id => this.collection.get(id));
        const executing = options.runDependencies ? plan : [plan[plan.length - 1]];
        for (const item of executing) {
            validateRequestTemplate(item.request);
            // Reject the whole chain before any local prerequisite can mutate data.
            assertLocalHttpRequest(item.request);
        }
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
            let inputs = new Map<string, RunOutput>();
            let resolvedRequest = item.request;
            const response = await this.getInvocationRunner(item.id).sendRequest(context, item.request, {
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
                        this.getInvocationRunner(item.id).block(error.message);
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

    public canShareResponse(invocation: HttpInvocation): boolean {
        return planInvocationChain(invocation, id => this.collection.get(id)).every(item => isLocalHttpRequest(item.request));
    }

    public cancel(id?: string): void {
        for (const [key, runner] of this.invocationRunners) {
            if (!id || id === key) {
                runner.cancel();
            }
        }
    }

    public clear(): void {
        this.epoch++;
        for (const runner of this.invocationRunners.values()) {
            runner.dispose();
        }
        this.invocationRunners.clear();
        this.outputs.clear();
        this.reservations.clear();
        this.statuses.clear();
        this.onDidChangeStatusEmitter.fire();
    }

    public dispose(): void {
        this.clear();
        this.onDidChangeStatusEmitter.dispose();
    }
}
