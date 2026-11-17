/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';
import { getRequestDependencies, type HttpInvocation } from '../webviews/azureInvoke/shared/httpRequest';
import { copyInvocation, validateInvocation, validateInvocations } from './httpInvocation';

export function parseInvocationCollection(content: string): HttpInvocation[] {
    let collection: unknown;
    try {
        collection = JSON.parse(content);
    } catch {
        throw new Error(localize('azureInvoke.invalidCollectionJson', 'The collection is not valid JSON.'));
    }
    if (!collection || typeof collection !== 'object' ||
        !('version' in collection) || (collection.version !== 1 && collection.version !== 2) ||
        !('invocations' in collection) || !Array.isArray(collection.invocations)) {
        throw new Error(localize('azureInvoke.invalidCollection', 'Choose an Azure Invoke collection with version 1 or 2 and an invocations array.'));
    }

    const invocations = collection.invocations.map((value: unknown) => {
        validateInvocation(value);
        if (collection.version === 1 && getRequestDependencies(value.request).length) {
            throw new Error(localize('azureInvoke.dependenciesVersion', 'Collections with request dependencies must use version 2.'));
        }
        return copyInvocation(value);
    });
    validateInvocations(invocations);
    return invocations;
}

export function serializeInvocationCollection(invocations: readonly HttpInvocation[]): string {
    validateInvocations(invocations);
    const version = invocations.some(invocation => getRequestDependencies(invocation.request).length) ? 2 : 1;
    return JSON.stringify({ version, invocations: invocations.map(copyInvocation) }, undefined, 4) + '\n';
}
