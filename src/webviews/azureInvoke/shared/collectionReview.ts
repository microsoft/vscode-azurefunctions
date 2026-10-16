/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DependencyLabels, type HttpRequest, type HttpRequestStateMessage, type HttpResponse } from './httpRequest';

export const otherInvocationTriggers = ['timer', 'blob', 'queue', 'serviceBus', 'eventHub', 'eventGrid', 'cosmosDB', 'other'] as const;

interface InvocationCandidateBase {
    id: string;
    name: string;
    group: string;
    description: string;
}

export interface HttpInvocationCandidate extends InvocationCandidateBase {
    trigger: 'http';
    auth: 'anonymous' | 'required' | 'unknown';
    request: HttpRequest;
}

export type InvocationCandidate = HttpInvocationCandidate | InvocationCandidateBase & {
    trigger: typeof otherInvocationTriggers[number];
    endpoint: string;
};

export type CollectionReviewState = 'loading' | 'reviewing' | 'revising' | 'approved' | 'cancelled' | 'failed';

export interface InvocationSelection {
    id: string;
    comment: string;
    request?: HttpRequest;
    selected?: boolean;
}

export type InvocationPreviewDiagnostic =
    | { outcome: 'response'; bodyTruncated?: boolean } & Pick<HttpResponse, 'status' | 'duration'> & Partial<Pick<HttpResponse, 'headers' | 'body'>>
    | { outcome: 'requestError'; message: string };

export interface InvocationDiagnosisCase extends HttpInvocationCandidate {
    reviewedFields: string[];
    dependencyIds: string[];
    diagnostic: InvocationPreviewDiagnostic;
}

export interface CollectionReviewConfiguration {
    candidates: InvocationCandidate[];
    updatingSaved?: boolean;
    loading: boolean;
    version: number;
    selections?: InvocationSelection[];
    labels: {
        title: string;
        introduction: string;
        selectAll: string;
        comment: string;
        unsupported: string;
        confirm: string;
        requestChanges: string;
        diagnoseRequest: string;
        diagnoseFailed: string;
        diagnosisHint: string;
        cancel: string;
        selected: string;
        approved: string;
        cancelled: string;
        selectCases: string;
        loadingTitle: string;
        loadingMessage: string;
        revisingTitle: string;
        revisingMessage: string;
        method: string;
        endpoint: string;
        trigger: string;
        authentication: string;
        anonymous: string;
        required: string;
        unknown: string;
        headers: string;
        query: string;
        body: string;
        none: string;
        send: string;
        sending: string;
        response: string;
        previewHint: string;
        name: string;
        value: string;
        enabled: string;
        add: string;
        remove: string;
        dependencies: DependencyLabels;
    };
}

export type CollectionReviewMessage =
    | { command: 'ready' }
    | { command: 'confirmCollection'; selections: InvocationSelection[] }
    | { command: 'requestChanges'; selections: InvocationSelection[] }
    | { command: 'diagnoseRequests'; ids: string[]; requests: { id: string; request: HttpRequest }[] }
    | { command: 'previewRequest'; id: string; request: HttpRequest; runDependencies?: boolean; requests?: { id: string; request: HttpRequest }[] }
    | { command: 'cancelPreview'; id: string }
    | { command: 'cancelCollection' };

interface CollectionReviewSnapshot {
    version: number;
    state: CollectionReviewState;
    selections: InvocationSelection[];
    statuses: { id: string; text: string }[];
    error?: string;
    diagnosing: boolean;
    diagnosisNotice?: string;
}

export type CollectionReviewResponse =
    | CollectionReviewSnapshot & { command: 'proposal'; candidates: InvocationCandidate[] }
    | CollectionReviewSnapshot & { command: 'state' }
    | { command: 'preview'; version: number; id: string; message: HttpRequestStateMessage };
