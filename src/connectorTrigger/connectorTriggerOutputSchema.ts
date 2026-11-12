/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

interface ResolvedSchema {
    name?: string;
    schema: JsonRecord;
}

export function parseConnectorTriggerOutputMetadata(
    swaggerResponse: unknown,
    operationId: string,
): ConnectorTriggerOutputMetadata {
    const response = asRecord(swaggerResponse);
    const swagger = asRecord(asRecord(response?.properties)?.swagger) ?? response;
    if (!swagger) {
        return { limitation: 'definition-unavailable' };
    }

    const operation = findOperation(swagger, operationId);
    if (!operation) {
        return { limitation: 'operation-not-found' };
    }

    const responseSchema = getSuccessResponseSchema(operation);
    if (!responseSchema) {
        return { limitation: 'response-schema-unavailable' };
    }

    const root = resolveSchema(swagger, responseSchema);
    if (!root) {
        return { limitation: 'unsupported-output-schema' };
    }

    let collectionPath: ConnectorTriggerOutputSchema['collectionPath'];
    let item: ResolvedSchema | undefined;
    if (readString(root.schema.type)?.toLowerCase() === 'array') {
        collectionPath = 'body';
        item = resolveSchema(swagger, asRecord(root.schema.items));
    } else {
        const properties = asRecord(root.schema.properties);
        const value = resolveSchema(swagger, asRecord(properties?.value));
        if (!value ||
            readString(value.schema.type)?.toLowerCase() !== 'array') {
            return { limitation: 'unsupported-output-schema' };
        }
        collectionPath = 'body.value';
        item = resolveSchema(swagger, asRecord(value.schema.items));
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

function findOperation(
    swagger: JsonRecord,
    operationId: string,
): JsonRecord | undefined {
    const paths = asRecord(swagger.paths);
    const additionalPaths = asRecord(swagger['x-ms-paths']);
    for (const pathItemValue of [...Object.values(paths ?? {}), ...Object.values(additionalPaths ?? {})]) {
        const pathItem = asRecord(pathItemValue);
        for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
            const operation = asRecord(pathItem?.[method]);
            if (readString(operation?.operationId)?.localeCompare(
                operationId,
                undefined,
                { sensitivity: 'accent' },
            ) === 0) {
                return operation;
            }
        }
    }
    return undefined;
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

function resolveSchema(
    swagger: JsonRecord,
    schema: JsonRecord | undefined,
): ResolvedSchema | undefined {
    if (!schema) {
        return undefined;
    }
    const reference = readString(schema.$ref);
    const match = reference?.match(/^#\/definitions\/(.+)$/);
    if (!match) {
        return { schema };
    }
    const name = decodeJsonPointer(match[1]);
    const definition = asRecord(asRecord(swagger.definitions)?.[name]);
    return definition ? { name, schema: definition } : undefined;
}

function parsePropertyType(
    swagger: JsonRecord,
    schema: JsonRecord | undefined,
): ConnectorTriggerOutputPropertyType {
    const resolved = resolveSchema(swagger, schema);
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
        const item = resolveSchema(
            swagger,
            asRecord(resolved?.schema.items),
        );
        const itemType = readScalarType(item?.schema.type);
        return itemType ?
            { kind: 'array', itemType } :
            { kind: 'unknown' };
    }
    if (resolvedType === 'object') {
        const additionalProperties = resolveSchema(
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

function decodeJsonPointer(value: string): string {
    return value.replace(/~1/g, '/').replace(/~0/g, '~');
}

function asRecord(value: unknown): JsonRecord | undefined {
    return value &&
        typeof value === 'object' &&
        !Array.isArray(value) ?
        value as JsonRecord :
        undefined;
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}
