/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';
import { copyInvocation, validateInvocations } from './httpInvocation';
import { currentCollectionVersion, getCollectionFileVersion } from './models/collectionSchema';
import { collectionFileSchemaV1 } from './models/collectionSchemaV1';
import { currentHttpSchemaVersion, httpTrigger, type HttpInvocation, type SavedHttpInvocation } from './models/httpSchema';
import { savedHttpInvocationSchemaV1 } from './models/httpSchemaV1';

/**
 * Parses a collection file's content and returns its invocations.
 * Rejects the whole file if any invocation is invalid, if IDs repeat, or if a dependency chain is broken.
 */
export function parseInvocationCollection(content: string): HttpInvocation[] {
    let collection: unknown;
    try {
        collection = JSON.parse(content);
    } catch {
        throw new Error(localize('azureInvoke.invalidCollectionJson', 'The collection is not valid JSON.'));
    }

    // Versioning - a newer file may contain fields this build would drop, so refuse it rather than partly read it.
    const version = getCollectionFileVersion(collection);
    if (version !== undefined && version > currentCollectionVersion) {
        throw new Error(localize('azureInvoke.newerCollection', 'This collection was saved by a newer version of the Azure Functions extension. Update the extension to open it.'));
    }

    const file = collectionFileSchemaV1.safeParse(collection);
    if (!file.success) {
        throw new Error(localize('azureInvoke.invalidCollection', 'Choose an Azure Invoke collection with a supported version and an invocations array.'));
    }

    const invocations = file.data.invocations.map(value => {
        const entry = savedHttpInvocationSchemaV1.safeParse(value);
        if (!entry.success) {
            throw new Error(localize('azureInvoke.unsupportedSavedInvocation', 'The collection contains an invalid invocation or an unsupported trigger or schema version.'));
        }
        return copyInvocation(entry.data);
    });

    // Check the invocations as a whole: unique IDs, no cycles, and no missing prerequisites.
    validateInvocations(invocations);
    return invocations;
}

/**
 * Serializes invocations as collection file content. Saves definitions only, never run status or outputs.
 */
export function serializeInvocationCollection(invocations: readonly HttpInvocation[]): string {
    validateInvocations(invocations);

    // Versioning - always write the current version.
    // Indented with a trailing newline so saved files diff cleanly in source control.
    const savedInvocations = invocations.map((invocation): SavedHttpInvocation => ({
        trigger: httpTrigger,
        schemaVersion: currentHttpSchemaVersion,
        ...copyInvocation(invocation),
    }));
    return JSON.stringify({ version: currentCollectionVersion, invocations: savedInvocations }, undefined, 4) + '\n';
}
