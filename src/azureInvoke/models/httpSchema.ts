/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared by the extension and the editor webview bundle, so this file must stay browser-safe:
// no Node or vscode imports, and no imports of other src/azureInvoke files outside models/.

import { type z } from 'zod/mini';
import { httpHeaderOrQueryParameterSchemaV1, httpInvocationSchemaV1, httpRequestSchemaV1, httpResponseBindingSchemaV1, httpSchemaVersionV1, savedHttpInvocationSchemaV1 } from './httpSchemaV1';

/*
 * The current saved HTTP invocation format. Code outside models/ imports from here, never from a versioned file.
 * Types are inferred from the current schemas, and the collection, file loader, editor, and MCP tools all check against them.
 *
 * HTTP schema version history, independent of the collection version:
 * - 1: `id`, `name`, optional `group`, and a `request` with method, URL, query, headers, body,
 *      optional `bindings`, and optional `dependsOn`.
 *
 * To move to a new version, add its versioned file, then point everything below at it.
 * See "Collection file versioning" in .github/instructions/azure-invoke.instructions.md.
 */

export {
    bindingNamePattern, httpMethods, httpTrigger, isResponseBindingName, isResponsePointer,
    maxBindingSelectorLength, maxHttpDependencies, maxHttpEntries, maxRequestBodyBytes,
} from './httpSchemaV1';

export const httpHeaderOrQueryParameterSchema = httpHeaderOrQueryParameterSchemaV1;
export const httpResponseBindingSchema = httpResponseBindingSchemaV1;
export const httpRequestSchema = httpRequestSchemaV1;
export const httpInvocationSchema = httpInvocationSchemaV1;
export const currentHttpSchemaVersion = httpSchemaVersionV1;

export type HttpHeaderOrQueryParameter = z.infer<typeof httpHeaderOrQueryParameterSchema>;
export type HttpResponseBinding = z.infer<typeof httpResponseBindingSchema>;
export type HttpRequest = z.infer<typeof httpRequestSchema>;
export type HttpInvocation = Readonly<z.infer<typeof httpInvocationSchema>>;
export type SavedHttpInvocation = z.infer<typeof savedHttpInvocationSchemaV1>;

/**
 * Checks shape and limits only. Doesn't check the body size, whether the URL can be sent, or whether linked invocations exist.
 */
export function isHttpRequest(value: unknown): value is HttpRequest {
    return httpRequestSchema.safeParse(value).success;
}

/**
 * Checks shape and limits only. Doesn't check the body size, or dependencies against the rest of the collection.
 */
export function isHttpInvocation(value: unknown): value is HttpInvocation {
    return httpInvocationSchema.safeParse(value).success;
}
/**
 * The chain planner needs one list of prerequisite IDs. A binding already needs
 * its source's output, so there's no need to list that source in `dependsOn`.
 * Use `dependsOn` to wait for an invocation without reading its output.
 *
 * @example
 * getRequestDependencies({
 *     dependsOn: ['ship-order'],
 *     bindings: [
 *         { name: 'email', sourceId: 'get-customer', pointer: '/body/email' },
 *         { name: 'name', sourceId: 'get-customer', pointer: '/body/name' },
 *     ],
 * }); // ['ship-order', 'get-customer']
 */
export function getRequestDependencies(request: Pick<HttpRequest, 'dependsOn' | 'bindings'>): string[] {
    return [...new Set([...(request.dependsOn ?? []), ...(request.bindings ?? []).map(binding => binding.sourceId)])];
}
