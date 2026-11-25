/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared by the extension and the editor webview bundle, so this file must stay browser-safe:
// no Node or vscode imports, and no imports of other src/azureInvoke files outside models/.

import * as z from 'zod/mini';
import { invocationIdSchemaV1, invocationNameSchemaV1 } from './collectionSchemaV1';

/*
 * Version 1 of the saved HTTP invocation: its schema and the limits and rules that schema enforces.
 *
 * Frozen once version 2 exists: from then on, never edit this file. Add the next version in its own file,
 * and follow "Collection file versioning" in .github/instructions/azure-invoke.instructions.md.
 */

export const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

/** Most rows in a request's query or headers. */
export const maxHttpEntries = 100;

/** Most `dependsOn` IDs or bindings on one request. */
export const maxHttpDependencies = 100;

/** Largest request body, in UTF-8 bytes. Checked outside the schema so it can report its own error. */
export const maxRequestBodyBytes = 5 * 1024 * 1024;

/** Longest binding selector, such as `/body/items/0/id`. */
export const maxBindingSelectorLength = 1000;

/** Binding names: 1 to 64 ASCII letters, digits, underscores, or hyphens, not starting with a hyphen. */
export const bindingNamePattern = '[A-Za-z0-9_][A-Za-z0-9_-]{0,63}';
const responseBindingNamePattern = new RegExp(`^${bindingNamePattern}$`);

/**
 * Whether `value` can name a binding. `guid` is reserved for the generated UUID placeholder.
 */
export function isResponseBindingName(value: string): boolean {
    return value !== 'guid' && responseBindingNamePattern.test(value);
}

/**
 * Whether `value` is a supported binding selector: `/body...`, `/request/body...`, `/headers/<name>`, or `/status`.
 * `~` must be escaped as `~0` or `~1`.
 */
export function isResponsePointer(value: string): boolean {
    return /^\/(?:body(?:\/.*)?|request\/body(?:\/.*)?|headers\/[^/]+|status)$/.test(value) && !/~(?![01])/.test(value) && value.length <= maxBindingSelectorLength;
}

function hasNoDuplicates(values: readonly string[]): boolean {
    return new Set(values).size === values.length;
}

/**
 * Version 1 of a query parameter or header row.
 */
export const httpHeaderOrQueryParameterSchemaV1 = z.object({
    name: z.string(),
    value: z.string(),
    /** Set to false by unchecking the row. The row stays in the template but isn't sent. Defaults to true. */
    enabled: z.optional(z.boolean()),
});

/**
 * Version 1 of a binding, which fills `{{name}}` from another invocation's result.
 */
export const httpResponseBindingSchemaV1 = z.object({
    /** Alias used inside `{{name}}` in the dependent request. */
    name: z.string().check(z.refine(isResponseBindingName)),
    /** ID of the saved invocation whose successful run supplies the value. */
    sourceId: invocationIdSchemaV1,
    /** Path into that run's request or response, such as `/body/items/0/id`. */
    pointer: z.string().check(z.refine(isResponsePointer)),
});

/**
 * Version 1 of an HTTP request: an editable template before resolution, or concrete values after it.
 */
export const httpRequestSchemaV1 = z.object({
    method: z.enum(httpMethods),
    url: z.string(),
    query: z.array(httpHeaderOrQueryParameterSchemaV1).check(z.maxLength(maxHttpEntries)),
    headers: z.array(httpHeaderOrQueryParameterSchemaV1).check(z.maxLength(maxHttpEntries)),
    body: z.string(),
    /** Each binding makes its `sourceId` a prerequisite without a separate `dependsOn` entry. */
    bindings: z.optional(z.array(httpResponseBindingSchemaV1).check(
        z.maxLength(maxHttpDependencies),
        z.refine(bindings => hasNoDuplicates(bindings.map(binding => binding.name))),
    )),
    /** IDs of invocations to wait for without reading their output. */
    dependsOn: z.optional(z.array(invocationIdSchemaV1).check(z.maxLength(maxHttpDependencies), z.refine(hasNoDuplicates))),
});

/**
 * Version 1 of a saved HTTP invocation. Its ID stays stable when the display name changes.
 */
export const httpInvocationSchemaV1 = z.object({
    id: invocationIdSchemaV1,
    name: invocationNameSchemaV1,
    /** Optional folder label in the Invoke tree. Omit for a top-level entry. */
    group: z.optional(invocationNameSchemaV1),
    request: httpRequestSchemaV1,
});

export const httpTrigger = 'http';
export const httpSchemaVersionV1 = 1;

// The tags belong to the saved file, not to the editable invocation.
export const savedHttpInvocationSchemaV1 = z.extend(httpInvocationSchemaV1, {
    trigger: z.literal(httpTrigger),
    schemaVersion: z.literal(httpSchemaVersionV1),
});
