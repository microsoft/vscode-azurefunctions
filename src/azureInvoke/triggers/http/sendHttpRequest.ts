/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createPipelineRequest } from '@azure/core-rest-pipeline';
import { createGenericClient } from '@microsoft/vscode-azext-azureutils';
import { UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { isIPv4 } from 'net';
import { localize } from '../../../localize';
import { type HttpResponse } from '../../models/httpRunModel';
import { type HttpRequest } from '../../models/httpSchema';
import { prepareHttpRequest } from './prepareHttpRequest';

const maxResponseBodyBytes = 5 * 1024 * 1024;

export function isLoopbackHost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === 'localhost.' || hostname === '[::1]' ||
        (isIPv4(hostname) && hostname.startsWith('127.'));
}

// Temporary limit until remote invocations are supported.
export function assertLoopbackUrl(url: URL): void {
    if (!isLoopbackHost(url.hostname)) {
        throw new Error(localize('azureInvoke.remoteNotSupported', 'Azure Invoke has limited support for now and can only send requests to localhost, 127.x.x.x, or [::1]. Support for remote endpoints is coming later.'));
    }
}

export function isLocalHttpRequest(request: HttpRequest): boolean {
    return isLoopbackHost(new URL(request.url).hostname);
}

export function assertLocalHttpRequest(request: HttpRequest): void {
    assertLoopbackUrl(new URL(request.url));
}

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

/**
 * Sends a loopback request and returns its response body as UTF-8 text.
 */
export async function sendHttpRequest(
    context: IActionContext,
    request: unknown,
    abortSignal: AbortSignal,
    timeout: number | undefined,
): Promise<HttpResponse> {
    const { input, url, headers } = prepareHttpRequest(request);
    assertLoopbackUrl(url);

    const startedAt = Date.now();

    // Keep the timeout active through response body reads, not just until headers arrive.
    const timeoutAbort = new AbortController();
    const timeoutTimer = timeout === undefined ? undefined : setTimeout(() => timeoutAbort.abort(), timeout);
    const signal = AbortSignal.any([abortSignal, timeoutAbort.signal]);

    try {
        // Retries can repeat side effects, and redirects can leave loopback.
        const client = await createGenericClient(context, undefined, {
            retryOptions: { maxRetries: 0 },
            redirectOptions: { maxRetries: 0 },
        });

        const pipelineRequest = createPipelineRequest({
            url: url.toString(),
            method: input.method,
            headers,
            body: input.body || undefined,
            abortSignal: signal,
            timeout,
            allowInsecureConnection: url.protocol === 'http:',
            // The SDK treats Infinity as every status code, so we can cap even error bodies.
            streamResponseStatusCodes: new Set([Number.POSITIVE_INFINITY]),
        });
        const response = await client.sendRequest(pipelineRequest);

        const chunks: Buffer[] = [];
        let bodyBytes = 0;

        if (response.readableStreamBody) {
            for await (const chunk of response.readableStreamBody) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                bodyBytes += buffer.length;
                if (bodyBytes > maxResponseBodyBytes) {
                    throw new ResponseTooLargeError();
                }

                chunks.push(buffer);
            }
        }

        return {
            status: response.status,
            duration: Date.now() - startedAt,
            headers: Object.entries(response.headers.toJSON()).map(([name, value]) => ({ name, value })),
            // Decode once so UTF-8 characters split across chunks stay intact.
            body: Buffer.concat(chunks).toString('utf8'),
        };
    } catch (error) {
        throw getRequestError(error, abortSignal.aborted, timeoutAbort.signal.aborted);
    } finally {
        clearTimeout(timeoutTimer);
    }
}
