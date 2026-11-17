/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';
import { getRequestDependencies, isHttpRequest, isInvocationName, type HttpInvocation } from '../webviews/azureInvoke/shared/httpRequest';

export function validateInvocation(value: unknown): asserts value is HttpInvocation {
    if (!value || typeof value !== 'object' ||
        !('id' in value) || typeof value.id !== 'string' || !value.id || value.id.length > 100 ||
        !('name' in value) || !isInvocationName(value.name) ||
        ('group' in value && value.group !== undefined && !isInvocationName(value.group)) ||
        !('request' in value) || !isHttpRequest(value.request)) {
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

/**
 * Returns the invocation's prerequisites in execution order, followed by the invocation itself.
 * Throws for cycles, missing prerequisites, or chains longer than 100 requests.
 */
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

/** Validates a set of invocations as a whole: each definition, unique IDs, and every dependency chain. */
export function validateInvocations(invocations: readonly HttpInvocation[]): void {
    invocations.forEach(validateInvocation);
    if (new Set(invocations.map(invocation => invocation.id)).size !== invocations.length) {
        throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
    }
    for (const invocation of invocations) {
        planInvocationChain(invocation, id => invocations.find(source => source.id === id));
    }
}
