/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { requestUtils } from '../../utils/requestUtils';
import { type HttpRequestStateMessage, type HttpResponse } from '../models/httpRunModel';
import { sendHttpRequest } from '../triggers/http/sendHttpRequest';

/**
 * Sends one request at a time for a single invocation and keeps the latest attempt's messages.
 * Everything that sends, watches, or cancels that invocation shares one runner, so they all see the same run.
 */
export class InvocationRunner implements vscode.Disposable {
    /** Aborts the request in progress. Set only while a request is running. */
    private activeRequest: AbortController | undefined;
    /** A disposed runner refuses new requests. */
    private disposed = false;

    /** Start message of the latest attempt. Cleared when a request is blocked before starting. */
    private started: HttpRequestStateMessage | undefined;
    /** Response or error message of the latest attempt. Cleared when a new attempt starts. */
    private result: HttpRequestStateMessage | undefined;
    /** Numbers each message. The editor view ignores any message not newer than the last one it applied, so a replayed message can never replace a newer one. */
    private sequence = 0;

    private readonly changeEmitter = new vscode.EventEmitter<HttpRequestStateMessage>();
    public readonly onDidChange = this.changeEmitter.event;

    public get running(): boolean {
        return !!this.activeRequest;
    }

    /**
     * The latest attempt's start and result messages, so something that starts listening mid-run can catch up.
     */
    public get messages(): HttpRequestStateMessage[] {
        return [this.started, this.result].filter(message => message !== undefined);
    }

    /**
     * Cancels the request in progress, if any.
     */
    public cancel(): void {
        this.activeRequest?.abort();
    }

    /**
     * Records that the request was not sent because a prerequisite failed, without starting an attempt.
     */
    public block(message: string): void {
        this.started = undefined;
        this.result = { command: 'requestError', message, blocked: true, sequence: ++this.sequence };
        this.changeEmitter.fire(this.result);
    }

    /**
     * Sends one HTTP request and returns the response. If `options.prepare` is given, its result is sent instead.
     * The input is checked just before sending, so callers can pass data whose shape hasn't been checked yet.
     * Publishes a start message, then a response or error message, and rethrows errors after publishing them.
     */
    public async sendRequest(context: IActionContext, request: unknown, options: SendRequestOptions = {}): Promise<HttpResponse> {
        // One request at a time per invocation, and none after disposal.
        if (this.disposed) {
            throw new Error(localize('azureInvoke.requestClosed', 'This invocation is no longer available. Reopen it and try again.'));
        }
        if (this.activeRequest) {
            throw new Error(localize('azureInvoke.alreadySending', 'A request is already running.'));
        }

        // Either `cancel()` or the caller's signal stops the request.
        const abort = new AbortController();
        this.activeRequest = abort;
        const signal = options.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal;

        // Start a new attempt, replacing the previous attempt's messages.
        this.started = { command: 'requestStarted', saved: options.saved ?? false, sequence: ++this.sequence };
        this.result = undefined;
        this.changeEmitter.fire(this.started);

        try {
            // `prepare` runs after the start message, so the request shows as running while it works.
            const input = options.prepare ? await options.prepare(signal) : request;
            if (signal.aborted) {
                throw new UserCancelledError('azureInvoke.request');
            }

            const response = await sendHttpRequest(context, input, signal, requestUtils.getRequestTimeoutMS());
            this.result = { command: 'response', response, sequence: ++this.sequence };
            this.changeEmitter.fire(this.result);
            return response;
        } catch (error) {
            // Publish the failure with its kind, then let the caller handle the original error.
            this.result = {
                command: 'requestError',
                cancelled: isUserCancelledError(error),
                ...(error instanceof InvocationBlockedError ? { blocked: true } : {}),
                sequence: ++this.sequence,
                message: getRequestErrorMessage(error),
            };
            this.changeEmitter.fire(this.result);
            throw error;
        } finally {
            this.activeRequest = undefined;
        }
    }

    /**
     * Cancels any request in progress, forgets the latest attempt, and refuses new requests.
     */
    public dispose(): void {
        this.disposed = true;
        this.cancel();
        this.started = undefined;
        this.result = undefined;
        this.changeEmitter.dispose();
    }
}

/**
 * Returns the text shown for a failed request. Cancellation gets a fixed message rather than the error's own.
 */
export function getRequestErrorMessage(error: unknown): string {
    if (isUserCancelledError(error)) {
        return localize('azureInvoke.cancelled', 'Request cancelled.');
    }
    return error instanceof Error ? error.message : localize('azureInvoke.unexpectedError', 'The request failed.');
}

/**
 * Thrown when a request is not sent because a prerequisite failed or has no current result.
 * The runner reports it as blocked rather than failed.
 */
export class InvocationBlockedError extends Error {
    public constructor(message = localize('azureInvoke.prerequisiteBlocked', 'Not run because a prerequisite failed. Resolve that failure and rerun the chain.')) {
        super(message);
    }
}

/**
 * Options for a single `sendRequest` call.
 */
interface SendRequestOptions {
    /**
     * Cancellation owned by the caller. Either it or `cancel()` stops the request.
     */
    signal?: AbortSignal;
    /**
     * Whether the request is its saved definition. Reported in the start message.
     */
    saved?: boolean;
    /**
     * Runs after the start message. Its return value replaces `request` as the input to send.
     */
    prepare?: (signal: AbortSignal) => Promise<unknown>;
}
