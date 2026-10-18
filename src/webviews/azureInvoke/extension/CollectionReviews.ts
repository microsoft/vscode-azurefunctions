/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { openAzureInvokeChat } from '../../../commands/azureInvoke/openAzureInvokeChat';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { copyInvocation, planInvocationChain, validateCollectionInvocation, validateInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { type BlobInvocationCandidate, type InvocationCandidate, type InvocationSelection } from '../shared/collectionReview';
import { copyBlobDefinition, isBlobInvocation, type BlobUploadDefinition, type Invocation } from '../shared/blobInvocation';
import { getRequestDependencies, type HttpInvocation, type HttpRequest } from '../shared/httpRequest';
import { CollectionReviewController } from './CollectionReviewController';

interface CollectionReview {
    id: string;
    candidates: InvocationCandidate[];
    selections?: InvocationSelection[];
    cancelled: boolean;
    drafts: Map<string, string>;
    revision: number;
    feedback?: InvocationSelection[];
    originals?: Map<string, HttpInvocation>;
}

export class CollectionReviews implements vscode.Disposable {
    private current: CollectionReview | undefined;
    private controller: CollectionReviewController | undefined;
    private readonly subscription: vscode.Disposable;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly provider: AzureInvokeTreeDataProvider,
        private readonly openChat: typeof openAzureInvokeChat = openAzureInvokeChat,
    ) {
        this.subscription = provider.onDidChangeTreeData(() => this.updateStatuses());
    }

    public async start(): Promise<CollectionReviewController> {
        const controller = this.create();
        try {
            await this.openChat(controller.reviewId);
        } catch (error) {
            await controller.failLoading(isUserCancelledError(error));
            throw error;
        }
        return controller;
    }

    public async open(candidates: InvocationCandidate[], reviewId?: string, revision?: number): Promise<CollectionReviewController> {
        if (revision !== undefined && !reviewId) {
            throw new Error(localize('azureInvoke.revisionRequiresReview', 'Provide the active review ID when updating a requested revision.'));
        }
        if (!candidates.length || candidates.length > 100 || new Set(candidates.map(candidate => candidate.id)).size !== candidates.length) {
            throw new Error(localize('azureInvoke.invalidCandidates', 'Provide 1 to 100 proposed cases with unique IDs.'));
        }
        for (const candidate of candidates) {
            if (candidate.trigger === 'http') {
                validateInvocation(candidate);
            } else if (candidate.trigger === 'blob') {
                validateBlobCandidate(candidate);
            }
        }
        const copied: InvocationCandidate[] = candidates.map(candidate => candidate.trigger === 'http' ?
            { ...candidate, request: copyInvocation(candidate).request } : candidate.trigger === 'blob' ?
                { ...candidate, request: copyBlobDefinition(candidate.request) } : { ...candidate });
        let selections: InvocationSelection[] | undefined;
        if (reviewId) {
            const review = this.current;
            if (!review || review.id !== reviewId || review.cancelled || review.selections ||
                !this.controller || this.controller.isDisposed ||
                (review.candidates.length ? !review.feedback || revision !== review.revision : revision !== undefined)) {
                throw new Error(localize('azureInvoke.reviewExpired', 'This collection review is no longer active. Propose a new collection or use the current requested revision.'));
            }
            if (review.feedback) {
                copied.push(...review.candidates.filter(candidate => candidate.trigger !== 'http' && candidate.trigger !== 'blob' && !copied.some(updated => updated.id === candidate.id)));
                if (copied.length > 100) {
                    throw new Error(localize('azureInvoke.invalidCandidates', 'Provide 1 to 100 proposed cases with unique IDs.'));
                }
                selections = copied.flatMap<InvocationSelection>(candidate => {
                    if (candidate.trigger !== 'http' && candidate.trigger !== 'blob') {
                        return [];
                    }
                    const edited = review.feedback?.find(selection => selection.id === candidate.id);
                    const original = review.candidates.find(original => original.id === candidate.id);
                    if (candidate.trigger === 'blob') {
                        const request = original?.trigger === 'blob' && edited?.blobRequest ?
                            mergeReviewedBlob(original.request, edited.blobRequest, candidate.request) : candidate.request;
                        validateBlobCandidate({ ...candidate, request });
                        return [{
                            id: candidate.id, comment: '', selected: edited?.selected ?? true,
                            blobRequest: copyBlobDefinition(request),
                        }];
                    }
                    return [{
                        id: candidate.id, comment: '', selected: edited?.selected ?? true,
                        request: original?.trigger === 'http' && edited?.request ?
                            mergeReviewedRequest(original.request, edited.request, candidate.request) : candidate.request,
                    }];
                });
            }
        }
        for (const candidate of copied) {
            if (candidate.trigger === 'http') {
                const request = selections?.find(selection => selection.id === candidate.id)?.request ?? candidate.request;
                planInvocationChain({ ...candidate, request }, id => {
                    const source = copied.find(source => source.id === id);
                    return source?.trigger === 'http' ?
                        { ...source, request: selections?.find(selection => selection.id === id)?.request ?? source.request } : undefined;
                });
            }
        }
        if (reviewId) {
            if (!this.current || !this.controller) {
                throw new Error(localize('azureInvoke.reviewExpired', 'This collection review is no longer active. Propose a new collection.'));
            }
            this.current.candidates = copied;
            this.current.feedback = undefined;
            await this.controller.setCandidates(copied, selections);
            return this.controller;
        }
        return this.create(copied);
    }

    public openChanges(changes: { invocation: HttpInvocation; request: Partial<HttpRequest>; reason: string }[]): CollectionReviewController {
        if (!changes.length || changes.length > 100 || new Set(changes.map(change => change.invocation.id)).size !== changes.length) {
            throw new Error(localize('azureInvoke.invalidRequestChanges', 'Propose changes to 1 to 100 unique saved requests.'));
        }
        const saved = new Map(this.provider.getRequests().map(invocation => [invocation.id, copyInvocation(invocation)]));
        const proposed = new Map(saved);
        for (const change of changes) {
            if (JSON.stringify(saved.get(change.invocation.id)) !== JSON.stringify(copyInvocation(change.invocation))) {
                throw new Error(localize('azureInvoke.inspectionExpired', 'The collection or its results changed. Inspect the saved request again before proposing changes.'));
            }
            proposed.set(change.invocation.id, { ...change.invocation, request: { ...change.invocation.request, ...change.request } });
        }
        const included = new Map<string, HttpInvocation>();
        for (const change of changes) {
            const invocation = proposed.get(change.invocation.id);
            if (!invocation) {
                throw new Error(localize('azureInvoke.requestNotFound', 'This invocation is no longer in the collection.'));
            }
            validateInvocation(invocation);
            for (const input of planInvocationChain(invocation, id => proposed.get(id))) {
                included.set(input.id, input);
            }
        }
        if (included.size > 100) {
            throw new Error(localize('azureInvoke.tooManyRequestChanges', 'Review fewer requests at once; proposed changes and their prerequisites must fit within 100 requests.'));
        }
        const candidates: InvocationCandidate[] = [...included.values()].map(invocation => {
            const change = changes.find(change => change.invocation.id === invocation.id);
            return {
                ...invocation, trigger: 'http', auth: 'unknown',
                group: invocation.group ?? localize('azureInvoke.requestsGroup', 'Requests'),
                description: change ?
                    localize('azureInvoke.requestChangeReason', '{0} Proposed fields: {1}.', change.reason, Object.keys(change.request).join(', ')) :
                    localize('azureInvoke.unchangedPrerequisite', 'Unchanged prerequisite included for context. Applying this review does not run it.'),
            };
        });
        const originals = new Map([...saved].filter(([id]) => included.has(id)));
        return this.create(candidates, originals);
    }

    private create(candidates?: InvocationCandidate[], originals?: Map<string, HttpInvocation>): CollectionReviewController {
        this.controller?.panel.dispose();
        const review: CollectionReview = { id: randomUUID(), candidates: candidates ?? [], cancelled: false, drafts: new Map(), revision: 0, originals };
        this.current = review;
        this.controller = new CollectionReviewController(
            this.context, review.id, candidates,
            selections => this.approve(review.id, selections),
            () => { review.cancelled = true; },
            selections => {
                const parsed = this.readSelections(review, selections, true);
                if (!parsed.some(selection => selection.comment.trim())) {
                    throw new Error(localize('azureInvoke.feedbackRequired', 'Enter feedback before requesting changes.'));
                }
                review.feedback = parsed;
                review.revision++;
                return parsed;
            },
            () => this.openChat(review.id, review.revision),
            diagnosisId => this.openChat(review.id, undefined, diagnosisId),
            !!originals,
        );
        return this.controller;
    }

    public getApproved(reviewId: string) {
        const review = this.requireApproved(reviewId);
        return this.describeReview(review, review.selections, 'approved');
    }

    public getReview(reviewId: string) {
        const review = this.current;
        if (review?.id === reviewId && !review.cancelled && review.feedback) {
            return this.describeReview(review, review.feedback, 'changesRequested');
        }
        return this.getApproved(reviewId);
    }

    public getDiagnostics(reviewId: string, diagnosisId: string) {
        const review = this.current;
        if (!review || review.id !== reviewId || review.originals || review.cancelled || review.selections || !this.controller || this.controller.isDisposed) {
            throw new Error(localize('azureInvoke.diagnosisExpired', 'This diagnosis is no longer active. Select Diagnose with Copilot in the current review.'));
        }
        return { reviewId, ...this.controller.getDiagnostics(diagnosisId) };
    }

    public async selectBlobFile(context: IActionContext, reviewId: string, candidateId: string, signal?: AbortSignal): Promise<void> {
        const review = this.current;
        if (!review || review.id !== reviewId || review.cancelled || review.selections || review.feedback ||
            review.originals || !this.controller || this.controller.isDisposed) {
            throw new Error(localize('azureInvoke.blobReviewUnavailable', 'Choose a Blob fixture in the active collection review. Wait for any open file picker to finish.'));
        }
        await this.controller.selectBlobFile(context, candidateId, signal);
    }

    private describeReview(review: CollectionReview, selections: InvocationSelection[], state: 'approved' | 'changesRequested') {
        if (review.originals) {
            throw new Error(localize('azureInvoke.savedReviewPrivate', 'Saved-request review fields stay private. Inspect saved requests and propose changes with the saved-request tools instead.'));
        }
        return {
            reviewId: review.id,
            revision: review.revision,
            state,
            cases: selections.map(selection => {
                const candidate = review.candidates.find(candidate => candidate.id === selection.id);
                if (!candidate || (candidate.trigger !== 'http' && candidate.trigger !== 'blob')) {
                    throw new Error(localize('azureInvoke.caseNotFound', 'This proposed case is no longer available.'));
                }
                if (candidate.trigger === 'blob') {
                    const fields = ['target', 'container', 'blobName', 'contentType'] as const;
                    return {
                        ...candidate, request: copyBlobDefinition(candidate.request), comment: selection.comment,
                        selected: selection.selected ?? true, invocationId: review.drafts.get(candidate.id),
                        reviewedFields: selection.blobRequest ?
                            fields.filter(field => JSON.stringify(selection.blobRequest?.[field]) !== JSON.stringify(candidate.request[field])) : [],
                        fileSelected: !!this.controller?.hasBlobFile(candidate.id) || review.drafts.has(candidate.id),
                    };
                }
                const fields = ['method', 'url', 'headers', 'query', 'body', 'bindings', 'dependsOn'] as const;
                const reviewedFields = selection.request ?
                    fields.filter(field => JSON.stringify(selection.request?.[field]) !== JSON.stringify(candidate.request[field])) : [];
                return { ...candidate, request: copyInvocation(candidate).request, comment: selection.comment, selected: selection.selected ?? true, invocationId: review.drafts.get(candidate.id), reviewedFields, dependencyIds: getRequestDependencies(selection.request ?? candidate.request) };
            }),
        };
    }

    public applyReviewedRequest(reviewId: string, candidateId: string, draft: HttpRequest): HttpRequest {
        const review = this.requireApproved(reviewId);
        const selection = review.selections.find(selection => selection.id === candidateId);
        const candidate = review.candidates.find(candidate => candidate.id === candidateId);
        if (!selection || !candidate || candidate.trigger !== 'http') {
            throw new Error(localize('azureInvoke.caseNotApproved', 'This case was not approved for drafting.'));
        }
        return selection.request ? mergeReviewedRequest(candidate.request, selection.request, draft) : draft;
    }

    public resolveDraftDependencies(reviewId: string, request: HttpRequest): HttpRequest {
        const review = this.requireApproved(reviewId);
        const resolve = (id: string): string => {
            const draftId = review.drafts.get(id);
            if (draftId) {
                return draftId;
            }
            if ([...review.drafts.values()].includes(id)) {
                return id;
            }
            throw new Error(localize('azureInvoke.draftPrerequisiteFirst', 'Draft each selected prerequisite before its dependent requests. Only approved sources can be linked.'));
        };
        return {
            ...request,
            bindings: request.bindings?.map(binding => ({ ...binding, sourceId: resolve(binding.sourceId) })),
            dependsOn: request.dependsOn?.map(resolve),
        };
    }

    public getDraftId(reviewId: string, candidateId: string): string | undefined {
        const review = this.requireApproved(reviewId);
        if (!review.selections.some(selection => selection.id === candidateId)) {
            throw new Error(localize('azureInvoke.caseNotApproved', 'This case was not approved for drafting.'));
        }
        return review.drafts.get(candidateId);
    }

    public recordDraft(reviewId: string, candidateId: string, invocationId: string): void {
        this.getDraftId(reviewId, candidateId);
        this.requireApproved(reviewId).drafts.set(candidateId, invocationId);
        this.updateStatuses();
    }

    private approve(reviewId: string, input: unknown): InvocationSelection[] {
        const review = this.current;
        const controller = this.controller;
        if (!review || review.id !== reviewId || review.cancelled || !controller || controller.isDisposed) {
            throw new Error(localize('azureInvoke.reviewExpired', 'This collection review is no longer active. Propose a new collection.'));
        }
        if (review.selections) {
            return review.selections.map(selection => ({ ...selection }));
        }
        const selections = this.readSelections(review, input);
        if (selections.some(selection => selection.comment.trim())) {
            throw new Error(localize('azureInvoke.feedbackNotConfirmed', 'Use Request changes to apply feedback, or clear the feedback before confirming.'));
        }
        const invocations: Invocation[] = selections.map(selection => {
            const candidate = review.candidates.find(candidate => candidate.id === selection.id);
            if (!candidate || (candidate.trigger !== 'http' && candidate.trigger !== 'blob')) {
                throw new Error(localize('azureInvoke.caseNotFound', 'This proposed case is no longer available.'));
            }
            if (candidate.trigger === 'blob') {
                const invocation: Invocation = {
                    id: candidate.id, name: candidate.name, group: candidate.group, trigger: 'blob',
                    request: controller.getBlobRequest(candidate.id, selection.blobRequest ?? candidate.request),
                };
                validateCollectionInvocation(invocation);
                return invocation;
            }
            return { id: candidate.id, name: candidate.name, group: review.originals ? review.originals.get(candidate.id)?.group : candidate.group, request: selection.request ?? candidate.request };
        });
        if (review.originals) {
            for (const [id, original] of review.originals) {
                if (JSON.stringify(this.provider.getRequest(id)) !== JSON.stringify(original)) {
                    throw new Error(localize('azureInvoke.savedReviewStale', 'A saved request changed while this review was open. Ask Copilot to inspect it and propose changes again. Nothing has been applied.'));
                }
            }
            this.provider.saveRequests(invocations);
            review.drafts = new Map(invocations.map(invocation => [invocation.id, invocation.id]));
            review.selections = selections;
            return selections.map(selection => ({ ...selection }));
        }
        const httpInvocations = invocations.filter((invocation): invocation is HttpInvocation => !isBlobInvocation(invocation));
        for (const invocation of httpInvocations) {
            planInvocationChain(invocation, id => httpInvocations.find(source => source.id === id));
        }
        const ids = new Map(invocations.map(invocation => [invocation.id, randomUUID()]));
        const resolve = (id: string): string => {
            const savedId = ids.get(id);
            if (!savedId) {
                throw new Error(localize('azureInvoke.missingDependency', 'A prerequisite request is unavailable. Keep its template selected before confirming.'));
            }
            return savedId;
        };
        this.provider.saveRequests(invocations.map(invocation => isBlobInvocation(invocation) ? {
            ...invocation, id: resolve(invocation.id),
        } : {
            ...invocation,
            id: resolve(invocation.id),
            request: {
                ...invocation.request,
                bindings: invocation.request.bindings?.map(binding => ({ ...binding, sourceId: resolve(binding.sourceId) })),
                dependsOn: invocation.request.dependsOn?.map(resolve),
            },
        }));
        review.drafts = ids;
        review.selections = selections;
        review.feedback = undefined;
        return selections.map(selection => ({ ...selection }));
    }

    private readSelections(review: CollectionReview, input: unknown, feedback = false): InvocationSelection[] {
        if (this.current !== review || review.cancelled || review.selections) {
            throw new Error(localize('azureInvoke.reviewExpired', 'This collection review is no longer active. Propose a new collection.'));
        }
        if (!Array.isArray(input) || !input.length || input.length > review.candidates.length ||
            (feedback && input.length !== review.candidates.filter(candidate => candidate.trigger === 'http' || candidate.trigger === 'blob').length)) {
            throw new Error(localize('azureInvoke.selectInvocations', 'Select at least one supported invocation to continue.'));
        }
        const selections: InvocationSelection[] = [];
        for (const entry of input) {
            const candidate = review.candidates.find(candidate => candidate.id === entry?.id);
            if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || typeof entry.comment !== 'string' ||
                entry.comment.length > 2000 || selections.some(selection => selection.id === entry.id) ||
                (feedback ? typeof entry.selected !== 'boolean' : entry.selected === false) ||
                !candidate || (candidate.trigger !== 'http' && candidate.trigger !== 'blob')) {
                throw new Error(localize('azureInvoke.invalidSelection', 'Select supported invocations and keep each comment within 2,000 characters.'));
            }
            const selection: InvocationSelection = { id: entry.id, comment: entry.comment.trim(), ...(feedback ? { selected: entry.selected } : {}) };
            if (candidate.trigger === 'blob') {
                const request: BlobUploadDefinition = entry.blobRequest ?? candidate.request;
                validateBlobCandidate({ ...candidate, request });
                selection.blobRequest = copyBlobDefinition(request);
            } else if (entry.request !== undefined) {
                const snapshot: unknown = { id: entry.id, name: candidate?.name, request: entry.request };
                validateInvocation(snapshot);
                selection.request = copyInvocation(snapshot).request;
            }
            selections.push(selection);
        }
        return selections;
    }

    private requireApproved(reviewId: string): CollectionReview & { selections: InvocationSelection[] } {
        const review = this.current;
        if (!review || review.id !== reviewId || review.originals || review.cancelled || !review.selections) {
            throw new Error(localize('azureInvoke.reviewNotApproved', 'Confirm the active collection review in the webview before drafting or testing requests.'));
        }
        return { ...review, selections: review.selections };
    }

    private updateStatuses(): void {
        const review = this.current;
        if (review?.selections && this.controller && !this.controller.isDisposed) {
            const controller = this.controller;
            const statuses = (review.selections ?? []).map(selection => {
                const invocationId = review.drafts.get(selection.id);
                return {
                    id: selection.id,
                    text: review.candidates.find(candidate => candidate.id === selection.id)?.trigger === 'blob' ?
                        localize('azureInvoke.manualOnly', 'Manual only') :
                        invocationId ? this.provider.getRequestStatus(invocationId) : localize('azureInvoke.ready', 'Ready'),
                };
            });
            void callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.reviewProgress', async context => {
                context.telemetry.suppressAll = true;
                context.errorHandling.suppressDisplay = true;
                await controller.updateStatuses(statuses);
            });
        }
    }

    public dispose(): void {
        this.subscription.dispose();
        this.controller?.panel.dispose();
        this.current = undefined;
    }
}

