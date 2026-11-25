/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringDecoder } from 'string_decoder';
import { type HttpResponse } from '../../../azureInvoke/models/httpRunModel';

const allowedToolResponseHeaders = new Set([
    'allow', 'cache-control', 'content-encoding', 'content-language', 'content-length',
    'content-type', 'date', 'etag', 'expires', 'last-modified', 'retry-after', 'server',
]);

/**
 * Always returns status and duration. When content is included, filters headers by name and optionally caps the UTF-8 body by byte count without redacting it.
 */
export function buildHttpInvocationToolResult(response: HttpResponse, includeResponseContent: boolean, bodyLimitBytes?: number) {
    return {
        status: response.status,
        duration: response.duration,
        ...(includeResponseContent ? {
            headers: response.headers.filter(header => allowedToolResponseHeaders.has(header.name.toLowerCase())),
            body: bodyLimitBytes === undefined ? response.body : new StringDecoder('utf8').write(Buffer.from(response.body).subarray(0, bodyLimitBytes)),
            ...(bodyLimitBytes === undefined ? {} : { bodyTruncated: Buffer.byteLength(response.body) > bodyLimitBytes }),
        } : {}),
    };
}
