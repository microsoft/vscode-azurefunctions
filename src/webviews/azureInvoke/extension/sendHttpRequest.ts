/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHttpHeaders, createPipelineRequest } from '@azure/core-rest-pipeline';
import { createGenericClient } from '@microsoft/vscode-azext-azureutils';
import { UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { validateHeaderName, validateHeaderValue } from 'http';
import { localize } from '../../../localize';
import { isHttpRequest, type HttpResponse } from '../shared/httpRequest';

const maxBodyBytes = 5 * 1024 * 1024;

class ResponseTooLargeError extends Error {
    public constructor() {
        super(localize('azureInvoke.responseTooLarge', 'The response exceeds the 5 MB display limit.'));
    }
}

function getRequestError(error: unknown, cancelled: boolean, timedOut: boolean): Error {
    if (cancelled) {
        return new UserCancelledError('azureInvoke.request');
    }
    if (timedOut) {
        return new Error(localize('azureInvoke.timedOut', 'Request timed out. Check the endpoint or increase azureFunctions.requestTimeout.'));
    }
    if (error instanceof ResponseTooLargeError) {
        return error;
    }
    // Transport errors and their causes can include URLs, credentials, or response content.
    return new Error(localize('azureInvoke.requestFailed', 'Request failed. Check the URL, network connection, TLS certificate, and whether the Functions host is running.'));
}

export function prepareHttpRequest(input: unknown) {
    if (!isHttpRequest(input)) {
        throw new Error(localize('azureInvoke.invalidRequest', 'Invalid HTTP request. Use a supported method and at most 100 headers or query parameters.'));
    }
    if (Buffer.byteLength(input.body) > maxBodyBytes) {
        throw new Error(localize('azureInvoke.requestTooLarge', 'Request bodies must not exceed 5 MB.'));
    }
    if ((input.method === 'GET' || input.method === 'HEAD') && input.body) {
        throw new Error(localize('azureInvoke.bodyNotAllowed', 'GET and HEAD requests cannot include a body.'));
    }

    let url: URL;
    try {
        url = new URL(input.url);
    } catch {
        throw new Error(localize('azureInvoke.invalidUrl', 'Enter a valid HTTP or HTTPS URL.'));
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error(localize('azureInvoke.invalidProtocol', 'Use an HTTP or HTTPS URL without embedded credentials. Add authentication in Headers.'));
    }
    if (/(?:\{|%7b)[^/]*(?:\}|%7d)|\/:[a-z_][\w-]*(?=\/|$)/i.test(url.pathname)) {
        throw new Error(localize('azureInvoke.fillRouteValues', 'Fill in route placeholders before sending the request.'));
    }
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

export async function sendHttpRequest(context: IActionContext, request: unknown, abortSignal: AbortSignal, timeout: number): Promise<HttpResponse> {
    const { input, url, headers } = prepareHttpRequest(request);
    const started = Date.now();
    const timeoutAbort = new AbortController();
    const timer = setTimeout(() => timeoutAbort.abort(), timeout);
    const signal = AbortSignal.any([abortSignal, timeoutAbort.signal]);
    try {
        const client = await createGenericClient(context, undefined, {
            retryOptions: { maxRetries: 0 },
            redirectOptions: { maxRetries: 0 },
        });
        const request = createPipelineRequest({
            url: url.toString(),
            method: input.method,
            headers,
            body: input.body || undefined,
            abortSignal: signal,
            timeout,
            allowInsecureConnection: url.protocol === 'http:',
            streamResponseStatusCodes: new Set([Number.POSITIVE_INFINITY]),
        });
        const response = await client.sendRequest(request);
        const chunks: Buffer[] = [];
        let size = 0;
        if (response.readableStreamBody) {
            for await (const chunk of response.readableStreamBody) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                size += buffer.length;
                if (size > maxBodyBytes) {
                    throw new ResponseTooLargeError();
                }
                chunks.push(buffer);
            }
        }
        return {
            status: response.status,
            duration: Date.now() - started,
            headers: Object.entries(response.headers.toJSON()).map(([name, value]) => ({ name, value })),
            body: Buffer.concat(chunks).toString('utf8'),
        };
    } catch (error) {
        throw getRequestError(error, abortSignal.aborted, timeoutAbort.signal.aborted);
    } finally {
        clearTimeout(timer);
    }
}
