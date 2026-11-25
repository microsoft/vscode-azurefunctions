/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { localize } from '../../../localize';
import { type HttpResponse } from '../../models/httpRunModel';
import { type HttpHeaderOrQueryParameter, type HttpRequest, type HttpResponseBinding } from '../../models/httpSchema';
import { exactPlaceholderPattern, httpAuthorityPattern, placeholderPattern, shouldExpectJsonBody } from './requestTemplateRules';

export interface HttpInvocationResult {
    /** The sent request, with its placeholders resolved. */
    request: HttpRequest;
    response: HttpResponse;
}

type GetPlaceholderValue = (name: string) => unknown;

/**
 * The sent request and response from a prerequisite run that supplies values for placeholders.
 * For example, a binding can read `/body/id` from a Create Account response to fill `{{accountId}}`.
 * Bodies are parsed only when a binding reads them and reused if another binding reads the same body.
 */
interface CachedInvocationResult {
    result: HttpInvocationResult;
    responseBody?: unknown;
    requestBody?: unknown;
    responseBodyParsed: boolean;
    requestBodyParsed: boolean;
}

/**
 * Takes an HTTP request template and a lookup for completed prerequisite runs by invocation ID.
 * Each binding maps a selector such as `/body/id` to a placeholder name such as `accountId`.
 * Returns a fresh HTTP request with substitutions applied and chain metadata omitted.
 */
export function resolveRequestBindings(requestTemplate: HttpRequest, getResult: (id: string) => HttpInvocationResult): HttpRequest {
    const bindingsMap = collectBindingValues(requestTemplate.bindings ?? [], getResult);
    const getPlaceholderValue = (name: string): unknown => {
        // Generate the UUID only if used, and reuse it for every {{guid}} in this request.
        if (name === 'guid' && !bindingsMap.has(name)) {
            bindingsMap.set(name, randomUUID());
        }

        if (!bindingsMap.has(name)) {
            throw new Error(localize('azureInvoke.unknownVariable', 'A variable is not defined. Use {{guid}} for a generated UUID or add its source link in Dependencies before sending.'));
        }

        return bindingsMap.get(name);
    };

    return {
        method: requestTemplate.method,
        url: resolveRequestUrl(requestTemplate.url, getPlaceholderValue),
        body: resolveRequestBody(requestTemplate, getPlaceholderValue),
        query: requestTemplate.query.map(parameter => resolveParameterValue(parameter, getPlaceholderValue)),
        headers: requestTemplate.headers.map(header => resolveParameterValue(header, getPlaceholderValue)),
    };
}

/**
 * Collects the values that will replace placeholders in the current request.
 *
 * For example, suppose `getResult('create-account')` returns a run with response body `{"id":42,"active":true}`.
 * `{ sourceId: 'create-account', pointer: '/body/id', name: 'accountId' }` adds `accountId -> 42`.
 * `{ sourceId: 'create-account', pointer: '/body/active', name: 'isActive' }` adds `isActive -> true`.
 * The keys are the names inside `{{accountId}}` and `{{isActive}}`, not the original JSON field names.
 */
function collectBindingValues(bindings: HttpResponseBinding[], getResult: (id: string) => HttpInvocationResult): Map<string, unknown> {
    const bindingsMap = new Map<string, unknown>();

    // Both example bindings share one `source`: the sent request, its response, and any bodies
    // parsed so far. The second binding reuses the parsed response body within this call.
    const cachedInvocationResults = new Map<string, CachedInvocationResult>();

    for (const { sourceId, pointer, name } of bindings) {
        let source = cachedInvocationResults.get(sourceId);
        if (!source) {
            source = { result: getResult(sourceId), responseBodyParsed: false, requestBodyParsed: false };
            cachedInvocationResults.set(sourceId, source);
        }

        bindingsMap.set(name, readBindingSource(source, pointer));
    }

    return bindingsMap;
}

