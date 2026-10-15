/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../localize';
import { isHttpRequest, isInvocationName, type HttpInvocation } from '../../webviews/azureInvoke/shared/httpRequest';

export function validateInvocation(value: unknown): asserts value is HttpInvocation {
    if (!value || typeof value !== 'object' ||
        !('id' in value) || typeof value.id !== 'string' || !value.id || value.id.length > 100 ||
        !('name' in value) || !isInvocationName(value.name) ||
        !('request' in value) || !isHttpRequest(value.request)) {
        throw new Error(localize('azureInvoke.invalidInvocation', 'Invalid invocation. Use a name of 1 to 100 characters, a supported HTTP method, and at most 100 headers or query parameters.'));
    }
    if (Buffer.byteLength(value.request.body) > 5 * 1024 * 1024) {
        throw new Error(localize('azureInvoke.requestTooLarge', 'Request bodies must not exceed 5 MB.'));
    }
}

export function copyInvocation(invocation: HttpInvocation): HttpInvocation {
    return {
        id: invocation.id,
        name: invocation.name.trim(),
        request: {
            method: invocation.request.method,
            url: invocation.request.url,
            body: invocation.request.body,
            headers: invocation.request.headers.map(({ name, value }) => ({ name, value })),
            query: invocation.request.query.map(({ name, value }) => ({ name, value })),
        },
    };
}

export function parseInvocationCollection(content: string): HttpInvocation[] {
    let collection: unknown;
    try {
        collection = JSON.parse(content);
    } catch {
        throw new Error(localize('azureInvoke.invalidCollectionJson', 'The collection is not valid JSON.'));
    }
    if (!collection || typeof collection !== 'object' ||
        !('version' in collection) || collection.version !== 1 ||
        !('invocations' in collection) || !Array.isArray(collection.invocations)) {
        throw new Error(localize('azureInvoke.invalidCollection', 'Choose an Azure Invoke collection with version 1 and an invocations array.'));
    }

    const ids = new Set<string>();
    return collection.invocations.map((value: unknown) => {
        validateInvocation(value);
        if (ids.has(value.id)) {
            throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
        }
        ids.add(value.id);
        return copyInvocation(value);
    });
}

export function serializeInvocationCollection(invocations: readonly HttpInvocation[]): string {
    invocations.forEach(validateInvocation);
    return JSON.stringify({ version: 1, invocations: invocations.map(copyInvocation) }, undefined, 4) + '\n';
}
