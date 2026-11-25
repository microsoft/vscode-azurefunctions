/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared by the extension and the editor webview bundle, so this file must stay browser-safe:
// no Node or vscode imports, and no imports of other src/azureInvoke files outside models/.

import { collectionVersionV1, invocationIdSchemaV1 } from './collectionSchemaV1';

/*
 * The current collection format.
 *
 * Version history:
 * - 1: `{ version: 1, invocations }`, with a `trigger` and `schemaVersion` on each saved invocation.
 *
 * To move to a new version, add its versioned file, then point everything below at it.
 * See "Collection file versioning" in .github/instructions/azure-invoke.instructions.md.
 */

/** Version written by this build. Files with a newer version are rejected rather than partly read. */
export const currentCollectionVersion = collectionVersionV1;

export { isValidInvocationName, maxInvocationIdLength, maxInvocationNameLength } from './collectionSchemaV1';
export { invocationNameSchemaV1 as invocationNameSchema } from './collectionSchemaV1';

/** An invocation ID in the current format. */
export const invocationIdSchema = invocationIdSchemaV1;

/**
 * Returns the file's `version` when it's a number, so a newer file can be told apart from a malformed one.
 */
export function getCollectionFileVersion(value: unknown): number | undefined {
    return value && typeof value === 'object' && 'version' in value && typeof value.version === 'number' ? value.version : undefined;
}
