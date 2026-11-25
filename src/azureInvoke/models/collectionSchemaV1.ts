/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared by the extension and the editor webview bundle, so this file must stay browser-safe:
// no Node or vscode imports, and no imports of other src/azureInvoke files outside models/.

import * as z from 'zod/mini';

/*
 * Version 1 of the collection file's outer object and of the fields every invocation shares.
 * Each trigger's own fields are in its versioned schema file, such as httpSchemaV1.ts.
 *
 * Frozen once version 2 exists: from then on, never edit this file. Add the next version in its own file,
 * and follow "Collection file versioning" in .github/instructions/azure-invoke.instructions.md.
 */

/** Longest invocation ID. IDs also appear in dependency links. */
export const maxInvocationIdLength = 100;

/** Longest invocation name or group label. */
export const maxInvocationNameLength = 100;

/**
 * Whether `value` can be an invocation name or group label: 1 to `maxInvocationNameLength` characters,
 * not only whitespace, and on one line.
 */
export function isValidInvocationName(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxInvocationNameLength && !/[\r\n]/.test(value);
}

/** An invocation ID, also used by dependency links that point at another invocation. */
export const invocationIdSchemaV1 = z.string().check(z.minLength(1), z.maxLength(maxInvocationIdLength));

/** An invocation name or group label. */
export const invocationNameSchemaV1 = z.string().check(z.refine(isValidInvocationName));

export const collectionVersionV1 = 1;

/**
 * The file's outer object. Each invocation is checked separately by its trigger's schema.
 */
export const collectionFileSchemaV1 = z.object({
    version: z.literal(collectionVersionV1),
    invocations: z.array(z.unknown()),
});
