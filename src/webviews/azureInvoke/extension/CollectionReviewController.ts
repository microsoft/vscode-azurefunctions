/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController } from '@microsoft/vscode-azext-webview';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import * as vscode from 'vscode';
import { localize } from '../../../localize';
import { copyInvocation, planInvocationChain, validateInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { type CollectionReviewConfiguration, type CollectionReviewResponse, type CollectionReviewState, type InvocationCandidate, type InvocationDiagnosisCase, type InvocationPreviewDiagnostic, type InvocationSelection } from '../shared/collectionReview';
import { getRequestDependencies, type HttpInvocation, type HttpRequestStateMessage } from '../shared/httpRequest';
import { HttpInvocationRunner } from './HttpInvocationRunner';
import { InvocationBlockedError } from './HttpRequestRunner';
import { getDependencyLabels } from './dependencyLabels';
import { isLocalHttpRequest } from './requestBindings';
import { getShareableHttpResponse } from './sendHttpRequest';
import { copyBlobDefinition, type BlobFixtureFile, type BlobUploadDefinition, type BlobUploadRequest } from '../shared/blobInvocation';
import { pickBlobFile } from './pickBlobFile';

interface PreviewRecord {
    invocation: HttpInvocation;
    plan?: HttpInvocation[];
    result?: HttpRequestStateMessage;
}

export class CollectionReviewController extends WebviewController<CollectionReviewConfiguration> {
    private state: CollectionReviewState;
    private statuses: { id: string; text: string }[] = [];
    private confirming = false;
    private errorMessage: string | undefined;
    private selections: InvocationSelection[] = [];
    private readonly previews: HttpInvocationRunner;
    private readonly previewInputs = new Map<string, HttpInvocation>();
    private readonly previewRecords = new Map<string, PreviewRecord>();
    private diagnosis: { id: string; cases: InvocationDiagnosisCase[] } | undefined;
    private diagnosing = false;
    private diagnosisNotice: string | undefined;
    private readonly blobFiles = new Map<string, BlobFixtureFile>();
    private selectingBlobFile = false;

    public constructor(
        context: vscode.ExtensionContext,
        public readonly reviewId: string,
        candidates: InvocationCandidate[] | undefined,
        private readonly confirmSelection: (selections: unknown) => InvocationSelection[],
        private readonly cancelReview: () => void,
        private readonly requestChanges: (selections: unknown) => InvocationSelection[],
        private readonly continueChanges: () => Promise<void>,
        private readonly openDiagnosis: (diagnosisId: string) => Promise<void>,
        updatingSaved = false,
    ) {
        super(context, updatingSaved ? localize('azureInvoke.savedRequestReview', 'Azure Invoke: Review saved request changes') : localize('azureInvoke.collectionReview', 'Azure Invoke: Review collection'), 'azureInvokeCollectionReview', {
            candidates: candidates ?? [],
            updatingSaved,
            loading: !candidates,
            version: 0,
            labels: {
                title: updatingSaved ? localize('azureInvoke.reviewFixesTitle', 'Review saved request changes') : localize('azureInvoke.reviewTitle', 'Build your test collection'),
                introduction: updatingSaved ?
                    localize('azureInvoke.reviewFixesIntroduction', 'Expand each request to review the proposed fields. Prerequisites are included for context. Apply updates selected saved requests in place without sending them or editing application code. Uncheck requests you do not want to update. To ask for a different proposal, return to chat.') :
                    localize('azureInvoke.reviewIntroduction', 'Review HTTP requests and manual Blob and Timer invocations. Expand a row to edit values, choose a file, or leave feedback. Confirm saves selected entries without executing them.'),
                selectAll: localize('azureInvoke.selectAllInvocations', 'Select all supported invocations'),
                comment: localize('azureInvoke.reviewComment', 'Feedback for Copilot'),
                unsupported: localize('azureInvoke.unsupportedTrigger', 'Not yet supported'),
                triggers: {
                    http: localize('azureInvoke.httpTriggerDescription', 'HTTP Trigger'),
                    blob: localize('azureInvoke.blobTriggerDescription', 'Blob Trigger'),
                    timer: localize('azureInvoke.timerTriggerDescription', 'Timer Trigger'),
                    queue: localize('azureInvoke.queueTriggerDescription', 'Queue Trigger'),
                    serviceBus: localize('azureInvoke.serviceBusTriggerDescription', 'Service Bus Trigger'),
                    eventHub: localize('azureInvoke.eventHubTriggerDescription', 'Event Hub Trigger'),
                    eventGrid: localize('azureInvoke.eventGridTriggerDescription', 'Event Grid Trigger'),
                    cosmosDB: localize('azureInvoke.cosmosDBTriggerDescription', 'Cosmos DB Trigger'),
                    other: localize('azureInvoke.otherTriggerDescription', 'Other Trigger'),
                },
                blob: {
                    manualOnly: localize('azureInvoke.supportedManualOnly', 'Supported / Manual only'),
                    target: localize('azureInvoke.blobReviewTarget', 'Azurite URL'),
                    container: localize('azureInvoke.blobContainer', 'Container'),
                    blobName: localize('azureInvoke.blobName', 'Blob name'),
                    contentType: localize('azureInvoke.blobContentType', 'Content type'),
                    file: localize('azureInvoke.chooseBlobFile', 'Choose file...'),
                    noFile: localize('azureInvoke.noBlobFile', 'No file selected'),
                    hint: localize('azureInvoke.blobReviewHint', 'Choose a file of at most 5 MB. Its captured contents stay private. Confirm saves this manual fixture without uploading it. Later uploads overwrite blobs with the same name.'),
                    fileRequired: localize('azureInvoke.blobReviewFileRequired', 'Choose a file for each selected Blob fixture, or uncheck it before confirming.'),
                },
                timer: {
                    hostUrl: localize('azureInvoke.timerHostUrl', 'Functions host URL'),
                    functionName: localize('azureInvoke.timerFunctionName', 'Function name'),
                    schedule: localize('azureInvoke.timerSchedule', 'Configured schedule'),
                },
                confirm: updatingSaved ? localize('azureInvoke.applyRequestChanges', 'Apply request changes') : localize('azureInvoke.confirmCollection', 'Confirm'),
                requestChanges: localize('azureInvoke.requestChanges', 'Request changes'),
                diagnoseRequest: localize('azureInvoke.diagnoseRequest', 'Diagnose with Copilot'),
                diagnoseFailed: localize('azureInvoke.diagnoseFailed', 'Diagnose failed requests'),
                diagnosisHint: localize('azureInvoke.diagnosisHint', 'Diagnosis shares failed localhost responses with Copilot. Responses can contain sensitive data. Remote response bodies and private request edits are not shared directly. Diagnosis does not change drafts, edit application code, or send requests.'),
                cancel: localize('azureInvoke.cancelReview', 'Cancel'),
                selected: localize('azureInvoke.selectedCases', 'Selected'),
                approved: updatingSaved ?
                    localize('azureInvoke.requestChangesApplied', 'Applied the selected request changes. Existing request tabs keep their fields; close and reopen a tab to load the updated saved request. Ask Copilot to rerun with approval when ready.') :
                    localize('azureInvoke.reviewApproved', 'Confirmed. Your selected invocations are saved in the Azure Invoke tree. Ask Copilot to run HTTP requests when ready. Blob and Timer invocations remain manual.'),
                cancelled: updatingSaved ? localize('azureInvoke.requestChangesCancelled', 'Review cancelled. Saved requests are unchanged.') : localize('azureInvoke.reviewCancelled', 'Review cancelled. No additional requests will be drafted from this proposal.'),
                selectCases: localize('azureInvoke.selectInvocations', 'Select at least one supported invocation to continue.'),
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
                previewHint: updatingSaved ?
                    localize('azureInvoke.savedPreviewHint', 'Send makes a real HTTP request and can change data. Apply request changes saves selected fields in the existing entries without sending them. Private saved and manual values stay in this review, not the review data returned to Copilot.') :
                    localize('azureInvoke.previewHint', 'Send makes a real HTTP request and can change data. Disabled parameters are not sent. {{guid}} generates one UUID per request run. Confirm saves your current fields. Manual values are not included in the review sent to Copilot.'),
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
            const record = this.previewRecords.get(id);
            if (record) {
                record.result = message;
            }
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
            this.blobFiles.clear();
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
                let diagnosisVersion: number | undefined;
                try {
                    if (command === 'ready') {
                        context.telemetry.suppressAll = true;
                        await this.postState(true);
                        for (const preview of this.previews.messages) {
                            await this.postMessage({ command: 'preview', version: this.configuration.version, ...preview });
                        }
                    } else if (command === 'selectBlobFile' && message && typeof message === 'object' && 'id' in message && typeof message.id === 'string') {
                        await this.selectBlobFile(context, message.id);
                    } else if (command === 'previewRequest' && message && typeof message === 'object' && 'id' in message && 'request' in message) {
                        await this.previewRequest(context, message.id, message.request, 'runDependencies' in message && message.runDependencies === true, 'requests' in message ? message.requests : undefined);
                    } else if (command === 'diagnoseRequests' && message && typeof message === 'object' && 'ids' in message && 'requests' in message) {
                        if (this.configuration.updatingSaved || this.state !== 'reviewing' || this.confirming || this.diagnosing || this.previews.running) {
                            throw new Error(localize('azureInvoke.diagnosisUnavailable', 'Wait for previews to finish and diagnose failures in the active review.'));
                        }
                        const cases = this.captureDiagnostics(message.ids, message.requests);
                        const diagnosisId = randomUUID();
                        this.diagnosis = { id: diagnosisId, cases };
                        diagnosisVersion = this.configuration.version;
                        this.diagnosing = true;
                        this.errorMessage = undefined;
                        this.diagnosisNotice = undefined;
                        try {
                            await this.postState();
                            await this.openDiagnosis(diagnosisId);
                            if (this.state === 'reviewing' && diagnosisVersion === this.configuration.version) {
                                this.diagnosisNotice = localize('azureInvoke.diagnosisOpened', 'Opened Copilot Chat to diagnose the failure. Drafts and application code are unchanged. Use Request changes if you decide to correct a request draft.');
                            }
                        } finally {
                            this.diagnosing = false;
                        }
                        await this.postState();
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
                        this.diagnosis = undefined;
                        this.state = 'cancelled';
                        this.errorMessage = undefined;
                        this.previews.cancel();
                        await this.postState();
                    } else if (command === 'requestChanges' && message && typeof message === 'object' && 'selections' in message) {
                        if (this.configuration.updatingSaved) {
                            throw new Error(localize('azureInvoke.reviseSavedChanges', 'Ask Copilot in chat for another saved-request proposal. No changes have been applied.'));
                        }
                        if (this.state !== 'reviewing' || this.confirming || this.diagnosing) {
                            return;
                        }
                        if (this.previews.running || this.selectingBlobFile) {
                            throw new Error(localize('azureInvoke.previewRunning', 'Wait for running previews to finish or cancel them before confirming.'));
                        }
                        this.selections = this.requestChanges(message.selections);
                        this.diagnosis = undefined;
                        this.diagnosisNotice = undefined;
                        requestedVersion = this.configuration.version;
                        this.errorMessage = undefined;
                        this.state = 'revising';
                        await this.postState();
                        await this.continueChanges();
                    } else if (command === 'confirmCollection' && message && typeof message === 'object' && 'selections' in message) {
                        if (this.confirming || this.diagnosing || (this.state !== 'reviewing' && this.state !== 'approved')) {
                            return;
                        }
                        this.confirming = true;
                        try {
                            this.errorMessage = undefined;
                            if (this.previews.running || this.selectingBlobFile) {
                                throw new Error(localize('azureInvoke.previewRunning', 'Wait for running previews to finish or cancel them before confirming.'));
                            }
                            this.selections = this.confirmSelection(message.selections);
                            this.diagnosis = undefined;
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
                    if (diagnosisVersion !== undefined) {
                        this.diagnosis = undefined;
                        if (this.state !== 'reviewing' || diagnosisVersion !== this.configuration.version) {
                            context.telemetry.properties.failureStage = 'supersededDiagnosis';
                            return;
                        }
                    }
                    if (requestedVersion !== undefined && (this.state !== 'revising' || requestedVersion !== this.configuration.version)) {
                        context.telemetry.properties.failureStage = 'supersededRevision';
                        return;
                    }
                    if (requestedVersion !== undefined) {
                        this.state = 'reviewing';
                    }
                    const errorMessage = error instanceof Error ? error.message : localize('azureInvoke.reviewFailed', 'Could not confirm the collection. Try again.');
                    if (command === 'previewRequest' && message && typeof message === 'object' && 'id' in message && typeof message.id === 'string') {
                        const result = { command: 'requestError' as const, message: errorMessage, cancelled: isUserCancelledError(error), ...(error instanceof InvocationBlockedError ? { blocked: true } : {}) };
                        const record = this.previewRecords.get(message.id);
                        if (record && !this.previews.isRunning(message.id)) {
                            record.result = result;
                        }
                        await this.postMessage({ command: 'preview', version: this.configuration.version, id: message.id, message: result });
                    } else if (command !== 'selectBlobFile' || !isUserCancelledError(error)) {
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
        for (const id of this.blobFiles.keys()) {
            if (!candidates.some(candidate => candidate.id === id && candidate.trigger === 'blob')) {
                this.blobFiles.delete(id);
            }
        }
        this.configuration.loading = false;
        this.configuration.selections = selections;
        this.selections = selections ?? [];
        this.statuses = [];
        this.previews.clear();
        this.previewInputs.clear();
        this.previewRecords.clear();
        this.diagnosis = undefined;
        this.diagnosisNotice = undefined;
        this.state = 'reviewing';
        this.errorMessage = undefined;
        await this.postState(true);
    }

    public hasBlobFile(id: string): boolean {
        return this.blobFiles.has(id);
    }

    public getBlobRequest(id: string, definition: BlobUploadDefinition): BlobUploadRequest {
        const file = this.blobFiles.get(id);
        if (!file) {
            throw new Error(localize('azureInvoke.blobReviewFileRequired', 'Choose a file for each selected Blob fixture, or uncheck it before confirming.'));
        }
        return {
            ...copyBlobDefinition(definition), ...file, encoding: 'base64',
            blobName: definition.blobName || file.fileName,
        };
    }

    public async selectBlobFile(context: IActionContext, id: string, signal?: AbortSignal): Promise<void> {
        const available = (): boolean => !this.isDisposed && !this.configuration.updatingSaved &&
            this.state === 'reviewing' && !this.confirming && !this.diagnosing &&
            this.configuration.candidates.some(candidate => candidate.id === id && candidate.trigger === 'blob');
        if (!available() || this.selectingBlobFile) {
            throw new Error(localize('azureInvoke.blobReviewUnavailable', 'Choose a Blob fixture in the active collection review. Wait for any open file picker to finish.'));
        }
        const version = this.configuration.version;
        this.selectingBlobFile = true;
        this.errorMessage = undefined;
        try {
            await this.postState();
            const file = await pickBlobFile(context, signal);
            if (!available() || version !== this.configuration.version) {
                throw new Error(localize('azureInvoke.blobReviewChanged', 'The collection review changed while choosing a file. Select the file again in the current review.'));
            }
            this.blobFiles.set(id, file);
        } finally {
            this.selectingBlobFile = false;
            await this.postState();
        }
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
        if (this.isDisposed || this.state !== 'reviewing' || this.diagnosing || !candidate || candidate.trigger !== 'http') {
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
        const definitions = new Map(this.configuration.candidates.flatMap(candidate =>
            candidate.trigger === 'http' ? [[candidate.id, copyInvocation(candidate)] as const] : []));
        for (const [id, input] of this.previewInputs) {
            definitions.set(id, input);
        }
        for (const input of [...snapshots, snapshot]) {
            if (!this.previews.isRunning(input.id)) {
                definitions.set(input.id, copyInvocation(input));
            }
        }
        if (this.previews.isRunning(snapshot.id)) {
            throw new Error(localize('azureInvoke.chainBusy', 'A request in this chain is already running. Wait or cancel it before starting another run.'));
        }
        const record: PreviewRecord = { invocation: copyInvocation(snapshot) };
        this.previewRecords.set(candidate.id, record);
        this.diagnosis = undefined;
        this.diagnosisNotice = undefined;
        const plan = planInvocationChain(snapshot, id => definitions.get(id));
        if ((runDependencies ? plan : [snapshot]).some(input => this.previews.isRunning(input.id))) {
            throw new Error(localize('azureInvoke.chainBusy', 'A request in this chain is already running. Wait or cancel it before starting another run.'));
        }
        for (const [id, input] of definitions) {
            this.previewInputs.set(id, input);
        }
        record.plan = plan;
        if (runDependencies) {
            for (const input of plan.slice(0, -1)) {
                this.previewRecords.set(input.id, { invocation: input, plan: planInvocationChain(input, id => definitions.get(id)) });
            }
        }
        await this.previews.send(context, snapshot, { runDependencies });
    }

    private captureDiagnostics(ids: unknown, requests: unknown): InvocationDiagnosisCase[] {
        if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length ||
            !Array.isArray(requests) || requests.length > 100) {
            throw new Error(localize('azureInvoke.invalidDiagnosis', 'Choose failed HTTP previews to diagnose.'));
        }
        const current = new Map<string, HttpInvocation>();
        for (const entry of requests) {
            const candidate = entry && typeof entry === 'object' && 'id' in entry ?
                this.configuration.candidates.find(candidate => candidate.id === entry.id && candidate.trigger === 'http') : undefined;
            const input: unknown = { id: candidate?.id, name: candidate?.name, request: entry && typeof entry === 'object' && 'request' in entry ? entry.request : undefined };
            validateInvocation(input);
            if (current.has(input.id)) {
                throw new Error(localize('azureInvoke.invalidDiagnosis', 'Choose failed HTTP previews to diagnose.'));
            }
            current.set(input.id, copyInvocation(input));
        }
        let remainingBodyBytes = 512 * 1024;
        return ids.map((id: unknown): InvocationDiagnosisCase => {
            const candidate = this.configuration.candidates.find(candidate => candidate.id === id && candidate.trigger === 'http');
            const record = typeof id === 'string' ? this.previewRecords.get(id) : undefined;
            const result = record?.result;
            if (!candidate || candidate.trigger !== 'http' || !record || !result ||
                result.command === 'requestStarted' ||
                (result.command === 'response' ? result.response.status >= 200 && result.response.status < 300 : result.cancelled || result.blocked)) {
                throw new Error(localize('azureInvoke.invalidDiagnosis', 'Choose failed HTTP previews to diagnose.'));
            }
            for (const input of record.plan ?? [record.invocation]) {
                const latest = current.get(input.id);
                if (!latest || JSON.stringify(copyInvocation(latest).request) !== JSON.stringify(input.request)) {
                    throw new Error(localize('azureInvoke.diagnosisStalePreview', 'A request changed after its preview. Send it again before diagnosing the failure.'));
                }
            }
            let diagnostic: InvocationPreviewDiagnostic;
            if (result.command === 'response') {
                const shared = getShareableHttpResponse(result.response, !!record.plan?.every(input => isLocalHttpRequest(input.request)));
                const body = shared.body === undefined ? undefined : Buffer.from(shared.body);
                const limit = Math.min(64 * 1024, remainingBodyBytes);
                diagnostic = {
                    outcome: 'response',
                    ...shared,
                    ...(body ? { body: new StringDecoder('utf8').write(body.subarray(0, limit)), bodyTruncated: body.length > limit } : {}),
                };
                remainingBodyBytes -= Math.min(body?.length ?? 0, limit);
            } else {
                diagnostic = { outcome: 'requestError', message: result.message };
            }
            const fields = ['method', 'url', 'headers', 'query', 'body', 'bindings', 'dependsOn'] as const;
            return {
                ...candidate,
                request: copyInvocation(candidate).request,
                reviewedFields: fields.filter(field => JSON.stringify(record.invocation.request[field]) !== JSON.stringify(candidate.request[field])),
                dependencyIds: getRequestDependencies(record.invocation.request),
                diagnostic,
            };
        });
    }

    public getDiagnostics(diagnosisId: string) {
        if (this.isDisposed || this.state !== 'reviewing' || !this.diagnosis || this.diagnosis.id !== diagnosisId || this.previews.running) {
            throw new Error(localize('azureInvoke.diagnosisExpired', 'This diagnosis is no longer active. Select Diagnose with Copilot in the current review.'));
        }
        return { diagnosisId, cases: this.diagnosis.cases };
    }

    public async updateStatuses(statuses: { id: string; text: string }[]): Promise<void> {
        this.statuses = statuses;
        await this.postState();
    }

    private async postState(proposal = false): Promise<void> {
        const snapshot = {
            version: this.configuration.version, state: this.state, selections: this.selections, statuses: this.statuses, error: this.errorMessage,
            diagnosing: this.diagnosing, diagnosisNotice: this.diagnosisNotice,
            blobFiles: [...this.blobFiles].map(([id, file]) => ({ id, fileName: file.fileName })),
            selectingBlobFile: this.selectingBlobFile,
        };
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
