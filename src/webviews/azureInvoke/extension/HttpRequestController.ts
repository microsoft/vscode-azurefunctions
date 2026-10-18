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
import { isHttpRequest, isInvocationName, type HttpInvocation, type HttpRequest, type HttpRequestViewConfiguration, type HttpResponse, type HttpResponseMessage, type InvocationSource } from '../shared/httpRequest';
import { type InvocationRunOptions } from './HttpInvocationRunner';
import { HttpRequestRunner } from './HttpRequestRunner';
import { getDependencyLabels } from './dependencyLabels';

export class HttpRequestController extends WebviewController<HttpRequestViewConfiguration> {
    private readonly runner: HttpRequestRunner;
    private name: string;
    private webviewReady = false;
    private debugging = false;

    public constructor(
        context: vscode.ExtensionContext,
        private readonly invocation: HttpInvocation,
        saved: boolean,
        private readonly saveInvocation: (invocation: HttpInvocation) => void,
        private readonly execution: {
            runner?: HttpRequestRunner;
            sources?: InvocationSource[];
            execute?: (context: IActionContext, request: HttpRequest, options: InvocationRunOptions) => Promise<HttpResponse>;
            debug?: (context: IActionContext) => Promise<void>;
        } = {},
    ) {
        super(context, invocation.name, 'azureInvokeHttpRequest', {
            name: invocation.name,
            request: invocation.request,
            saved,
            sources: execution.sources,
            debugAvailable: !!execution.debug,
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
                functionKeyHint: localize('azureInvoke.functionKeyHint', 'For Azure Functions endpoints that require a function key, add it as an x-functions-key header.'),
                rename: localize('azureInvoke.rename', 'Rename invocation'),
                save: localize('azureInvoke.save', 'Save'),
                saving: localize('azureInvoke.saving', 'Saving...'),
                saved: localize('azureInvoke.saved', 'Saved for this session'),
                unsaved: localize('azureInvoke.unsaved', 'Unsaved changes'),
                savedInvocationHint: localize('azureInvoke.savedInvocationHint', 'Using the saved invocation. Unsaved editor changes are not included.'),
                debug: localize('azureInvoke.debugWithCopilot', 'Debug with Copilot'),
                debugHint: localize('azureInvoke.debugHint', 'Share this localhost response with Copilot to choose breakpoints and replay the captured request in your already running VS Code debugger. Responses may contain sensitive data. Unsaved editor changes are not used.'),
                enabled: localize('azureInvoke.enabled', 'Enabled'),
                dependencies: getDependencyLabels(),
            },
        }, vscode.ViewColumn.Active, vscode.Uri.joinPath(context.extensionUri, 'resources', 'azure-functions.svg'), {
            distDir: path.join(context.extensionPath, 'dist', 'azureInvoke'),
            scriptFileName: 'views.js',
            styleFileName: 'views.css',
        });
        this.name = invocation.name;
        this.runner = execution.runner ?? new HttpRequestRunner();

        this.registerDisposable(this.onDisposed(() => {
            this.runner.cancel();
            if (!execution.runner) {
                this.runner.dispose();
            }
        }));
        this.registerDisposable(this.runner.onDidChange(message => {
            if (this.webviewReady) {
                void callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.updateResponse', async context => {
                    context.telemetry.suppressAll = true;
                    context.errorHandling.suppressDisplay = true;
                    await this.postMessage(message);
                });
            }
        }));
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
                    await this.postMessage({ command: 'sources', sources: this.configuration.sources ?? [] });
                    await Promise.all(this.runner.messages.map(message => this.postMessage(message)));
                    return;
                }
                if (command === 'abortRequest') {
                    this.runner.cancel();
                    return;
                }
                if (command === 'debugRequest') {
                    try {
                        if (!this.execution.debug || this.debugging) {
                            throw new Error(localize('azureInvoke.debugUnavailable', 'Debugging is unavailable or already opening. Open a saved invocation and try again.'));
                        }
                        this.debugging = true;
                        await this.postMessage({ command: 'debugState', busy: true });
                        await this.execution.debug(actionContext);
                        await this.postMessage({ command: 'debugState', busy: false, message: localize('azureInvoke.debugOpened', 'Opened Copilot Chat to choose breakpoints and replay the captured request. No application code or request definitions have changed.') });
                    } catch (error) {
                        await this.postMessage({ command: 'debugState', busy: false, error: this.getErrorMessage(error) });
                        throw error;
                    } finally {
                        this.debugging = false;
                    }
                    return;
                }
                if (command === 'sendRequest') {
                    const request = message && typeof message === 'object' && 'request' in message ? message.request : undefined;
                    const previous = this.runner.messages.at(-1);
                    try {
                        await this.sendRequest(actionContext, request, { runDependencies: !!(message && typeof message === 'object' && 'runDependencies' in message && message.runDependencies === true) });
                    } catch (error) {
                        if (!this.runner.running && this.runner.messages.at(-1) === previous) {
                            await this.postMessage({ command: 'requestError', message: this.getErrorMessage(error), cancelled: isUserCancelledError(error) });
                        }
                        throw error;
                    }
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
                    const snapshot = { ...this.invocation, name: this.name, request: message.request };
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
        options: InvocationRunOptions = {},
    ): Promise<HttpResponse> {
        if (this.isDisposed) {
            throw new Error(localize('azureInvoke.editorClosed', 'The invocation editor is closed. Reopen the invocation and try again.'));
        }
        if (!isHttpRequest(request)) {
            throw new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
        }
        return this.execution.execute ? await this.execution.execute(context, request, options) : await this.runner.sendRequest(context, request, options);
    }

    public updateSources(sources: InvocationSource[]): void {
        if (JSON.stringify(this.configuration.sources) !== JSON.stringify(sources)) {
            this.configuration.sources = sources;
            if (this.webviewReady) {
                void callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.requestSources', async context => {
                    context.telemetry.suppressAll = true;
                    context.errorHandling.suppressDisplay = true;
                    await this.postMessage({ command: 'sources', sources });
                });
            }
        }
    }

    private getErrorMessage(error: unknown): string {
        return isUserCancelledError(error) ? localize('azureInvoke.cancelled', 'Request cancelled.') :
            error instanceof Error ? error.message : localize('azureInvoke.unexpectedError', 'The request failed.');
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
