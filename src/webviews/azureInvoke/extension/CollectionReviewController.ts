/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import * as vscode from 'vscode';
import { localize } from '../../../localize';
import { copyInvocation, validateInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { type CollectionReviewConfiguration, type CollectionReviewResponse, type CollectionReviewState, type InvocationCandidate, type InvocationSelection } from '../shared/collectionReview';
import { type HttpInvocation } from '../shared/httpRequest';
import { HttpInvocationRunner } from './HttpInvocationRunner';
import { getDependencyLabels } from './dependencyLabels';

export class CollectionReviewController extends WebviewController<CollectionReviewConfiguration> {
    private state: CollectionReviewState;
    private statuses: { id: string; text: string }[] = [];
    private confirming = false;
    private errorMessage: string | undefined;
    private selections: InvocationSelection[] = [];
    private readonly previews: HttpInvocationRunner;
    private readonly previewInputs = new Map<string, HttpInvocation>();

    public constructor(
        context: vscode.ExtensionContext,
        public readonly reviewId: string,
        candidates: InvocationCandidate[] | undefined,
        private readonly confirmSelection: (selections: unknown) => InvocationSelection[],
        private readonly cancelReview: () => void,
        private readonly requestChanges: (selections: unknown) => InvocationSelection[],
        private readonly continueChanges: () => Promise<void>,
    ) {
        super(context, localize('azureInvoke.collectionReview', 'Azure Invoke: Review collection'), 'azureInvokeCollectionReview', {
            candidates: candidates ?? [],
            loading: !candidates,
            version: 0,
            labels: {
                title: localize('azureInvoke.reviewTitle', 'Build your test collection'),
                introduction: localize('azureInvoke.reviewIntroduction', 'Review one request template per HTTP method and route. Expand a row to fill values, try the request, or leave feedback. Uncheck templates you do not want to keep.'),
                selectAll: localize('azureInvoke.selectAllHttp', 'Select all HTTP cases'),
                comment: localize('azureInvoke.reviewComment', 'Feedback for Copilot'),
                unsupported: localize('azureInvoke.unsupportedTrigger', 'Not yet supported'),
                confirm: localize('azureInvoke.confirmCollection', 'Confirm'),
                requestChanges: localize('azureInvoke.requestChanges', 'Request changes'),
                cancel: localize('azureInvoke.cancelReview', 'Cancel'),
                selected: localize('azureInvoke.selectedCases', 'Selected'),
                approved: localize('azureInvoke.reviewApproved', 'Confirmed. Your selected invocations are saved in the Azure Invoke tree. Ask Copilot to run them when you are ready.'),
                cancelled: localize('azureInvoke.reviewCancelled', 'Review cancelled. No additional requests will be drafted from this proposal.'),
                selectCases: localize('azureInvoke.selectCases', 'Select at least one HTTP case to continue.'),
                loadingTitle: localize('azureInvoke.loadingReview', 'Discovering endpoints'),
                loadingMessage: localize('azureInvoke.loadingReviewMessage', 'Copilot is scanning your workspace for request templates. Answer any questions in chat while it prepares your review.'),
                revisingTitle: localize('azureInvoke.revisingReview', 'Updating your collection'),
                revisingMessage: localize('azureInvoke.revisingReviewMessage', 'Copilot is applying your feedback. Answer any questions in chat while it updates the review. Requesting changes does not save or send requests.'),
                method: localize('azureInvoke.method', 'Method'),
                endpoint: localize('azureInvoke.endpoint', 'Endpoint'),
                trigger: localize('azureInvoke.trigger', 'Trigger'),
                authentication: localize('azureInvoke.authentication', 'Authentication'),
                anonymous: localize('azureInvoke.authAnonymous', 'Anonymous'),
                required: localize('azureInvoke.authRequired', 'Authentication required'),
                unknown: localize('azureInvoke.authUnknown', 'Authentication unknown'),
                headers: localize('azureInvoke.headers', 'Headers'),
                query: localize('azureInvoke.params', 'Query parameters'),
                body: localize('azureInvoke.body', 'Body'),
                none: localize('azureInvoke.none', 'None'),
                send: localize('azureInvoke.send', 'Send'),
                sending: localize('azureInvoke.sending', 'Sending...'),
                response: localize('azureInvoke.response', 'Response'),
                previewHint: localize('azureInvoke.previewHint', 'Send makes a real HTTP request and can change data. Disabled parameters are not sent. {{guid}} generates one UUID per request run. Confirm saves your current fields. Manual values are not included in the review sent to Copilot.'),
                name: localize('azureInvoke.name', 'Name'),
                value: localize('azureInvoke.value', 'Value'),
                enabled: localize('azureInvoke.enabled', 'Enabled'),
                add: localize('azureInvoke.addRow', 'Add row'),
                remove: localize('azureInvoke.removeRow', 'Remove row'),
                dependencies: getDependencyLabels(),
            },
        }, vscode.ViewColumn.Active, vscode.Uri.joinPath(context.extensionUri, 'resources', 'azure-functions.svg'), {
            distDir: path.join(context.extensionPath, 'dist', 'azureInvoke'),
            scriptFileName: 'collectionReview.js',
            styleFileName: 'collectionReview.css',
        });
        this.previews = new HttpInvocationRunner(id => {
            const candidate = this.configuration.candidates.find(candidate => candidate.id === id);
            return candidate?.trigger === 'http' ? this.previewInputs.get(id) ?? candidate : undefined;
        }, (id, message) => {
            const version = this.configuration.version;
            void callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.previewProgress', async context => {
                context.telemetry.suppressAll = true;
                context.errorHandling.suppressDisplay = true;
                await this.postMessage({ command: 'preview', version, id, message });
            });
        });
        this.registerDisposable(this.previews);
        this.state = candidates ? 'reviewing' : 'loading';
        this.registerDisposable(this.onDisposed(() => {
            if (this.state !== 'approved') {
                this.cancelReview();
            }
        }));
        this.registerDisposable(this.panel.webview.onDidReceiveMessage((message: unknown) => {
            void callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.reviewCollection', async context => {
                context.telemetry.maskEntireErrorMessage = true;
                context.errorHandling.suppressDisplay = true;
                const command = message && typeof message === 'object' && 'command' in message ? message.command : undefined;
                let requestedVersion: number | undefined;
                try {
                    if (command === 'ready') {
                        context.telemetry.suppressAll = true;
                        await this.postState(true);
                        for (const preview of this.previews.messages) {
                            await this.postMessage({ command: 'preview', version: this.configuration.version, ...preview });
                        }
                    } else if (command === 'previewRequest' && message && typeof message === 'object' && 'id' in message && 'request' in message) {
                        await this.previewRequest(context, message.id, message.request, 'runDependencies' in message && message.runDependencies === true, 'requests' in message ? message.requests : undefined);
                    } else if (command === 'cancelPreview' && message && typeof message === 'object' && 'id' in message && typeof message.id === 'string') {
                        if (this.state !== 'reviewing' || !this.configuration.candidates.some(candidate => candidate.id === message.id && candidate.trigger === 'http')) {
                            throw new Error(localize('azureInvoke.previewUnavailable', 'Only HTTP templates in the active review can be previewed.'));
                        }
                        this.previews.cancel(message.id);
                    } else if (command === 'cancelCollection') {
                        if (this.confirming || this.state === 'approved') {
                            return;
                        }
                        this.cancelReview();
                        this.state = 'cancelled';
                        this.errorMessage = undefined;
                        this.previews.cancel();
                        await this.postState();
                    } else if (command === 'requestChanges' && message && typeof message === 'object' && 'selections' in message) {
                        if (this.state !== 'reviewing' || this.confirming) {
                            return;
                        }
                        if (this.previews.running) {
                            throw new Error(localize('azureInvoke.previewRunning', 'Wait for running previews to finish or cancel them before confirming.'));
                        }
                        this.selections = this.requestChanges(message.selections);
                        requestedVersion = this.configuration.version;
                        this.errorMessage = undefined;
                        this.state = 'revising';
                        await this.postState();
                        await this.continueChanges();
                    } else if (command === 'confirmCollection' && message && typeof message === 'object' && 'selections' in message) {
                        if (this.confirming || (this.state !== 'reviewing' && this.state !== 'approved')) {
                            return;
                        }
                        this.confirming = true;
                        try {
                            this.errorMessage = undefined;
                            if (this.previews.running) {
                                throw new Error(localize('azureInvoke.previewRunning', 'Wait for running previews to finish or cancel them before confirming.'));
                            }
                            this.selections = this.confirmSelection(message.selections);
                            this.statuses = this.selections.map(selection => ({ id: selection.id, text: localize('azureInvoke.ready', 'Ready') }));
                            this.state = 'approved';
                            await this.postState();
                        } finally {
                            this.confirming = false;
                        }
                    } else {
                        throw new Error(localize('azureInvoke.invalidReviewMessage', 'Invalid collection review action.'));
                    }
                } catch (error) {
                    if (requestedVersion !== undefined && (this.state !== 'revising' || requestedVersion !== this.configuration.version)) {
                        context.telemetry.properties.failureStage = 'supersededRevision';
                        return;
                    }
                    if (requestedVersion !== undefined) {
                        this.state = 'reviewing';
                    }
                    const errorMessage = error instanceof Error ? error.message : localize('azureInvoke.reviewFailed', 'Could not confirm the collection. Try again.');
                    if (command === 'previewRequest' && message && typeof message === 'object' && 'id' in message && typeof message.id === 'string') {
                        await this.postMessage({ command: 'preview', version: this.configuration.version, id: message.id, message: { command: 'requestError', message: errorMessage, cancelled: isUserCancelledError(error) } });
                    } else {
                        this.errorMessage = errorMessage;
                        await this.postState();
                    }
                    throw error;
                }
            });
        }));
    }

    public async setCandidates(candidates: InvocationCandidate[], selections?: InvocationSelection[]): Promise<void> {
        this.configuration.version++;
        this.configuration.candidates = candidates;
        this.configuration.loading = false;
        this.configuration.selections = selections;
        this.selections = selections ?? [];
        this.statuses = [];
        this.previews.clear();
        this.previewInputs.clear();
        this.state = 'reviewing';
        this.errorMessage = undefined;
        await this.postState(true);
    }

    public async failLoading(cancelled: boolean): Promise<void> {
        if (this.state !== 'loading') {
            return;
        }
        this.state = cancelled ? 'cancelled' : 'failed';
        this.cancelReview();
        this.errorMessage = cancelled ? undefined : localize('azureInvoke.discoveryFailed', 'Could not prepare the review. Check Copilot Chat, then select Author Collection with AI to try again.');
        await this.postState();
    }

    private async previewRequest(context: IActionContext, id: unknown, request: unknown, runDependencies: boolean, requests: unknown): Promise<void> {
        const candidate = this.configuration.candidates.find(candidate => candidate.id === id);
        if (this.isDisposed || this.state !== 'reviewing' || !candidate || candidate.trigger !== 'http') {
            throw new Error(localize('azureInvoke.previewUnavailable', 'Only HTTP templates in the active review can be previewed.'));
        }
        const snapshot: unknown = { id: candidate.id, name: candidate.name, request };
        validateInvocation(snapshot);
        const snapshots: HttpInvocation[] = [];
        if (requests !== undefined) {
            if (!Array.isArray(requests) || requests.length > this.configuration.candidates.length) {
                throw new Error(localize('azureInvoke.invalidReviewMessage', 'Invalid collection review action.'));
            }
            for (const entry of requests) {
                const source = entry && typeof entry === 'object' && 'id' in entry ?
                    this.configuration.candidates.find(candidate => candidate.id === entry.id && candidate.trigger === 'http') : undefined;
                const input: unknown = { id: source?.id, name: source?.name, request: entry && typeof entry === 'object' && 'request' in entry ? entry.request : undefined };
                validateInvocation(input);
                if (snapshots.some(snapshot => snapshot.id === input.id)) {
                    throw new Error(localize('azureInvoke.invalidReviewMessage', 'Invalid collection review action.'));
                }
                snapshots.push(copyInvocation(input));
            }
        }
        for (const input of snapshots) {
            this.previewInputs.set(input.id, input);
        }
        this.previewInputs.set(candidate.id, copyInvocation(snapshot));
        await this.previews.send(context, snapshot, { runDependencies });
    }

    public async updateStatuses(statuses: { id: string; text: string }[]): Promise<void> {
        this.statuses = statuses;
        await this.postState();
    }

    private async postState(proposal = false): Promise<void> {
        const snapshot = { version: this.configuration.version, state: this.state, selections: this.selections, statuses: this.statuses, error: this.errorMessage };
        await this.postMessage(proposal ?
            { ...snapshot, command: 'proposal', candidates: this.configuration.candidates } :
            { ...snapshot, command: 'state' });
    }

    private async postMessage(message: CollectionReviewResponse): Promise<void> {
        if (!this.isDisposed) {
            await this.panel.webview.postMessage(message);
        }
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        const encoded = encodeURIComponent(JSON.stringify(this.configuration));
        return super.getDocumentTemplate(webview)
            .replace(encoded, encoded.replace(/'/g, '%27'))
            .replace('<div id="root"></div>', '<div id="root"><div class="review-loading" role="status"><span class="spinner" aria-hidden="true"></span><span>Azure Invoke</span></div></div>');
    }
}
