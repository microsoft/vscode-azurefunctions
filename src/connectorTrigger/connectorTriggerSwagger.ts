/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asRecord, equalsIgnoreCase, readString } from './connectorTriggerUtils';

type JsonRecord = Record<string, unknown>;

// Event discovery's order: operations under `paths`, then `x-ms-paths`, in this method order.
const operationMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

export type SwaggerOperationMethod = typeof operationMethods[number];

export interface SwaggerOperation {
    /** Key under `paths` or `x-ms-paths`. An `x-ms-paths` key can end with a query string, such as `/items?mode=all`. */
    path: string;
    method: SwaggerOperationMethod;
    pathItem: JsonRecord;
    operation: JsonRecord;
}

export interface ResolvedSwaggerSchema {
    schema: JsonRecord;
    /** Definition name when the schema was referenced as `#/definitions/<name>`. */
    name?: string;
}

/** Returns the Swagger document of a managed API export (`properties.swagger`), or the value itself. */
export function unwrapConnectorSwagger(value: unknown): JsonRecord | undefined {
    const response = asRecord(value);
    return asRecord(asRecord(response?.properties)?.swagger) ?? response;
}

/**
 * Lists every operation, including repeated operation IDs, under `paths` and then `x-ms-paths`. Returns undefined when
 * the document declares neither.
 */
export function listSwaggerOperations(swagger: JsonRecord): SwaggerOperation[] | undefined {
    const pathMaps = [asRecord(swagger.paths), asRecord(swagger['x-ms-paths'])];
    if (!pathMaps.some(paths => paths !== undefined)) {
        return undefined;
    }

    const operations: SwaggerOperation[] = [];
    for (const paths of pathMaps) {
        for (const [path, pathItemValue] of Object.entries(paths ?? {})) {
            const pathItem = asRecord(pathItemValue);
            for (const method of operationMethods) {
                const operation = asRecord(pathItem?.[method]);
                if (pathItem && operation) {
                    operations.push({ path, method, pathItem, operation });
                }
            }
        }
    }
    return operations;
}

/** Finds the first operation whose trimmed ID matches case-insensitively, the identity event discovery offers. */
export function findSwaggerOperation(swagger: JsonRecord, operationId: string): SwaggerOperation | undefined {
    return listSwaggerOperations(swagger)?.find(candidate =>
        equalsIgnoreCase(readString(candidate.operation.operationId), operationId));
}

/**
 * Returns path-item parameters overridden by operation parameters with the same location and name; an override keeps
 * the overridden parameter's position. `#/parameters/...` references are resolved, and an unresolvable reference is
 * returned unchanged.
 */
export function getSwaggerOperationParameters(swagger: JsonRecord, target: SwaggerOperation): JsonRecord[] {
    const parameters = new Map<string, JsonRecord>();
    for (const value of [
        ...Array.isArray(target.pathItem.parameters) ? target.pathItem.parameters : [],
        ...Array.isArray(target.operation.parameters) ? target.operation.parameters : [],
    ]) {
        const parameter = resolveParameter(swagger, value);
        if (parameter) {
            parameters.set(JSON.stringify([readString(parameter.in)?.toLowerCase(), readString(parameter.name)]), parameter);
        }
    }
    return [...parameters.values()];
}

/**
 * Follows a schema's chain of local references, such as `#/definitions/Item`, unescaping JSON pointers. Returns
 * undefined for a missing schema, or for a reference that is not local, does not resolve to an object, or cycles.
 */
export function resolveSwaggerSchema(swagger: JsonRecord, schema: JsonRecord | undefined): ResolvedSwaggerSchema | undefined {
    const seen = new Set<string>();
    let name: string | undefined;
    let current = schema;
    while (typeof current?.$ref === 'string') {
        const reference = current.$ref;
        const segments = getLocalPointerSegments(reference);
        if (!segments || seen.has(reference)) {
            return undefined;
        }
        seen.add(reference);
        current = asRecord(getPointerValue(swagger, segments));
        name = segments.length === 2 && segments[0] === 'definitions' ? segments[1] : undefined;
    }
    return current && { schema: current, ...(name === undefined ? {} : { name }) };
}

function resolveParameter(swagger: JsonRecord, value: unknown): JsonRecord | undefined {
    const parameter = asRecord(value);
    const reference = readString(parameter?.$ref);
    const segments = reference?.startsWith('#/parameters/') ? getLocalPointerSegments(reference) : undefined;
    return segments ? asRecord(getPointerValue(swagger, segments)) ?? parameter : parameter;
}

function getLocalPointerSegments(reference: string): string[] | undefined {
    return reference.startsWith('#/') ?
        reference.substring(2).split('/').map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~')) :
        undefined;
}

function getPointerValue(root: JsonRecord, segments: readonly string[]): unknown {
    let value: unknown = root;
    for (const segment of segments) {
        const record = asRecord(value);
        if (!record || !Object.hasOwn(record, segment)) {
            return undefined;
        }
        value = record[segment];
    }
    return value;
}
