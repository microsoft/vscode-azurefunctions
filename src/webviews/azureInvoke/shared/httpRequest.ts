/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export interface HttpRequestEntry {
    name: string;
    value: string;
    enabled?: boolean;
}

export interface HttpResponseBinding {
    name: string;
    sourceId: string;
    pointer: string;
}

export function isResponseBindingName(value: string): boolean {
    return value !== 'guid' && /^[a-z_][a-z0-9_]{0,63}$/i.test(value);
}

export function isResponsePointer(value: string): boolean {
    return /^\/(?:body(?:\/.*)?|request\/body(?:\/.*)?|headers\/[^/]+|status)$/.test(value) && !/~(?![01])/.test(value) && value.length <= 1000;
}

export interface HttpRequest {
    method: typeof httpMethods[number];
    url: string;
    query: HttpRequestEntry[];
    headers: HttpRequestEntry[];
    body: string;
    bindings?: HttpResponseBinding[];
    dependsOn?: string[];
}

export interface HttpInvocation {
    readonly id: string;
    readonly name: string;
    readonly group?: string;
    readonly request: HttpRequest;
}

export function isHttpInvocation(value: unknown): value is HttpInvocation {
    return !!value && typeof value === 'object' &&
        (!('trigger' in value) || value.trigger === 'http') &&
        'id' in value && typeof value.id === 'string' && !!value.id && value.id.length <= 100 &&
        'name' in value && isInvocationName(value.name) &&
        (!('group' in value) || value.group === undefined || isInvocationName(value.group)) &&
        'request' in value && isHttpRequest(value.request);
}

function isEntryArray(value: unknown): value is HttpRequestEntry[] {
    return Array.isArray(value) && value.length <= 100 && value.every(entry =>
        entry && typeof entry === 'object' && typeof entry.name === 'string' && typeof entry.value === 'string' &&
        (entry.enabled === undefined || typeof entry.enabled === 'boolean'));
}

export function isHttpRequest(value: unknown): value is HttpRequest {
    return !!value && typeof value === 'object' &&
        'method' in value && httpMethods.some(method => method === value.method) &&
        'url' in value && typeof value.url === 'string' &&
        'body' in value && typeof value.body === 'string' &&
        'headers' in value && isEntryArray(value.headers) &&
        'query' in value && isEntryArray(value.query) &&
        (!('dependsOn' in value) || value.dependsOn === undefined ||
            (Array.isArray(value.dependsOn) && value.dependsOn.length <= 100 && value.dependsOn.every(id => typeof id === 'string' && !!id && id.length <= 100) &&
                new Set(value.dependsOn).size === value.dependsOn.length)) &&
        (!('bindings' in value) || value.bindings === undefined ||
            (Array.isArray(value.bindings) && value.bindings.length <= 100 && value.bindings.every(binding =>
                binding && typeof binding === 'object' && typeof binding.name === 'string' && isResponseBindingName(binding.name) &&
                typeof binding.sourceId === 'string' && !!binding.sourceId && binding.sourceId.length <= 100 &&
                typeof binding.pointer === 'string' && isResponsePointer(binding.pointer)) &&
                new Set(value.bindings.map(binding => binding.name)).size === value.bindings.length));
}

export function getRequestDependencies(request: Pick<HttpRequest, 'dependsOn' | 'bindings'>): string[] {
    return [...new Set([...(request.dependsOn ?? []), ...(request.bindings ?? []).map(binding => binding.sourceId)])];
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
    | { command: 'sendRequest'; request: HttpRequest; runDependencies?: boolean }
    | { command: 'saveRequest'; request: HttpRequest }
    | { command: 'renameRequest' }
    | { command: 'debugRequest'; breakpointGuidance: string }
    | { command: 'abortRequest' };

export type HttpRequestStateMessage = (
    | { command: 'requestStarted'; saved: boolean }
    | { command: 'response'; response: HttpResponse }
    | { command: 'requestError'; message: string; cancelled?: boolean; blocked?: boolean }
) & { sequence?: number };

export type HttpResponseMessage =
    | HttpRequestStateMessage
    | { command: 'requestSaved' }
    | { command: 'saveError'; message: string }
    | { command: 'renamed'; name: string }
    | { command: 'sources'; sources: InvocationSource[] }
    | { command: 'debugState'; busy: boolean; message?: string; error?: string };

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
    debugAvailable?: boolean;
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
    debug: string;
    debugHint: string;
    guidance: string;
    guidancePlaceholder: string;
    guidancePrivacy: string;
    enabled: string;
    dependencies: DependencyLabels;
}
