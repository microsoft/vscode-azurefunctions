/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findSwaggerOperation, resolveSwaggerSchema, unwrapConnectorSwagger, type ResolvedSwaggerSchema } from './connectorTriggerSwagger';
import { asRecord, readString } from './connectorTriggerUtils';

type JsonRecord = Record<string, unknown>;

const pythonReservedNames = new Set([
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
    'def', 'del', 'elif', 'else', 'except', 'false', 'finally', 'for',
    'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'none',
    'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'true', 'try',
    'while', 'with', 'yield',
]);

export type ConnectorTriggerOutputLimitation =
    'definition-unavailable' |
    'operation-not-found' |
    'response-schema-unavailable' |
    'unsupported-output-schema';

export type ConnectorTriggerOutputScalarType =
    'boolean' |
    'integer' |
    'number' |
    'string';

export type ConnectorTriggerOutputPropertyType =
    | {
        kind: 'array';
        itemType: ConnectorTriggerOutputScalarType;
    }
    | {
        kind: 'map';
        valueType: ConnectorTriggerOutputScalarType;
    }
    | {
        kind: 'scalar';
        format?: string;
        type: ConnectorTriggerOutputScalarType;
    }
    | {
        kind: 'unknown';
    };

export interface ConnectorTriggerOutputProperty {
    name: string;
    required: boolean;
    type: ConnectorTriggerOutputPropertyType;
}

export interface ConnectorTriggerOutputSchema {
    collectionPath: 'body' | 'body.value';
    modelName: string;
    properties: ConnectorTriggerOutputProperty[];
    schemaName: string;
}

export interface ConnectorTriggerOutputMetadata {
    limitation?: ConnectorTriggerOutputLimitation;
    schema?: ConnectorTriggerOutputSchema;
}

function getPythonOutputFieldName(value: string): string {
    const tokens = splitIdentifier(value);
    const name = tokens.map(token => token.toLowerCase()).join('_') || 'value';
    const safeName = /^[a-z_]/.test(name) ? name : `value_${name}`;
    return pythonReservedNames.has(safeName) ? `${safeName}_` : safeName;
}

export function parseConnectorTriggerOutputMetadata(
    swaggerResponse: unknown,
    operationId: string,
): ConnectorTriggerOutputMetadata {
    const swagger = unwrapConnectorSwagger(swaggerResponse);
    if (!swagger) {
        return { limitation: 'definition-unavailable' };
    }

    const operation = findSwaggerOperation(swagger, operationId)?.operation;
    if (!operation) {
        return { limitation: 'operation-not-found' };
    }

    const responseSchema = getSuccessResponseSchema(operation);
    if (!responseSchema) {
        return { limitation: 'response-schema-unavailable' };
    }

    const root = resolveSwaggerSchema(swagger, responseSchema);
    if (!root) {
        return { limitation: 'unsupported-output-schema' };
    }

    let collectionPath: ConnectorTriggerOutputSchema['collectionPath'];
    let item: ResolvedSwaggerSchema | undefined;
    if (readString(root.schema.type)?.toLowerCase() === 'array') {
        collectionPath = 'body';
        item = resolveSwaggerSchema(swagger, asRecord(root.schema.items));
    } else {
        const properties = asRecord(root.schema.properties);
        const value = resolveSwaggerSchema(swagger, asRecord(properties?.value));
        if (!value ||
            readString(value.schema.type)?.toLowerCase() !== 'array') {
            return { limitation: 'unsupported-output-schema' };
        }
        collectionPath = 'body.value';
        item = resolveSwaggerSchema(swagger, asRecord(value.schema.items));
    }
    if (!item ||
        readString(item.schema.type)?.toLowerCase() !== 'object') {
        return { limitation: 'unsupported-output-schema' };
    }

    const schemaProperties = asRecord(item.schema.properties);
    if (!schemaProperties) {
        return { limitation: 'unsupported-output-schema' };
    }
    const required = new Set(
        Array.isArray(item.schema.required) ?
            item.schema.required.filter((value): value is string =>
                typeof value === 'string') :
            [],
    );
    const properties = Object.entries(schemaProperties).map(([name, value]) => ({
        name,
        required: required.has(name),
        type: parsePropertyType(swagger, asRecord(value)),
    }));
    // Schema-based local models require an unambiguous Python wire-name lookup.
    if (hasPythonFieldCollisions(properties)) {
        return { limitation: 'unsupported-output-schema' };
    }
    const schemaName = item.name ?? `${operationId}Item`;
    return {
        schema: {
            collectionPath,
            modelName: getSchemaModelName(schemaName),
            properties,
            schemaName,
        },
    };
}

function hasPythonFieldCollisions(properties: readonly ConnectorTriggerOutputProperty[]): boolean {
    const names = properties.map(property => getPythonOutputFieldName(property.name));
    return new Set(names).size !== names.length;
}

function getSuccessResponseSchema(
    operation: JsonRecord,
): JsonRecord | undefined {
    const responses = asRecord(operation.responses);
    const successCodes = Object.keys(responses ?? {})
        .filter(code => /^2\d\d$/.test(code))
        .sort();
    for (const code of successCodes) {
        const schema = asRecord(asRecord(responses?.[code])?.schema);
        if (schema) {
            return schema;
        }
    }
    return undefined;
}

function parsePropertyType(
    swagger: JsonRecord,
    schema: JsonRecord | undefined,
): ConnectorTriggerOutputPropertyType {
    const resolved = resolveSwaggerSchema(swagger, schema);
    const type = readScalarType(resolved?.schema.type);
    if (type) {
        return {
            kind: 'scalar',
            type,
            ...(typeof resolved?.schema.format === 'string' ?
                { format: resolved.schema.format } :
                {}),
        };
    }
    const resolvedType = readString(resolved?.schema.type)?.toLowerCase();
    if (resolvedType === 'array') {
        const item = resolveSwaggerSchema(
            swagger,
            asRecord(resolved?.schema.items),
        );
        const itemType = readScalarType(item?.schema.type);
        return itemType ?
            { kind: 'array', itemType } :
            { kind: 'unknown' };
    }
    if (resolvedType === 'object') {
        const additionalProperties = resolveSwaggerSchema(
            swagger,
            asRecord(resolved?.schema.additionalProperties),
        );
        const valueType = readScalarType(additionalProperties?.schema.type);
        return valueType ?
            { kind: 'map', valueType } :
            { kind: 'unknown' };
    }
    return { kind: 'unknown' };
}

function readScalarType(
    value: unknown,
): ConnectorTriggerOutputScalarType | undefined {
    return value === 'boolean' ||
        value === 'integer' ||
        value === 'number' ||
        value === 'string' ?
        value :
        undefined;
}

function getSchemaModelName(schemaName: string): string {
    const tail = schemaName.split(/[./]/).filter(Boolean).at(-1) ?? schemaName;
    const tokens = tail
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .split(/[^A-Za-z\d]+/)
        .filter(Boolean);
    const name = tokens
        .map(token => `${token[0].toUpperCase()}${token.slice(1)}`)
        .join('');
    return /^[A-Za-z]/.test(name) ? name : `Connector${name || 'Event'}`;
}

function splitIdentifier(value: string): string[] {
    return value
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .split(/[^A-Za-z\d]+/)
        .filter(Boolean);
}
