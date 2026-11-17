/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import * as vscode from 'vscode';
import { type InvocationRunOptions } from '../../../azureInvoke/ChainInvocationRunner';
import { InvocationRunner } from '../../../azureInvoke/InvocationRunner';
import { validateInvocation } from '../../../azureInvoke/httpInvocation';
import { localize } from '../../../localize';
import { isHttpRequest, isInvocationName, type HttpInvocation, type HttpRequest, type HttpResponse } from '../../../azureInvoke/model';
import { type HttpRequestViewConfiguration, type HttpResponseMessage, type InvocationSource } from '../shared/invocationEditorProtocol';
import { getHttpRequestViewLabels } from './httpRequestLabels';

interface HttpRequestExecution {
    runner?: InvocationRunner;
    sources?: InvocationSource[];
    execute?: (context: IActionContext, request: HttpRequest, options: InvocationRunOptions) => Promise<HttpResponse>;
}

/** One invocation editor tab. Saves and sends through callbacks, so it does not depend on the collection or runners. */
export class InvocationEditor extends WebviewController<HttpRequestViewConfiguration> {
    private readonly runner: InvocationRunner;
    private name: string;
    private webviewReady = false;

    public constructor(
        context: vscode.ExtensionContext,
        private readonly invocation: HttpInvocation,
        saved: boolean,
        private readonly saveInvocation: (invocation: HttpInvocation) => void,
        private readonly execution: HttpRequestExecution = {},
    ) {
        super(context, invocation.name, 'azureInvokeHttpRequest', {
            name: invocation.name,
            request: invocation.request,
            saved,
            sources: execution.sources,
            labels: getHttpRequestViewLabels(),
        }, vscode.ViewColumn.Active, vscode.Uri.joinPath(context.extensionUri, 'resources', 'azure-functions.svg'), {
            distDir: path.join(context.extensionPath, 'dist', 'azureInvoke'),
            scriptFileName: 'views.js',
            styleFileName: 'views.css',
        });
        this.name = invocation.name;
        this.runner = execution.runner ?? new InvocationRunner();

        this.registerDisposable(this.onDisposed(() => {
            this.runner.cancel();
            if (!execution.runner) {
                this.runner.dispose();
            }
        }));
        this.registerDisposable(this.runner.onDidChange(message => {
            if (this.webviewReady) {
                void this.postMessageQuietly('azureFunctions.azureInvoke.updateResponse', message);
            }
        }));
        this.registerDisposable(this.panel.webview.onDidReceiveMessage((message: unknown) => void this.handleMessage(message)));
    }

    public async sendRequest(context: IActionContext, request: unknown, options: InvocationRunOptions = {}): Promise<HttpResponse> {
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
                void this.postMessageQuietly('azureFunctions.azureInvoke.requestSources', { command: 'sources', sources });
            }
        }
    }

    private async handleMessage(message: unknown): Promise<void> {
        const command = message && typeof message === 'object' && 'command' in message ? message.command : undefined;
        const callbackId = command === 'renameRequest' ? 'azureFunctions.azureInvoke.rename' :
            command === 'saveRequest' ? 'azureFunctions.azureInvoke.save' : 'azureFunctions.azureInvoke.request';
        await callWithTelemetryAndErrorHandling(callbackId, async (context: IActionContext) => {
            // Rename prompts through VS Code; every other failure is shown inside the editor.
            context.errorHandling.suppressDisplay = command !== 'renameRequest';
            switch (command) {
                case 'ready':
                    return await this.onReady(context);
                case 'abortRequest':
                    return this.runner.cancel();
                case 'sendRequest':
                    return await this.onSendRequest(context, message);
                case 'saveRequest':
                    return await this.onSaveRequest(message);
                case 'renameRequest':
                    return await this.rename(context);
                default: {
                    const error = new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
                    await this.postMessage({ command: 'requestError', message: error.message });
                    throw error;
                }
            }
        });
    }

    private async onReady(context: IActionContext): Promise<void> {
        context.telemetry.suppressAll = true;
        this.webviewReady = true;
        await this.postMessage({ command: 'sources', sources: this.configuration.sources ?? [] });
        await Promise.all(this.runner.messages.map(message => this.postMessage(message)));
    }

    private async onSendRequest(context: IActionContext, message: unknown): Promise<void> {
        const request = message && typeof message === 'object' && 'request' in message ? message.request : undefined;
        const runDependencies = !!message && typeof message === 'object' && 'runDependencies' in message && message.runDependencies === true;
        const previous = this.runner.messages.at(-1);
        try {
            await this.sendRequest(context, request, { runDependencies });
        } catch (error) {
            // The runner already reported failures that happened after the request started.
            if (!this.runner.running && this.runner.messages.at(-1) === previous) {
                await this.postMessage({ command: 'requestError', message: this.getErrorMessage(error), cancelled: isUserCancelledError(error) });
            }
            throw error;
        }
    }

    private async onSaveRequest(message: unknown): Promise<void> {
        try {
            if (!message || typeof message !== 'object' || !('request' in message)) {
                throw new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
            }
            const snapshot = { ...this.invocation, name: this.name, request: message.request };
            validateInvocation(snapshot);
            this.saveInvocation(snapshot);
            await this.postMessage({ command: 'requestSaved' });
        } catch (error) {
            await this.postMessage({ command: 'saveError', message: this.getErrorMessage(error) });
            throw error;
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

    private getErrorMessage(error: unknown): string {
        return isUserCancelledError(error) ? localize('azureInvoke.cancelled', 'Request cancelled.') :
            error instanceof Error ? error.message : localize('azureInvoke.unexpectedError', 'The request failed.');
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        const encoded = encodeURIComponent(JSON.stringify(this.configuration));
        // encodeURIComponent leaves apostrophes unescaped inside the shared template's script string.
        return super.getDocumentTemplate(webview).replace(encoded, encoded.replace(/'/g, '%27'));
    }

    private async postMessageQuietly(callbackId: string, message: HttpResponseMessage): Promise<void> {
        await callWithTelemetryAndErrorHandling(callbackId, async context => {
            context.telemetry.suppressAll = true;
            context.errorHandling.suppressDisplay = true;
            await this.postMessage(message);
        });
    }

    private async postMessage(message: HttpResponseMessage): Promise<void> {
        if (!this.isDisposed) {
            await this.panel.webview.postMessage(message);
        }
    }
}