function validateBlobCandidate(candidate: BlobInvocationCandidate): void {
    if (typeof candidate.request?.blobName !== 'string' || /\{[^}]*\}/.test(candidate.request.blobName)) {
        throw new Error(localize('azureInvoke.concreteBlobName', 'Use a concrete Blob name, or leave it empty to use the selected file name. Do not use trigger-binding placeholders.'));
    }
    validateCollectionInvocation({
        ...candidate, request: { ...candidate.request, blobName: candidate.request.blobName || 'fixture', content: '', encoding: 'base64' },
    });
}

function mergeReviewedBlob(original: BlobUploadDefinition, edited: BlobUploadDefinition, proposed: BlobUploadDefinition): BlobUploadDefinition {
    return {
        target: JSON.stringify(edited.target) !== JSON.stringify(original.target) ? edited.target : proposed.target,
        container: edited.container !== original.container ? edited.container : proposed.container,
        blobName: edited.blobName !== original.blobName ? edited.blobName : proposed.blobName,
        contentType: edited.contentType !== original.contentType ? edited.contentType : proposed.contentType,
    };
}

function mergeReviewedRequest(original: HttpRequest, edited: HttpRequest, draft: HttpRequest): HttpRequest {
    return {
        method: edited.method !== original.method ? edited.method : draft.method,
        url: edited.url !== original.url ? edited.url : draft.url,
        body: edited.body !== original.body ? edited.body : draft.body,
        headers: JSON.stringify(edited.headers) !== JSON.stringify(original.headers) ? edited.headers : draft.headers,
        query: JSON.stringify(edited.query) !== JSON.stringify(original.query) ? edited.query : draft.query,
        bindings: JSON.stringify(edited.bindings) !== JSON.stringify(original.bindings) ? edited.bindings : draft.bindings,
        dependsOn: JSON.stringify(edited.dependsOn) !== JSON.stringify(original.dependsOn) ? edited.dependsOn : draft.dependsOn,
    };
}
