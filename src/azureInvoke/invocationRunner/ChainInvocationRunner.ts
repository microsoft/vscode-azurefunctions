/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { copyInvocation, planInvocationChain } from '../httpInvocation';
import { type InvocationCollection } from '../InvocationCollection';
import { type HttpRequestStateMessage, type HttpResponse } from '../models/httpRunModel';
import { getRequestDependencies, type HttpInvocation } from '../models/httpSchema';
import { resolveRequestBindings } from '../triggers/http/resolveRequestBindings';
import { assertLocalHttpRequest, isLocalHttpRequest } from '../triggers/http/sendHttpRequest';
import { validateRequestTemplate } from '../triggers/http/validateRequestTemplate';
import { InvocationBlockedError, InvocationRunner } from './InvocationRunner';
import { type InvocationRunOptions } from './InvocationRunOptions';
import { InvocationRunState, type InvocationRunStatus } from './InvocationRunStatus';
import { RunState, type RunOutput } from './RunState';

/**
 * Runs saved invocations, optionally with their prerequisite chain, and records each one's latest run status.
 * Reuses a prerequisite's output only while its definition and inputs are unchanged. Never edits the collection.
 */
export class ChainInvocationRunner implements vscode.Disposable {
    /** Run state for the open collection. `clear()` replaces it with an empty one. */
    private state = new RunState();

    private readonly onDidChangeStatusEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;

    public constructor(private readonly collection: InvocationCollection) { }

    /**
     * Returns the invocation's latest run status, or undefined if it has not run since the collection was opened.
     */
    public getStatus(id: string): InvocationRunStatus | undefined {
        return this.state.statuses.get(id);
    }

    /**
     * Returns the invocation's shared runner, creating it on first use.
     * Everything that watches or cancels an invocation gets the same runner, so it sees and can stop a run
     * no matter who started it.
     */
    public getInvocationRunner(id: string): InvocationRunner {
        return this.getRunner(this.state, id);
    }

    /**
     * Returns the invocation's runner in the given state, creating it on first use.
     */
    private getRunner(state: RunState, id: string): InvocationRunner {
        let runner = state.invocationRunners.get(id);
        if (!runner) {
            runner = new InvocationRunner();
            runner.onDidChange(message => this.updateStatus(state, id, message));
            state.invocationRunners.set(id, runner);
        }
        return runner;
    }

    /**
     * Sends `invocation` as given and returns its response. With `runDependencies`, first sends any
     * prerequisites from the collection; otherwise reuses their current results.
     */
    public async sendRequest(context: IActionContext, invocation: HttpInvocation, options: InvocationRunOptions = {}): Promise<HttpResponse> {
        const state = this.state;

        // The target is being rerun, so its previous output must not feed dependents, even if this attempt fails early.
        state.outputs.delete(invocation.id);

        // planInvocationChain lists prerequisites in run order and always puts the target last.
        const runChain = planInvocationChain(invocation, id => this.collection.get(id));
        const target = runChain[runChain.length - 1];
        const prerequisites = runChain.slice(0, -1);
        const executing = options.runDependencies ? runChain : [target];

        // Validate every request that will be sent before sending any of them.
        for (const item of executing) {
            validateRequestTemplate(item.request);
            assertLocalHttpRequest(item.request);
        }

        // Claim every request that will be sent, so an overlapping run cannot send any of them twice.
        if (executing.some(item => state.reservedIds.has(item.id))) {
            throw new Error(localize('azureInvoke.chainBusy', 'A request in this chain is already running. Wait or cancel it before starting another run.'));
        }

        for (const item of executing) {
            state.reservedIds.add(item.id);
            state.outputs.delete(item.id);
        }

        // Used after a failure to mark requests that never started because something upstream failed.
        const attempted = new Set<string>();
        const failedPrerequisites = new Set<string>();

        /**
         * Sends one request through its shared runner. When `prerequisites` are given, they run inside its
         * `prepare` step, so the target reports running first and cancelling the target's runner stops the whole chain.
         */
        const run = async (item: HttpInvocation, signal?: AbortSignal, prerequisites?: HttpInvocation[]): Promise<HttpResponse> => {
            attempted.add(item.id);
            let inputs = new Map<string, RunOutput>();
            let resolvedRequest = item.request;

            const response = await this.getRunner(state, item.id).sendRequest(context, item.request, {
                signal,
                // Only the target comes from the caller. Prerequisites always come from the collection.
                saved: item.id === invocation.id ? options.saved : true,
                prepare: async signal => {

                    // 1. Run chain only; send each prerequisite in order and stop at the first failure.
                    for (const prerequisite of prerequisites ?? []) {
                        if (signal.aborted) {
                            throw new UserCancelledError('azureInvoke.request');
                        }

                        try {
                            const result = await run(prerequisite, signal);
                            if (!isSuccessStatus(result.status)) {
                                throw new InvocationBlockedError(localize('azureInvoke.prerequisiteFailed', 'A prerequisite returned a non-success status. The chain stopped before sending the dependent request.'));
                            }
                        } catch (error) {
                            // Cancellation stays cancellation. Any other failure blocks this request.
                            if (isUserCancelledError(error)) {
                                throw error;
                            }
                            failedPrerequisites.add(prerequisite.id);
                            throw error instanceof InvocationBlockedError ? error : new InvocationBlockedError();
                        }
                    }

                    // 2. Collect the current output of every prerequisite, including ordering-only ones.
                    inputs = new Map(getRequestDependencies(item.request).map(id => {
                        const output = this.getOutput(state, id);
                        if (!output) {
                            throw createPrerequisiteNotRunError();
                        }
                        return [id, output];
                    }));

                    // 3. Fill the template's placeholders from those outputs. The saved template is never modified.
                    resolvedRequest = resolveRequestBindings(item.request, id => {
                        const output = inputs.get(id);
                        if (!output) {
                            throw createPrerequisiteNotRunError();
                        }
                        return output;
                    });

                    return resolvedRequest;
                },
            });

            // Cache a successful result for dependents and later Sends.
            if (isSuccessStatus(response.status)) {
                state.outputs.set(item.id, { request: resolvedRequest, response, definition: JSON.stringify(item.request), inputs });
            }

            return response;
        };

        try {
            if (options.signal?.aborted) {
                throw new UserCancelledError('azureInvoke.request');
            }

            // Start with the target. With runDependencies, its prerequisites run inside its prepare step.
            return await run(target, options.signal, options.runDependencies ? prerequisites : undefined);
        } catch (error) {
            // Mark requests that never started because a prerequisite failed as blocked.
            // `executing` is in dependency order, so adding each one as we go also covers indirect dependents.
            if (error instanceof InvocationBlockedError) {
                for (const item of executing) {
                    if (!attempted.has(item.id) && getRequestDependencies(item.request).some(id => failedPrerequisites.has(id))) {
                        failedPrerequisites.add(item.id);
                        this.getRunner(state, item.id).block(error.message);
                    }
                }
            }
            throw error;
        } finally {
            for (const item of executing) {
                state.reservedIds.delete(item.id);
            }
        }
    }

