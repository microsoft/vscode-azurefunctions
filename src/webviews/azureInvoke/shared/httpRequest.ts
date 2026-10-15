/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export interface HttpRequestEntry {
    name: string;
    value: string;
}

export interface HttpRequest {
    method: typeof httpMethods[number];
    url: string;
    query: HttpRequestEntry[];
    headers: HttpRequestEntry[];
    body: string;
}

export interface HttpInvocation {
    readonly id: string;
    readonly name: string;
    readonly request: HttpRequest;
}

function isEntryArray(value: unknown): value is HttpRequestEntry[] {
    return Array.isArray(value) && value.length <= 100 && value.every(entry =>
        entry && typeof entry === 'object' && typeof entry.name === 'string' && typeof entry.value === 'string');
}

export function isHttpRequest(value: unknown): value is HttpRequest {
    return !!value && typeof value === 'object' &&
        'method' in value && httpMethods.some(method => method === value.method) &&
        'url' in value && typeof value.url === 'string' &&
        'body' in value && typeof value.body === 'string' &&
        'headers' in value && isEntryArray(value.headers) &&
        'query' in value && isEntryArray(value.query);
}

export function isInvocationName(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 100 && !/[\r\n]/.test(value);
}

export interface HttpResponse {
    status: number;
    duration: number;
    headers: HttpRequestEntry[];
    body: string;
}

export type HttpRequestMessage =
    | { command: 'ready' }
    | { command: 'sendRequest'; request: HttpRequest }
    | { command: 'saveRequest'; request: HttpRequest }
    | { command: 'renameRequest' }
    | { command: 'abortRequest' };

export type HttpRequestStateMessage =
    | { command: 'requestStarted'; saved: boolean }
    | { command: 'response'; response: HttpResponse }
    | { command: 'requestError'; message: string };

export type HttpResponseMessage =
    | HttpRequestStateMessage
    | { command: 'requestSaved' }
    | { command: 'saveError'; message: string }
    | { command: 'renamed'; name: string };

export interface HttpRequestViewConfiguration {
    labels: HttpRequestViewLabels;
    name: string;
    request: HttpRequest;
    saved: boolean;
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
}
