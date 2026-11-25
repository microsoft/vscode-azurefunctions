/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import * as vscode from 'vscode';
import { validateInvocation } from '../../../azureInvoke/httpInvocation';
import { type InvocationRunOptions } from '../../../azureInvoke/invocationRunner/InvocationRunOptions';
import { getRequestErrorMessage, InvocationRunner } from '../../../azureInvoke/invocationRunner/InvocationRunner';
import { isValidInvocationName } from '../../../azureInvoke/models/collectionSchema';
import { type HttpResponse } from '../../../azureInvoke/models/httpRunModel';
import { isHttpRequest, type HttpInvocation, type HttpRequest } from '../../../azureInvoke/models/httpSchema';
import { localize } from '../../../localize';
import { type HttpRequestViewConfiguration, type HttpResponseMessage, type InvocationSource } from '../shared/invocationEditorProtocol';
import { getHttpRequestViewLabels } from './httpRequestLabels';

/**
 * The invocation editor tab which includes a webview with the request form and the latest response.
 * The tab receives save and send as callbacks, so it never owns the collection or the chain runner.
 */
export class InvocationEditor extends WebviewController<HttpRequestViewConfiguration> {
    /** Runner whose messages this tab shows. Shared with the chain runner when the tab is managed. */
    private readonly runner: InvocationRunner;
    /** Current name, which can change through Rename before it's saved. */
    private name: string;
    /** Set once the webview says it's listening. Messages sent before then would be lost. */
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

        // Closing the tab cancels its run. A shared runner is left for the chain runner to dispose.
        this.registerDisposable(this.onDisposed(() => {
            this.runner.cancel();
            if (!execution.runner) {
                this.runner.dispose();
            }
        }));

        // Forward run updates once the webview is listening. Earlier ones are replayed in `onReady`.
        this.registerDisposable(this.runner.onDidChange(message => {
            if (this.webviewReady) {
                void this.postMessageQuietly('azureFunctions.azureInvoke.updateResponse', message);
            }
        }));

