/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHttpHeaders } from '@azure/core-rest-pipeline';
import { validateHeaderName, validateHeaderValue } from 'http';
import { localize } from '../../../localize';
import { isHttpRequest, maxRequestBodyBytes, type HttpRequest } from '../../models/httpSchema';

export function validateRequestMethodAndBody({ method, body }: Pick<HttpRequest, 'method' | 'body'>): void {
    if ((method === 'GET' || method === 'HEAD') && body) {
        throw new Error(localize('azureInvoke.bodyNotAllowed', 'GET and HEAD requests cannot include a body in Invoke. Remove the body or choose another method.'));
    }
}

/**
 * Validates the input and turns enabled rows into URL query parameters and pipeline headers.
 */
export function prepareHttpRequest(input: unknown) {
    if (!isHttpRequest(input)) {
        throw new Error(localize('azureInvoke.invalidRequest', 'Invalid HTTP request. Use a supported method and at most 100 headers or query parameters.'));
    }

    if (Buffer.byteLength(input.body) > maxRequestBodyBytes) {
        throw new Error(localize('azureInvoke.requestTooLarge', 'Request bodies must not exceed {0} MB.', maxRequestBodyBytes / (1024 * 1024)));
    }

    validateRequestMethodAndBody(input);

    let url: URL;
    try {
        url = new URL(input.url);
    } catch {
        throw new Error(localize('azureInvoke.invalidUrl', 'Enter a valid HTTP or HTTPS URL.'));
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error(localize('azureInvoke.invalidProtocol', 'Use an HTTP or HTTPS URL without embedded credentials. Add authentication in Headers.'));
    }

    // Reject unresolved route placeholders: raw or percent-encoded braces such as {id} or %7Bid%7D,
    // or a whole colon-prefixed segment such as /:id.
    if (/(?:\{|%7b)[^/]*(?:\}|%7d)|\/:[a-z_][\w-]*(?=\/|$)/i.test(url.pathname)) {
        throw new Error(localize('azureInvoke.fillRouteValues', 'Replace route placeholders like {0} or {1} with a value, such as {2}, or use an Invoke variable like {3}.', '{id}', ':id', '123', '{{id}}'));
    }

    // Skip disabled and blank rows. A value needs a name, and repeated names are appended, not replaced.
    for (const entry of input.query) {
        if (entry.enabled === false) {
            continue;
        }
        if (entry.name.trim()) {
            url.searchParams.append(entry.name, entry.value);
        } else if (entry.value) {
            throw new Error(localize('azureInvoke.queryNameRequired', 'Enter a name for each query parameter.'));
        }
    }

    const headers = createHttpHeaders();
    for (const entry of input.headers) {
        if (entry.enabled === false) {
            continue;
        }
        if (!entry.name.trim() && !entry.value) {
            continue;
        }
        const name = entry.name.trim();
        try {
            validateHeaderName(name);
            validateHeaderValue(name, entry.value);
        } catch {
            throw new Error(localize('azureInvoke.invalidHeader', 'Enter valid HTTP header names and values.'));
        }
        headers.set(name, headers.has(name) ? `${headers.get(name)}, ${entry.value}` : entry.value);
    }

    return { input, url, headers };
}
