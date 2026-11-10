/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../localize';
import { getRequestDependencies, isHttpInvocation, isHttpRequest, isInvocationName, type HttpInvocation } from '../../webviews/azureInvoke/shared/httpRequest';
import { copyBlobInvocation, isBlobInvocation, isValidBlobFixture, type Invocation } from '../../webviews/azureInvoke/shared/blobInvocation';
import { copyTimerInvocation, isTimerInvocation, isValidTimerRequest } from '../../webviews/azureInvoke/shared/timerInvocation';

export function validateInvocation(value: unknown): asserts value is HttpInvocation {
    if (!value || typeof value !== 'object' ||
        !('id' in value) || typeof value.id !== 'string' || !value.id || value.id.length > 100 ||
        !('name' in value) || !isInvocationName(value.name) ||
        ('group' in value && value.group !== undefined && !isInvocationName(value.group)) ||
        ('trigger' in value && value.trigger !== 'http') || !('request' in value) || !isHttpRequest(value.request)) {
        throw new Error(localize('azureInvoke.invalidInvocation', 'Invalid invocation. Use a name and optional group of 1 to 100 characters without line breaks, a supported HTTP method, and at most 100 entries per parameter or dependency list. Bindings need unique identifier names other than guid, a source request, and a /body, /request/body, /headers, or /status selector.'));
    }
    if (Buffer.byteLength(value.request.body) > 5 * 1024 * 1024) {
        throw new Error(localize('azureInvoke.requestTooLarge', 'Request bodies must not exceed 5 MB.'));
    }
}

export function copyInvocation(invocation: HttpInvocation): HttpInvocation {
    return {
        id: invocation.id,
        name: invocation.name.trim(),
        ...(invocation.group === undefined ? {} : { group: invocation.group.trim() }),
        request: {
            method: invocation.request.method,
            url: invocation.request.url,
            body: invocation.request.body,
            headers: invocation.request.headers.map(({ name, value, enabled }) => ({ name, value, ...(enabled === undefined ? {} : { enabled }) })),
            query: invocation.request.query.map(({ name, value, enabled }) => ({ name, value, ...(enabled === undefined ? {} : { enabled }) })),
            ...(invocation.request.bindings?.length ? { bindings: invocation.request.bindings.map(binding => ({ ...binding })) } : {}),
            ...(invocation.request.dependsOn?.length ? { dependsOn: [...invocation.request.dependsOn] } : {}),
        },
    };
}

export function planInvocationChain(root: HttpInvocation, getInvocation: (id: string) => HttpInvocation | undefined): HttpInvocation[] {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const plan: HttpInvocation[] = [];
    function visit(invocation: HttpInvocation): void {
        if (visiting.has(invocation.id)) {
            throw new Error(localize('azureInvoke.dependencyCycle', 'Request dependencies contain a cycle. Remove the circular dependency before running.'));
        }
        if (visited.has(invocation.id)) {
            return;
        }
        if (visited.size + visiting.size >= 100) {
            throw new Error(localize('azureInvoke.chainTooLarge', 'A request chain can contain at most 100 requests.'));
        }
        validateInvocation(invocation);
        visiting.add(invocation.id);
        for (const id of getRequestDependencies(invocation.request)) {
            const source = id === root.id ? root : getInvocation(id);
            if (!source) {
                throw new Error(localize('azureInvoke.missingDependency', 'A prerequisite request is unavailable. Save it first, or remove its dependency and response links.'));
            }
            visit(source);
        }
        visiting.delete(invocation.id);
        visited.add(invocation.id);
        plan.push(copyInvocation(invocation));
    }
    visit(root);
    return plan;
}

export function validateCollectionInvocation(value: unknown): asserts value is Invocation {
    if (isBlobInvocation(value)) {
        if (!isValidBlobFixture(value.request)) {
            throw new Error(localize('azureInvoke.invalidBlobFixture', 'Use a loopback Azurite URL ending in /devstoreaccount1, a lowercase container name of 3 to 63 characters without consecutive hyphens, a blob name of 1 to 1024 characters, a content type, and valid text or Base64 content of at most 5 MB.'));
        }
    } else if (isTimerInvocation(value)) {
        if (!isValidTimerRequest(value.request)) {
            throw new Error(localize('azureInvoke.invalidTimerInvocation', 'Use a loopback Functions host URL without a path, credentials, query, or fragment, a function name of up to 128 letters, digits, underscores, or hyphens starting with a letter, and a schedule of at most 256 characters without line breaks.'));
        }
    } else {
        validateInvocation(value);
    }
}

export function copyCollectionInvocation(invocation: Invocation): Invocation {
    return isBlobInvocation(invocation) ? copyBlobInvocation(invocation) :
        isTimerInvocation(invocation) ? copyTimerInvocation(invocation) : copyInvocation(invocation);
}

export function parseInvocationCollection(content: string): Invocation[] {
    let collection: unknown;
    try {
        collection = JSON.parse(content);
    } catch {
        throw new Error(localize('azureInvoke.invalidCollectionJson', 'The collection is not valid JSON.'));
    }
    if (!collection || typeof collection !== 'object' ||
        !('version' in collection) || (collection.version !== 1 && collection.version !== 2 && collection.version !== 3 && collection.version !== 4) ||
        !('invocations' in collection) || !Array.isArray(collection.invocations)) {
        throw new Error(localize('azureInvoke.invalidCollection', 'Choose an Azure Invoke collection with version 1, 2, 3, or 4 and an invocations array.'));
    }

    const ids = new Set<string>();
    const invocations = collection.invocations.map((value: unknown) => {
        validateCollectionInvocation(value);
        if (isBlobInvocation(value) && collection.version !== 3 && collection.version !== 4) {
            throw new Error(localize('azureInvoke.blobCollectionVersion', 'Collections with manual Blob invocations must use version 3 or 4.'));
        }
        if (isTimerInvocation(value) && collection.version !== 4) {
            throw new Error(localize('azureInvoke.timerCollectionVersion', 'Collections with manual Timer invocations must use version 4.'));
        }
        if (isHttpInvocation(value) && collection.version === 1 && getRequestDependencies(value.request).length) {
            throw new Error(localize('azureInvoke.dependenciesVersion', 'Collections with request dependencies must use version 2.'));
        }
        if (ids.has(value.id)) {
            throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
        }
        ids.add(value.id);
        return copyCollectionInvocation(value);
    });
    for (const invocation of invocations) {
        if (isHttpInvocation(invocation)) {
            planInvocationChain(invocation, id => invocations.find((source): source is HttpInvocation => isHttpInvocation(source) && source.id === id));
        }
    }
    return invocations;
}

export function serializeInvocationCollection(invocations: readonly Invocation[]): string {
    invocations.forEach(validateCollectionInvocation);
    for (const invocation of invocations) {
        if (isHttpInvocation(invocation)) {
            planInvocationChain(invocation, id => invocations.find((source): source is HttpInvocation => isHttpInvocation(source) && source.id === id));
        }
    }
    const version = invocations.some(isTimerInvocation) ? 4 : invocations.some(isBlobInvocation) ? 3 :
        invocations.some(invocation => isHttpInvocation(invocation) && getRequestDependencies(invocation.request).length) ? 2 : 1;
    return JSON.stringify({ version, invocations: invocations.map(copyCollectionInvocation) }, undefined, 4) + '\n';
}