    /**
     * Whether a full response may be returned to Copilot. True only when every request in the chain targets loopback,
     * including prerequisites whose earlier outputs would be reused rather than rerun.
     */
    public canShareResponseWithCopilot(invocation: HttpInvocation): boolean {
        return planInvocationChain(invocation, id => this.collection.get(id)).every(item => isLocalHttpRequest(item.request));
    }

    /**
     * Cancels the in-progress request for one invocation, or for every invocation when `id` is omitted.
     */
    public cancel(id?: string): void {
        for (const [key, runner] of this.state.invocationRunners) {
            if (!id || id === key) {
                runner.cancel();
            }
        }
    }

    /**
     * Cancels in-flight requests and starts over with empty run state.
     * Called when a different collection is opened, so run state never carries over.
     */
    public clear(): void {
        for (const runner of this.state.invocationRunners.values()) {
            runner.dispose();
        }
        this.state = new RunState();
        this.onDidChangeStatusEmitter.fire();
    }

    public dispose(): void {
        this.clear();
        this.onDidChangeStatusEmitter.dispose();
    }

    /**
     * Converts a runner message into the invocation's status and notifies listeners.
     */
    private updateStatus(state: RunState, id: string, message: HttpRequestStateMessage): void {
        // A new attempt records its start time, and later messages keep it.
        // A request blocked before it started has no start time, so it uses the current time.
        const lastRun = message.command === 'requestStarted' ? new Date() : state.statuses.get(id)?.lastRun ?? new Date();

        let status: InvocationRunStatus;
        switch (message.command) {
            case 'requestStarted':
                status = { state: InvocationRunState.Running, lastRun };
                break;
            case 'response': {
                // Any response completes the run, but only 2xx counts as success.
                const { status: statusCode, duration } = message.response;
                status = { state: isSuccessStatus(statusCode) ? InvocationRunState.Succeeded : InvocationRunState.Failed, lastRun, statusCode, duration };
                break;
            }
            case 'requestError':
                // No response: blocked before sending, cancelled, or failed during preparation or transport.
                status = { state: message.blocked ? InvocationRunState.Blocked : message.cancelled ? InvocationRunState.Cancelled : InvocationRunState.Failed, lastRun };
                break;
        }

        state.statuses.set(id, status);
        this.onDidChangeStatusEmitter.fire();
    }

    /**
     * Returns the invocation's cached output while it is still current, and deletes it once it is stale.
     */
    private getOutput(state: RunState, id: string): RunOutput | undefined {
        const output = state.outputs.get(id);
        const invocation = this.collection.get(id);

        if (
            // Never succeeded, or the invocation was removed from the collection.
            !output || !invocation ||
            // The saved template changed since this output was produced.
            output.definition !== JSON.stringify(copyInvocation(invocation).request) ||
            // A prerequisite was rerun or went stale. Compared by identity, so a rerun invalidates dependents even if it returned the same data.
            [...output.inputs].some(([sourceId, source]) => this.getOutput(state, sourceId) !== source)
        ) {
            state.outputs.delete(id);
            return undefined;
        }

        return output;
    }
}

function isSuccessStatus(status: number): boolean {
    return status >= 200 && status < 300;
}

function createPrerequisiteNotRunError(): InvocationBlockedError {
    return new InvocationBlockedError(localize('azureInvoke.prerequisiteNotRun', 'A prerequisite has no current successful result. Save and send it first, or use Run chain to execute prerequisites.'));
}
