/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import * as vscode from 'vscode';
import { localize } from '../../../localize';
import { validateInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { requestUtils } from '../../../utils/requestUtils';
import { isInvocationName, type HttpInvocation, type HttpRequestStateMessage, type HttpRequestViewConfiguration, type HttpResponse, type HttpResponseMessage } from '../shared/httpRequest';
import { sendHttpRequest } from './sendHttpRequest';

export class HttpRequestController extends WebviewController<HttpRequestViewConfiguration> {
    private activeRequest: AbortController | undefined;
    private name: string;
    private webviewReady = false;
    private requestStarted: HttpRequestStateMessage | undefined;
    private requestResult: HttpRequestStateMessage | undefined;

    public constructor(
        context: vscode.ExtensionContext,
        private readonly invocation: HttpInvocation,
        saved: boolean,
        private readonly saveInvocation: (invocation: HttpInvocation) => void,
    ) {
        super(context, invocation.name, 'azureInvokeHttpRequest', {
            name: invocation.name,
            request: invocation.request,
            saved,
            labels: {
                subtitle: localize('azureInvoke.subtitle', 'HTTP trigger'),
                method: localize('azureInvoke.method', 'Method'),
                url: localize('azureInvoke.url', 'Request URL'),
                send: localize('azureInvoke.send', 'Send'),
                sending: localize('azureInvoke.sending', 'Sending...'),
                cancel: localize('azureInvoke.cancel', 'Cancel'),
                params: localize('azureInvoke.params', 'Query parameters'),
                headers: localize('azureInvoke.headers', 'Headers'),
                body: localize('azureInvoke.body', 'Body'),
                name: localize('azureInvoke.name', 'Name'),
                value: localize('azureInvoke.value', 'Value'),
                add: localize('azureInvoke.addRow', 'Add row'),
                remove: localize('azureInvoke.removeRow', 'Remove row'),
                response: localize('azureInvoke.response', 'Response'),
                responsePlaceholder: localize('azureInvoke.responsePlaceholder', 'Send a request to see the response. Redirects are shown without following them.'),
                requestBody: localize('azureInvoke.requestBody', 'Request body'),
                requestOptions: localize('azureInvoke.requestOptions', 'Request options'),
                getBodyHint: localize('azureInvoke.getBodyHint', 'GET and HEAD requests do not send a body.'),
                functionKeyHint: localize('azureInvoke.functionKeyHint', 'For protected functions, add an x-functions-key header.'),
                rename: localize('azureInvoke.rename', 'Rename invocation'),
                save: localize('azureInvoke.save', 'Save'),
                saving: localize('azureInvoke.saving', 'Saving...'),
                saved: localize('azureInvoke.saved', 'Saved for this session'),
                unsaved: localize('azureInvoke.unsaved', 'Unsaved changes'),
                savedInvocationHint: localize('azureInvoke.savedInvocationHint', 'Using the saved invocation. Unsaved editor changes are not included.'),
            },
        }, vscode.ViewColumn.Active, vscode.Uri.joinPath(context.extensionUri, 'resources', 'azure-functions.svg'), {
            distDir: path.join(context.extensionPath, 'dist', 'azureInvoke'),
            scriptFileName: 'views.js',
            styleFileName: 'views.css',
        });
        this.name = invocation.name;

        this.registerDisposable(this.onDisposed(() => this.activeRequest?.abort()));
        this.registerDisposable(this.panel.webview.onDidReceiveMessage((message: unknown) => {
            const command = message && typeof message === 'object' && 'command' in message ? message.command : undefined;
            const eventName = command === 'renameRequest' ? 'azureFunctions.azureInvoke.rename' :
                command === 'saveRequest' ? 'azureFunctions.azureInvoke.save' : 'azureFunctions.azureInvoke.request';
            void callWithTelemetryAndErrorHandling(eventName, async (actionContext: IActionContext) => {
                actionContext.telemetry.maskEntireErrorMessage = true;
                actionContext.errorHandling.suppressDisplay = command !== 'renameRequest';
                if (command === 'ready') {
                    actionContext.telemetry.suppressAll = true;
                    this.webviewReady = true;
                    await Promise.all([this.requestStarted, this.requestResult]
                        .filter(message => message !== undefined)
                        .map(message => this.postMessage(message)));
                    return;
                }
                if (command === 'abortRequest') {
                    this.activeRequest?.abort();
                    return;
                }
                if (command === 'sendRequest') {
                    const request = message && typeof message === 'object' && 'request' in message ? message.request : undefined;
                    await this.sendRequest(actionContext, request);
                    return;
                }
                try {
                    if (command === 'renameRequest') {
                        await this.rename(actionContext);
                        return;
                    }
                    if (!message || typeof message !== 'object' || !('request' in message) ||
                        command !== 'saveRequest') {
                        throw new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
                    }
                    const snapshot = { id: this.invocation.id, name: this.name, request: message.request };
                    validateInvocation(snapshot);
                    this.saveInvocation(snapshot);
                    await this.postMessage({ command: 'requestSaved' });
                } catch (error) {
                    if (command !== 'renameRequest') {
                        await this.postMessage({ command: command === 'saveRequest' ? 'saveError' : 'requestError', message: this.getErrorMessage(error) });
                    }
                    throw error;
                }
            });
        }));
    }

    public async sendRequest(
        context: IActionContext,
        request: unknown,
        options: { signal?: AbortSignal; saved?: boolean } = {},
    ): Promise<HttpResponse> {
        if (this.isDisposed) {
            throw new Error(localize('azureInvoke.editorClosed', 'The invocation editor is closed. Reopen the invocation and try again.'));
        }
        if (this.activeRequest) {
            throw new Error(localize('azureInvoke.alreadySending', 'A request is already running.'));
        }
        const abort = new AbortController();
        this.activeRequest = abort;
        const signal = options.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal;
        try {
            await this.updateRequestState({ command: 'requestStarted', saved: options.saved ?? false });
            const response = await sendHttpRequest(context, request, signal, requestUtils.getRequestTimeoutMS());
            await this.updateRequestState({ command: 'response', response });
            return response;
        } catch (error) {
            await this.updateRequestState({ command: 'requestError', message: this.getErrorMessage(error) });
            throw error;
        } finally {
            this.activeRequest = undefined;
        }
    }

    private getErrorMessage(error: unknown): string {
        return isUserCancelledError(error) ? localize('azureInvoke.cancelled', 'Request cancelled.') :
            error instanceof Error ? error.message : localize('azureInvoke.unexpectedError', 'The request failed.');
    }

    private async updateRequestState(message: HttpRequestStateMessage): Promise<void> {
        if (message.command === 'requestStarted') {
            this.requestStarted = message;
            this.requestResult = undefined;
        } else {
            this.requestResult = message;
        }
        if (this.webviewReady) {
            await this.postMessage(message);
        }
    }

    private async rename(context: IActionContext): Promise<void> {
        context.valuesToMask.push(this.name);
        const value = await context.ui.showInputBox({
            prompt: localize('azureInvoke.invocationName', 'Invocation name'),
            value: this.name,
            validateInput: name => isInvocationName(name) ? undefined :
                localize('azureInvoke.invalidName', 'Enter a name of 1 to 100 characters without line breaks.'),
        });
        this.name = value.trim();
        context.valuesToMask.push(value);
        this.panel.title = this.name;
        await this.postMessage({ command: 'renamed', name: this.name });
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        const encoded = encodeURIComponent(JSON.stringify(this.configuration));
        // encodeURIComponent leaves apostrophes unescaped inside the shared template's script string.
        return super.getDocumentTemplate(webview).replace(encoded, encoded.replace(/'/g, '%27'));
    }

    private async postMessage(message: HttpResponseMessage): Promise<void> {
        if (!this.isDisposed) {
            await this.panel.webview.postMessage(message);
        }
    }
}
