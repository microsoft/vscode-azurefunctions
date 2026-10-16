/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { isIPv4 } from 'net';
import { localize } from '../../../localize';
import { type HttpRequest, type HttpResponse } from '../shared/httpRequest';
import { prepareHttpRequest } from './sendHttpRequest';

const variablePattern = /\{\{([a-z_][a-z0-9_]{0,63})\}\}/gi;

export interface HttpInvocationResult {
    request: HttpRequest;
    response: HttpResponse;
}

export function validateRequestTemplate(request: HttpRequest): void {
    const authority = /^https?:\/\/[^/?#]+/i.exec(request.url)?.[0];
    if (!authority || authority.includes('{{')) {
        throw new Error(localize('azureInvoke.variableHost', 'Use a fixed HTTP or HTTPS host. Response variables cannot change the protocol, host, or URL credentials.'));
    }
    const names = new Set(request.bindings?.map(binding => binding.name));
    names.add('guid');
    const check = (value: string): string => {
        const result = value.replace(variablePattern, (_match, name: string) => {
            if (!names.has(name)) {
                throw new Error(localize('azureInvoke.unknownVariable', 'A variable is not defined. Use {{guid}} for a generated UUID or add its source link in Dependencies before sending.'));
            }
            return 'value';
        });
        if (result.includes('{{')) {
            throw new Error(localize('azureInvoke.invalidVariable', 'Use response variables in the form {{name}}.'));
        }
        return result;
    };
    const entry = (value: HttpRequest['headers'][number]) => {
        if (value.enabled === false) {
            return { ...value };
        }
        if (value.name.includes('{{')) {
            throw new Error(localize('azureInvoke.variableFieldName', 'Use variables in field values, not field names.'));
        }
        return { ...value, value: check(value.value) };
    };
    const body = request.method === 'GET' || request.method === 'HEAD' ? '' : request.body;
    if (body.includes('{{') && (/^\s*[\[{]/.test(body) || request.headers.some(header => header.enabled !== false &&
        header.name.toLowerCase() === 'content-type' && /json/i.test(header.value)))) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch {
            throw new Error(localize('azureInvoke.variableJson', 'Use valid JSON with quoted placeholders, such as {"id":"{{accountId}}"}, in a linked JSON body.'));
        }
        const pending = [parsed];
        while (pending.length) {
            const value = pending.pop();
            if (Array.isArray(value)) {
                for (const child of value) {
                    pending.push(child);
                }
            } else if (value && typeof value === 'object') {
                for (const [key, child] of Object.entries(value)) {
                    if (key.includes('{{')) {
                        throw new Error(localize('azureInvoke.variableFieldName', 'Use variables in field values, not field names.'));
                    }
                    pending.push(child);
                }
            }
        }
    }
    prepareHttpRequest({ ...request, url: check(request.url), body: check(body), headers: request.headers.map(entry), query: request.query.map(entry) });
}

export function isLocalHttpRequest(request: HttpRequest): boolean {
    const hostname = new URL(request.url).hostname;
    return hostname === 'localhost' || hostname === 'localhost.' || hostname === '[::1]' ||
        (isIPv4(hostname) && hostname.startsWith('127.'));
}

export function resolveRequestBindings(request: HttpRequest, getResult: (id: string) => HttpInvocationResult): HttpRequest {
    const values = new Map<string, unknown>();
    const responses = new Map<string, { body?: unknown; requestBody?: unknown; parsed: boolean; requestParsed: boolean; result: HttpInvocationResult }>();
    for (const binding of request.bindings ?? []) {
        let source = responses.get(binding.sourceId);
        if (!source) {
            source = { result: getResult(binding.sourceId), parsed: false, requestParsed: false };
            responses.set(binding.sourceId, source);
        }
        if (binding.pointer.startsWith('/body') && !source.parsed) {
            try {
                source.body = JSON.parse(source.result.response.body);
            } catch {
                throw new Error(localize('azureInvoke.sourceNotJson', 'A linked response body is not valid JSON. Choose a JSON response field, a header, or the status instead.'));
            }
            source.parsed = true;
        }
        if (binding.pointer.startsWith('/request/body') && !source.requestParsed) {
            try {
                source.requestBody = JSON.parse(source.result.request.body);
            } catch {
                throw new Error(localize('azureInvoke.sourceRequestNotJson', 'The linked request body is not valid JSON. Use /request/body only with a JSON request body.'));
            }
            source.requestParsed = true;
        }
        let value: unknown = {
            body: source.body,
            request: { body: source.requestBody },
            headers: Object.fromEntries(source.result.response.headers.map(header => [header.name.toLowerCase(), header.value])),
            status: source.result.response.status,
        };
        for (const part of binding.pointer.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
            if (!value || typeof value !== 'object' || !Object.hasOwn(value, part) ||
                (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(part))) {
                throw new Error(localize('azureInvoke.missingLinkedField', 'A selected request or response field is missing. Check the selector before running again.'));
            }
            value = Reflect.get(value, part);
        }
        values.set(binding.name, value);
    }
    function valueFor(name: string): unknown {
        if (name === 'guid' && !values.has(name)) {
            values.set(name, randomUUID());
        }
        if (!values.has(name)) {
            throw new Error(localize('azureInvoke.unknownVariable', 'A variable is not defined. Use {{guid}} for a generated UUID or add its source link in Dependencies before sending.'));
        }
        return values.get(name);
    }
    function text(value: unknown): string {
        if (!['string', 'number', 'boolean'].includes(typeof value)) {
            throw new Error(localize('azureInvoke.scalarVariable', 'URL, header, and text variables must select a string, number, or boolean. Use a JSON body for objects, arrays, or null.'));
        }
        return String(value);
    }
    function replace(input: string, encode = false): string {
        const result = input.replace(variablePattern, (_match, name: string) => {
            const value = text(valueFor(name));
            if (encode && (value === '.' || value === '..')) {
                throw new Error(localize('azureInvoke.dotPathVariable', 'A URL response variable cannot be a dot path segment.'));
            }
            return encode ? encodeURIComponent(value) : value;
        });
        if (/\{\{|\}\}/.test(result) && /\{\{|\}\}/.test(input.replace(variablePattern, ''))) {
            throw new Error(localize('azureInvoke.invalidVariable', 'Use response variables in the form {{name}}.'));
        }
        return result;
    }
    const authority = /^https?:\/\/[^/?#]+/i.exec(request.url)?.[0];
    if (authority?.includes('{{')) {
        throw new Error(localize('azureInvoke.variableHost', 'Response variables cannot change a request host, protocol, or URL credentials.'));
    }
    const url = replace(request.url, true);
    // A response can supply path/query values, never a new destination.
    if (new URL(url).origin !== new URL(request.url).origin) {
        throw new Error(localize('azureInvoke.variableHost', 'Response variables cannot change a request host, protocol, or URL credentials.'));
    }
    let body = request.method === 'GET' || request.method === 'HEAD' ? '' : request.body;
    if (body.includes('{{')) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch {
            if (/^\s*[{[]/.test(body) || request.headers.some(header => header.enabled !== false &&
                header.name.toLowerCase() === 'content-type' && /json/i.test(header.value))) {
                throw new Error(localize('azureInvoke.variableJson', 'Use valid JSON with quoted placeholders, such as {"id":"{{accountId}}"}, in a linked JSON body.'));
            }
            body = replace(body);
        }
        if (parsed !== undefined) {
            function resolve(value: unknown): unknown {
                if (typeof value === 'string') {
                    const exact = /^\{\{([a-z_][a-z0-9_]{0,63})\}\}$/i.exec(value);
                    return exact ? valueFor(exact[1]) : replace(value);
                }
                if (Array.isArray(value)) {
                    return value.map(resolve);
                }
                if (value && typeof value === 'object') {
                    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
                        if (key.includes('{{')) {
                            throw new Error(localize('azureInvoke.variableFieldName', 'Use variables in field values, not field names.'));
                        }
                        return [key, resolve(child)];
                    }));
                }
                return value;
            }
            body = JSON.stringify(resolve(parsed));
        }
    }
    return {
        method: request.method, url, body,
        query: request.query.map(entry => entry.enabled === false ? { ...entry } : { ...entry, value: replace(entry.value) }),
        headers: request.headers.map(entry => entry.enabled === false ? { ...entry } : { ...entry, value: replace(entry.value) }),
    };
}