        this.registerDisposable(this.panel.webview.onDidReceiveMessage((message: unknown) => void this.handleMessage(message)));
    }

    /**
     * Sends `request` through the chain runner when the tab is managed, or through the tab's own runner otherwise.
     * Throws if the tab is closed or `request` isn't a valid HTTP request.
     */
    public async sendRequest(context: IActionContext, request: unknown, options: InvocationRunOptions = {}): Promise<HttpResponse> {
        if (this.isDisposed) {
            throw new Error(localize('azureInvoke.editorClosed', 'The invocation editor is closed. Reopen the invocation and try again.'));
        }
        if (!isHttpRequest(request)) {
            throw new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
        }

        return this.execution.execute ? await this.execution.execute(context, request, options) : await this.runner.sendRequest(context, request, options);
    }

    /**
     * Updates the invocations the Dependencies tab can link to, and tells the webview if they changed.
     */
    public updateSources(sources: InvocationSource[]): void {
        if (JSON.stringify(this.configuration.sources) !== JSON.stringify(sources)) {
            this.configuration.sources = sources;
            if (this.webviewReady) {
                void this.postMessageQuietly('azureFunctions.azureInvoke.requestSources', { command: 'sources', sources });
            }
        }
    }

    /**
     * Sends the configuration in the page's script string. Apostrophes are escaped because
     * `encodeURIComponent` leaves them as-is, and they would end that string early.
     */
    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        const encoded = encodeURIComponent(JSON.stringify(this.configuration));
        return super.getDocumentTemplate(webview).replace(encoded, encoded.replace(/'/g, '%27'));
    }

    /**
     * Routes one message from the webview, with telemetry and error handling around it.
     */
    private async handleMessage(message: unknown): Promise<void> {
        const command = message && typeof message === 'object' && 'command' in message ? message.command : undefined;

        await callWithTelemetryAndErrorHandling(getCallbackId(command), async (context: IActionContext) => {
            // Rename prompts through VS Code, so VS Code shows its errors. Every other failure is shown inside the editor.
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

    /**
     * The webview is listening: send the dependency sources, then replay the latest run.
     */
    private async onReady(context: IActionContext): Promise<void> {
        context.telemetry.suppressAll = true;
        this.webviewReady = true;
        await this.postMessage({ command: 'sources', sources: this.configuration.sources ?? [] });

        // A tool may have started or finished a run before the tab was ready to receive updates.
        await Promise.all(this.runner.messages.map(message => this.postMessage(message)));
    }

    /**
     * Sends the form's request. Reports errors the runner didn't already report.
     */
    private async onSendRequest(context: IActionContext, message: unknown): Promise<void> {
        const request = message && typeof message === 'object' && 'request' in message ? message.request : undefined;
        const runDependencies = !!message && typeof message === 'object' && 'runDependencies' in message && message.runDependencies === true;

        // Remember the runner's last message, to tell later whether this attempt ever reached the runner.
        const previous = this.runner.messages.at(-1);
        try {
            await this.sendRequest(context, request, { runDependencies });
        } catch (error) {
            // The runner already reported failures that happened after the request started.
            // If nothing new was published, the send failed before that, so report it here.
            if (!this.runner.running && this.runner.messages.at(-1) === previous) {
                await this.postMessage({ command: 'requestError', message: getRequestErrorMessage(error), cancelled: isUserCancelledError(error) });
            }
            throw error;
        }
    }

    /**
     * Saves the form's request with the current name, and tells the webview whether it worked.
     */
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
            await this.postMessage({ command: 'saveError', message: getRequestErrorMessage(error) });
            throw error;
        }
    }

    /**
     * Prompts for a new name and updates the tab title. The rename isn't saved until the next Save.
     */
    private async rename(context: IActionContext): Promise<void> {
        context.valuesToMask.push(this.name);
        const value = await context.ui.showInputBox({
            prompt: localize('azureInvoke.invocationName', 'Invocation name'),
            value: this.name,
            validateInput: name => isValidInvocationName(name) ? undefined :
                localize('azureInvoke.invalidName', 'Enter a name of 1 to 100 characters without line breaks.'),
        });
        context.valuesToMask.push(value);

        this.name = value.trim();
        this.panel.title = this.name;
        await this.postMessage({ command: 'renamed', name: this.name });
    }

    /**
     * Posts a message with telemetry and error display turned off, for routine updates the user didn't ask for.
     */
    private async postMessageQuietly(callbackId: string, message: HttpResponseMessage): Promise<void> {
        await callWithTelemetryAndErrorHandling(callbackId, async context => {
            context.telemetry.suppressAll = true;
            context.errorHandling.suppressDisplay = true;
            await this.postMessage(message);
        });
    }

    /**
     * Posts a message to the webview, unless the tab is already closed.
     */
    private async postMessage(message: HttpResponseMessage): Promise<void> {
        if (!this.isDisposed) {
            await this.panel.webview.postMessage(message);
        }
    }
}

/**
 * Returns the telemetry ID for a webview message. Rename and save get their own IDs, and everything else counts as a request.
 */
function getCallbackId(command: unknown): string {
    switch (command) {
        case 'renameRequest':
            return 'azureFunctions.azureInvoke.rename';
        case 'saveRequest':
            return 'azureFunctions.azureInvoke.save';
        default:
            return 'azureFunctions.azureInvoke.request';
    }
}

/**
 * How an editor tab saves and sends. A managed tab gets all three from the editor manager.
 */
interface HttpRequestExecution {
    /**
     * Runner shared with the chain runner, so runs started elsewhere show in this tab. If omitted, the tab owns its runner.
     */
    runner?: InvocationRunner;
    /**
     * Initial invocations the Dependencies tab can link to. Later changes arrive through `updateSources`.
     */
    sources?: InvocationSource[];
    /**
     * Sends the form's request through the chain runner. If omitted, the tab's own runner sends it.
     */
    execute?: (context: IActionContext, request: HttpRequest, options: InvocationRunOptions) => Promise<HttpResponse>;
}
