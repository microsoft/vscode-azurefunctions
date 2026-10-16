/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../../localize';
import { requestUtils } from '../../../utils/requestUtils';
import { type HttpRequestStateMessage, type HttpResponse } from '../shared/httpRequest';
import { sendHttpRequest } from './sendHttpRequest';

export class HttpRequestRunner implements vscode.Disposable {
    private activeRequest: AbortController | undefined;
    private readonly changeEmitter = new vscode.EventEmitter<HttpRequestStateMessage>();
    public readonly onDidChange = this.changeEmitter.event;
    private started: HttpRequestStateMessage | undefined;
    private result: HttpRequestStateMessage | undefined;
    private disposed = false;
    private sequence = 0;

    public get running(): boolean {
        return !!this.activeRequest;
    }

    public get messages(): HttpRequestStateMessage[] {
        return [this.started, this.result].filter(message => message !== undefined);
    }

    public cancel(): void {
        this.activeRequest?.abort();
    }

    public async sendRequest(context: IActionContext, request: unknown, options: { signal?: AbortSignal; saved?: boolean; prepare?: (signal: AbortSignal) => Promise<unknown> } = {}): Promise<HttpResponse> {
        if (this.disposed) {
            throw new Error(localize('azureInvoke.requestClosed', 'This invocation is no longer available. Reopen it and try again.'));
        }
        if (this.activeRequest) {
            throw new Error(localize('azureInvoke.alreadySending', 'A request is already running.'));
        }
        const abort = new AbortController();
        this.activeRequest = abort;
        const signal = options.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal;
        this.started = { command: 'requestStarted', saved: options.saved ?? false, sequence: ++this.sequence };
        this.result = undefined;
        this.changeEmitter.fire(this.started);
        try {
            const input = options.prepare ? await options.prepare(signal) : request;
            if (signal.aborted) {
                throw new UserCancelledError('azureInvoke.request');
            }
            const response = await sendHttpRequest(context, input, signal, requestUtils.getRequestTimeoutMS());
            this.result = { command: 'response', response, sequence: ++this.sequence };
            this.changeEmitter.fire(this.result);
            return response;
        } catch (error) {
            this.result = {
                command: 'requestError',
                cancelled: isUserCancelledError(error),
                sequence: ++this.sequence,
                message: isUserCancelledError(error) ? localize('azureInvoke.cancelled', 'Request cancelled.') :
                    error instanceof Error ? error.message : localize('azureInvoke.unexpectedError', 'The request failed.'),
            };
            this.changeEmitter.fire(this.result);
            throw error;
        } finally {
            this.activeRequest = undefined;
        }
    }

    public dispose(): void {
        this.disposed = true;
        this.cancel();
        this.started = undefined;
        this.result = undefined;
        this.changeEmitter.dispose();
    }
}