/**
 * Reads a binding's selector from a completed run's request or response.
 * If the server returned `{"id":42}`, use `/body/id`. There is no `/response` prefix.
 * If the run sent `{"clientId":"abc"}`, use `/request/body/clientId`, even if the server did not echo it.
 */
function readBindingSource(source: CachedInvocationResult, pointer: string): unknown {
    // A selector for a header or status doesn't need the response body to be JSON.
    if (pointer.startsWith('/body') && !source.responseBodyParsed) {
        try {
            source.responseBody = JSON.parse(source.result.response.body);
        } catch {
            throw new Error(localize('azureInvoke.sourceNotJson', 'A linked response body is not valid JSON. Choose a JSON response field, a header, or the status instead.'));
        }
        source.responseBodyParsed = true;
    }

    if (pointer.startsWith('/request/body') && !source.requestBodyParsed) {
        // Read the resolved request so later invocations can reuse values like a generated UUID.
        try {
            source.requestBody = JSON.parse(source.result.request.body);
        } catch {
            throw new Error(localize('azureInvoke.sourceRequestNotJson', 'The linked request body is not valid JSON. Use /request/body only with a JSON request body.'));
        }
        source.requestBodyParsed = true;
    }

    // For example, a response header row becomes a property readable at /headers/content-type.
    const selectorRoot = {
        body: source.responseBody,
        request: { body: source.requestBody },
        headers: Object.fromEntries(source.result.response.headers.map(header => [header.name.toLowerCase(), header.value])),
        status: source.result.response.status,
    };

    return readSelector(selectorRoot, pointer);
}

/**
 * Follows a path like `/body/items/0/id` from the selector root to a single value.
 */
function readSelector(root: object, pointer: string): unknown {
    let selected: unknown = root;

    for (const segment of pointer.slice(1).split('/')) {
        // Decode ~1 before ~0 so ~01 means the literal key '~1'.
        const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');

        if (
            // Reject falsy values first, including null, which typeof reports as 'object'.
            !selected ||
            // Treat strings, numbers, and booleans as leaf values, not containers to traverse.
            typeof selected !== 'object' ||
            // Read only fields present in the result, not inherited properties.
            !Object.hasOwn(selected, key) ||
            // Arrays expose indexes like '0', not properties like 'length'.
            (Array.isArray(selected) && !/^(0|[1-9]\d*)$/.test(key))
        ) {
            throw new Error(localize('azureInvoke.missingLinkedField', 'A selected request or response field is missing. Check the selector before running again.'));
        }

        // The guard verifies this key on an object or array. Reflect.get reads it without asserting a record type.
        selected = Reflect.get(selected, key);
    }

    return selected;
}

/**
 * Escapes special characters in placeholder values so they don't change the URL's structure.
 * For example, `/api/items/{{id}}` with `id` set to `a/b` becomes `/api/items/a%2Fb`,
 * so the ID stays in one path segment.
 * Rejects placeholders in the protocol or authority and checks that the origin stays unchanged.
 */
function resolveRequestUrl(urlTemplate: string, getPlaceholderValue: GetPlaceholderValue): string {
    const authority = httpAuthorityPattern.exec(urlTemplate)?.[0];
    if (authority?.includes('{{')) {
        throw new Error(localize('azureInvoke.variableHost', 'Response variables cannot change a request host, protocol, or URL credentials.'));
    }

    const url = substituteTextPlaceholders(urlTemplate, getPlaceholderValue, true);
    if (new URL(url).origin !== new URL(urlTemplate).origin) {
        throw new Error(localize('azureInvoke.variableHost', 'Response variables cannot change a request host, protocol, or URL credentials.'));
    }

    return url;
}

/**
 * Takes the body as stored in the template and returns the text to send on the wire.
 */
