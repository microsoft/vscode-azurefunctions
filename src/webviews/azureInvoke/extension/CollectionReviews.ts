/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, isUserCancelledError } from '@microsoft/vscode-azext-utils';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { openAzureInvokeChat } from '../../../commands/azureInvoke/openAzureInvokeChat';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { copyInvocation, planInvocationChain, validateInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { type InvocationCandidate, type InvocationSelection } from '../shared/collectionReview';
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
            }
        }
        const copied: InvocationCandidate[] = candidates.map(candidate => candidate.trigger === 'http' ?
            { ...candidate, request: copyInvocation(candidate).request } : { ...candidate });
        let selections: InvocationSelection[] | undefined;
        if (reviewId) {
            const review = this.current;
            if (!review || review.id !== reviewId || review.cancelled || review.selections ||
                !this.controller || this.controller.isDisposed ||
                (review.candidates.length ? !review.feedback || revision !== review.revision : revision !== undefined)) {
                throw new Error(localize('azureInvoke.reviewExpired', 'This collection review is no longer active. Propose a new collection or use the current requested revision.'));
            }
            if (review.feedback) {
                copied.push(...review.candidates.filter(candidate => candidate.trigger !== 'http' && !copied.some(updated => updated.id === candidate.id)));
                if (copied.length > 100) {
                    throw new Error(localize('azureInvoke.invalidCandidates', 'Provide 1 to 100 proposed cases with unique IDs.'));
                }
                selections = copied.flatMap(candidate => {
                    if (candidate.trigger !== 'http') {
                        return [];
                    }
                    const edited = review.feedback?.find(selection => selection.id === candidate.id);
                    const original = review.candidates.find(original => original.id === candidate.id);
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

    private create(candidates?: InvocationCandidate[]): CollectionReviewController {
        this.controller?.panel.dispose();
        const review: CollectionReview = { id: randomUUID(), candidates: candidates ?? [], cancelled: false, drafts: new Map(), revision: 0 };
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

    private describeReview(review: CollectionReview, selections: InvocationSelection[], state: 'approved' | 'changesRequested') {
        return {
            reviewId: review.id,
            revision: review.revision,
            state,
            cases: selections.map(selection => {
                const candidate = review.candidates.find(candidate => candidate.id === selection.id);
                if (!candidate || candidate.trigger !== 'http') {
                    throw new Error(localize('azureInvoke.caseNotFound', 'This proposed case is no longer available.'));
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
        if (!review || review.id !== reviewId || review.cancelled) {
            throw new Error(localize('azureInvoke.reviewExpired', 'This collection review is no longer active. Propose a new collection.'));
        }
        if (review.selections) {
            return review.selections.map(selection => ({ ...selection }));
        }
        const selections = this.readSelections(review, input);
        if (selections.some(selection => selection.comment.trim())) {
            throw new Error(localize('azureInvoke.feedbackNotConfirmed', 'Use Request changes to apply feedback, or clear the feedback before confirming.'));
        }
        const invocations: HttpInvocation[] = selections.map(selection => {
            const candidate = review.candidates.find(candidate => candidate.id === selection.id);
            if (!candidate || candidate.trigger !== 'http') {
                throw new Error(localize('azureInvoke.caseNotFound', 'This proposed case is no longer available.'));
            }
            return { id: candidate.id, name: candidate.name, request: selection.request ?? candidate.request };
        });
        for (const invocation of invocations) {
            planInvocationChain(invocation, id => invocations.find(source => source.id === id));
        }
        const ids = new Map(invocations.map(invocation => [invocation.id, randomUUID()]));
        const resolve = (id: string): string => {
            const savedId = ids.get(id);
            if (!savedId) {
                throw new Error(localize('azureInvoke.missingDependency', 'A prerequisite request is unavailable. Keep its template selected before confirming.'));
            }
            return savedId;
        };
        this.provider.saveRequests(invocations.map(invocation => ({
            ...invocation,
            id: resolve(invocation.id),
            request: {
                ...invocation.request,
                bindings: invocation.request.bindings?.map(binding => ({ ...binding, sourceId: resolve(binding.sourceId) })),
                dependsOn: invocation.request.dependsOn?.map(resolve),
            },
        })));
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
            (feedback && input.length !== review.candidates.filter(candidate => candidate.trigger === 'http').length)) {
            throw new Error(localize('azureInvoke.selectCases', 'Select at least one HTTP case to continue.'));
        }
        const selections: InvocationSelection[] = [];
        for (const entry of input) {
            if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || typeof entry.comment !== 'string' ||
                entry.comment.length > 2000 || selections.some(selection => selection.id === entry.id) ||
                (feedback ? typeof entry.selected !== 'boolean' : entry.selected === false) ||
                !review.candidates.some(candidate => candidate.id === entry.id && candidate.trigger === 'http')) {
                throw new Error(localize('azureInvoke.invalidSelection', 'Select supported HTTP cases and keep each comment within 2,000 characters.'));
            }
            const selection: InvocationSelection = { id: entry.id, comment: entry.comment.trim(), ...(feedback ? { selected: entry.selected } : {}) };
            if (entry.request !== undefined) {
                const candidate = review.candidates.find(candidate => candidate.id === entry.id);
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
        if (!review || review.id !== reviewId || review.cancelled || !review.selections) {
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
                    text: invocationId ? this.provider.getRequestStatus(invocationId) : localize('azureInvoke.ready', 'Ready'),
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
