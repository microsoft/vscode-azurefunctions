/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type HttpRequest, type HttpRequestStateMessage } from '../../../azureInvoke/model';

// Messages, configuration, and labels exchanged between InvocationEditor and its webview.

export type HttpRequestMessage =
    | { command: 'ready' }
    | { command: 'sendRequest'; request: HttpRequest; runDependencies?: boolean }
    | { command: 'saveRequest'; request: HttpRequest }
    | { command: 'renameRequest' }
    | { command: 'abortRequest' };

export type HttpResponseMessage =
    | HttpRequestStateMessage
    | { command: 'requestSaved' }
    | { command: 'saveError'; message: string }
    | { command: 'renamed'; name: string }
    | { command: 'sources'; sources: InvocationSource[] };

export interface InvocationSource {
    id: string;
    name: string;
}

export interface DependencyLabels {
    title: string;
    prerequisites: string;
    values: string;
    name: string;
    source: string;
    pointer: string;
    selectSource: string;
    search: string;
    noResults: string;
    unavailable: string;
    add: string;
    remove: string;
    hint: string;
    runChain: string;
}

export interface HttpRequestViewConfiguration {
    labels: HttpRequestViewLabels;
    name: string;
    request: HttpRequest;
    saved: boolean;
    sources?: InvocationSource[];
}

export interface HttpRequestViewLabels {
    subtitle: string;
    method: string;
    url: string;
    send: string;
    sending: string;
    cancel: string;
    params: string;
    headers: string;
    body: string;
    name: string;
    value: string;
    add: string;
    remove: string;
    response: string;
    responsePlaceholder: string;
    requestBody: string;
    requestOptions: string;
    getBodyHint: string;
    functionKeyHint: string;
    rename: string;
    save: string;
    saving: string;
    saved: string;
    unsaved: string;
    savedInvocationHint: string;
    enabled: string;
    dependencies: DependencyLabels;
}