function resolveRequestBody(requestTemplate: HttpRequest, getPlaceholderValue: GetPlaceholderValue): string {
    const { body } = requestTemplate;
    if (!body.includes('{{')) {
        return body;
    }

    let parsedBody: unknown;
    try {
        parsedBody = JSON.parse(body);
    } catch {
        // Plain text can also contain placeholders. Only fall back to text if the body isn't expected to be JSON.
        if (shouldExpectJsonBody(requestTemplate)) {
            throw new Error(localize('azureInvoke.variableJson', 'Use valid JSON with quoted placeholders, such as {"id":"{{accountId}}"}, in a linked JSON body.'));
        }
        return substituteTextPlaceholders(body, getPlaceholderValue);
    }

    return JSON.stringify(resolveJsonValue(parsedBody, getPlaceholderValue));
}

/**
 * Resolves placeholders in JSON values before serialization.
 *
 * @param value Any parsed JSON value: a string, number, boolean, null, array, or object.
 * Walks array elements and object values recursively. Placeholders in object keys are rejected.
 *
 * @param getPlaceholderValue Looks up a JSON value by name, without the `{{` and `}}`.
 * A placeholder that fills an entire string takes the replacement as-is, including
 * arrays, objects, and null. A placeholder embedded in text accepts only strings,
 * numbers, and booleans and converts them to text.
 *
 * @example
 * const values = new Map([['count', 2]]);
 * const lookup = (name: string) => values.get(name);
 *
 * resolveJsonValue({ count: '{{count}}', label: 'Count: {{count}}' }, lookup);
 * // Returns { count: 2, label: 'Count: 2' }
 *
 * resolveJsonValue(['{{count}}', 'Count: {{count}}'], lookup);
 * // Returns [2, 'Count: 2']
 *
 * resolveJsonValue('{{count}}', lookup);
 * // Returns 2
 */
function resolveJsonValue(value: unknown, getPlaceholderValue: GetPlaceholderValue): unknown {
    if (typeof value === 'string') {
        const exactPlaceholder = exactPlaceholderPattern.exec(value);
        return exactPlaceholder ? getPlaceholderValue(exactPlaceholder[1]) : substituteTextPlaceholders(value, getPlaceholderValue);
    }

    if (Array.isArray(value)) {
        return value.map(item => resolveJsonValue(item, getPlaceholderValue));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => {
            if (key.includes('{{')) {
                throw new Error(localize('azureInvoke.variableFieldName', 'Use variables in field values, not field names.'));
            }
            return [key, resolveJsonValue(child, getPlaceholderValue)];
        }));
    }

    return value;
}

function resolveParameterValue(parameter: HttpHeaderOrQueryParameter, getPlaceholderValue: GetPlaceholderValue): HttpHeaderOrQueryParameter {
    // Keep unchecked rows as-is because transport won't send them.
    if (parameter.enabled === false) {
        return { ...parameter };
    }

    return { ...parameter, value: substituteTextPlaceholders(parameter.value, getPlaceholderValue) };
}

/**
 * Inserts scalar values into text, optionally encoding them for a URL path or query.
 */
function substituteTextPlaceholders(template: string, getPlaceholderValue: GetPlaceholderValue, encodeForUrl = false): string {
    const resolved = template.replace(placeholderPattern, (_match, name: string) => {
        const text = bindingValueToText(getPlaceholderValue(name));
        if (encodeForUrl && (text === '.' || text === '..')) {
            throw new Error(localize('azureInvoke.dotPathVariable', 'A URL response variable cannot be a dot path segment.'));
        }

        return encodeForUrl ? encodeURIComponent(text) : text;
    });

    // Check leftover braces against the original template so braces supplied by a result aren't treated as template syntax.
    const placeholderBraces = /\{\{|\}\}/;
    if (placeholderBraces.test(resolved) && placeholderBraces.test(template.replace(placeholderPattern, ''))) {
        throw new Error(localize('azureInvoke.invalidVariable', 'Use response variables in the form {{name}}.'));
    }

    return resolved;
}

function bindingValueToText(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new Error(localize('azureInvoke.scalarVariable', 'URL, header, and text variables must select a string, number, or boolean. Use a JSON body for objects, arrays, or null.'));
    }

    return String(value);
}
