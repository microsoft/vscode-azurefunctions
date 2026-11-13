/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type ConnectorTriggerInputType = 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string';

interface ConnectorTriggerInputOption {
    label: string;
    value: string;
}

interface ConnectorTriggerInputDefinition {
    name: string;
    label: string;
    description?: string;
    type: ConnectorTriggerInputType;
    format?: string;
    required: boolean;
    defaultValue?: string | number | boolean;
    options?: ConnectorTriggerInputOption[];
    dynamic: boolean;
    sensitive: boolean;
    visibility?: string;
}

type JsonRecord = Record<string, unknown>;

const operationMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

export function parseConnectorInputsDefinition(
    inputsDefinition: unknown,
): ConnectorTriggerInputDefinition[] | undefined {
    const definition = asRecord(inputsDefinition);
    if (!definition) {
        return undefined;
    }

    if (Array.isArray(definition.parameters)) {
        return parseOperationParameters(definition.parameters, {}, {});
    }

    const definitions = asRecord(definition.definitions) ?? {};
    const resolved = resolveSchemaRef(definition, definitions);
    if (!resolved) {
        return undefined;
    }

    const parameterContainer = getSingleParameterContainer(resolved, definitions);
    if (!asRecord(parameterContainer.properties)) {
        return undefined;
    }
    return flattenSchema(parameterContainer, definitions);
}

export function parseConnectorSwaggerInputs(
    swaggerValue: unknown,
    operationId: string,
): ConnectorTriggerInputDefinition[] | undefined {
    const wrapper = asRecord(swaggerValue);
    const swagger = asRecord(wrapper?.paths) ?
        wrapper :
        asRecord(asRecord(wrapper?.properties)?.swagger);
    const paths = asRecord(swagger?.paths);
    if (!swagger || !paths) {
        return undefined;
    }

    const definitions = asRecord(swagger.definitions) ?? {};
    const topLevelParameters = asRecord(swagger.parameters) ?? {};
    for (const pathItemValue of Object.values(paths)) {
        const pathItem = asRecord(pathItemValue);
        if (!pathItem) {
            continue;
        }

        for (const method of operationMethods) {
            const operation = asRecord(pathItem[method]);
            if (!operation ||
                typeof operation.operationId !== 'string' ||
                !equalsIgnoreCase(operation.operationId, operationId)) {
                continue;
            }

            const parameters = new Map<string, JsonRecord>();
            for (const parameterValue of [
                ...Array.isArray(pathItem.parameters) ? pathItem.parameters : [],
                ...Array.isArray(operation.parameters) ? operation.parameters : [],
            ]) {
                const parameter = resolveParameterRef(parameterValue, topLevelParameters);
                if (parameter) {
                    const key = JSON.stringify([readString(parameter.in)?.toLowerCase(), readString(parameter.name)]);
                    parameters.set(key, parameter);
                }
            }
            return parseOperationParameters([...parameters.values()], definitions, topLevelParameters);
        }
    }

    return undefined;
}

function parseOperationParameters(
    parameterValues: unknown[],
    definitions: JsonRecord,
    topLevelParameters: JsonRecord,
): ConnectorTriggerInputDefinition[] {
    const inputs: ConnectorTriggerInputDefinition[] = [];
    for (const parameterValue of parameterValues) {
        const parameter = resolveParameterRef(parameterValue, topLevelParameters);
        if (!parameter || shouldHide(parameter)) {
            continue;
        }

        const name = readString(parameter.name);
        const location = readString(parameter.in)?.toLowerCase();
        if (!name ||
            name === 'connectionId' ||
            parameter['x-ms-notification-url'] === true ||
            location === 'header') {
            continue;
        }

        const schema = resolveSchemaRef(asRecord(parameter.schema), definitions);
        if (location === 'body' && schema) {
            if (asRecord(schema.properties)) {
                inputs.push(...flattenSchema(
                    schema,
                    definitions,
                    '',
                    parameter.required === true,
                    hasDynamicMetadata(parameter) || hasDynamicMetadata(schema),
                ));
            } else {
                inputs.push(createInputDefinition(
                    name,
                    schema,
                    parameter.required === true,
                    parameter,
                ));
            }
            continue;
        }

        inputs.push(createInputDefinition(
            name,
            schema ?? parameter,
            parameter.required === true,
            parameter,
        ));
    }

    return inputs;
}

function flattenSchema(
    schema: JsonRecord,
    definitions: JsonRecord,
    prefix = '',
    parentRequired = true,
    parentDynamic = false,
    parentVisibility?: string,
): ConnectorTriggerInputDefinition[] {
    const properties = asRecord(schema.properties);
    if (!properties) {
        return [];
    }

    const required = new Set(readStringArray(schema.required));
    const result: ConnectorTriggerInputDefinition[] = [];
    for (const [propertyName, propertyValue] of Object.entries(properties)) {
        const property = resolveSchemaRef(asRecord(propertyValue), definitions);
        if (!property || shouldHide(property)) {
            continue;
        }

        const name = prefix ? `${prefix}.${propertyName}` : propertyName;
        const isRequired = parentRequired && required.has(propertyName);
        const isDynamic = parentDynamic || hasDynamicMetadata(property);
        const visibility = combineVisibility(
            readVisibility(property),
            parentVisibility,
        );
        if (normalizeType(property.type) === 'object' && asRecord(property.properties)) {
            result.push(...flattenSchema(
                property,
                definitions,
                name,
                isRequired,
                isDynamic,
                visibility,
            ));
        } else {
            result.push(createInputDefinition(
                name,
                property,
                isRequired,
                undefined,
                isDynamic,
                visibility,
            ));
        }
    }

    return result;
}

function createInputDefinition(
    name: string,
    schema: JsonRecord,
    required: boolean,
    parameter?: JsonRecord,
    dynamic = false,
    inheritedVisibility?: string,
): ConnectorTriggerInputDefinition {
    const sensitive = isSensitive(schema) || !!parameter && isSensitive(parameter);
    const options = parseOptions(schema, parameter);
    const visibility = combineVisibility(
        readVisibility(parameter),
        combineVisibility(readVisibility(schema), inheritedVisibility),
    );
    const defaultValue = sensitive ?
        undefined :
        readPrimitive(schema.default) ?? readPrimitive(parameter?.default);

    return {
        name,
        label: readString(parameter?.['x-ms-summary']) ||
            readString(schema['x-ms-summary']) ||
            readString(schema.title) ||
            humanize(name.split('.').pop() ?? name),
        description: readString(parameter?.description) || readString(schema.description),
        type: normalizeType(schema.type ?? parameter?.type),
        format: readString(schema.format) || readString(parameter?.format),
        required,
        defaultValue,
        options,
        dynamic: dynamic || hasDynamicMetadata(parameter) || hasDynamicMetadata(schema),
        sensitive,
        ...(visibility ? { visibility } : {}),
    };
}

function parseOptions(
    schema: JsonRecord,
    parameter?: JsonRecord,
): ConnectorTriggerInputOption[] | undefined {
    const values = Array.isArray(schema.enum) ?
        schema.enum :
        Array.isArray(parameter?.enum) ? parameter.enum : undefined;
    if (!values || values.length === 0) {
        return undefined;
    }

    const enumMetadata = Array.isArray(schema['x-ms-enum-values']) ?
        schema['x-ms-enum-values'] :
        Array.isArray(parameter?.['x-ms-enum-values']) ?
            parameter['x-ms-enum-values'] :
            [];

    return values.flatMap(value => {
        const primitive = readPrimitive(value);
        if (primitive === undefined) {
            return [];
        }

        const stringValue = String(primitive);
        const metadata = enumMetadata
            .map(asRecord)
            .find(item => item && String(readPrimitive(item.value)) === stringValue);
        return [{
            value: stringValue,
            label: readString(metadata?.displayName) ||
                readString(metadata?.name) ||
                stringValue,
        }];
    });
}

function getSingleParameterContainer(
    schema: JsonRecord,
    definitions: JsonRecord,
): JsonRecord {
    const properties = asRecord(schema.properties);
    if (!properties || Object.keys(properties).length !== 1) {
        return schema;
    }

    const parameters = resolveSchemaRef(asRecord(properties.parameters), definitions);
    return parameters && asRecord(parameters.properties) ? parameters : schema;
}

function resolveParameterRef(
    parameterValue: unknown,
    topLevelParameters: JsonRecord,
): JsonRecord | undefined {
    const parameter = asRecord(parameterValue);
    const reference = readString(parameter?.$ref);
    if (!reference) {
        return parameter;
    }

    const match = reference.match(/^#\/parameters\/(.+)$/);
    return match?.[1] ? asRecord(topLevelParameters[match[1]]) ?? parameter : parameter;
}

function resolveSchemaRef(
    schema: JsonRecord | undefined,
    definitions: JsonRecord,
    depth = 0,
): JsonRecord | undefined {
    if (!schema || depth > 10) {
        return undefined;
    }

    const reference = readString(schema.$ref);
    if (!reference) {
        return schema;
    }

    const match = reference.match(/^#\/definitions\/(.+)$/);
    const definition = match?.[1] ? asRecord(definitions[match[1]]) : undefined;
    return definition ? resolveSchemaRef(definition, definitions, depth + 1) : schema;
}

function shouldHide(value: JsonRecord): boolean {
    const visibility = readVisibility(value)?.toLowerCase() ?? '';
    return value.hideInUI === true ||
        visibility === 'internal' ||
        visibility === 'hideinui' ||
        value.readOnly === true;
}

function readVisibility(value: JsonRecord | undefined): string | undefined {
    return readString(value?.['x-ms-visibility']) ||
        readString(value?.['x-ms-visiblity']);
}

function combineVisibility(
    visibility: string | undefined,
    inheritedVisibility: string | undefined,
): string | undefined {
    if (visibility?.toLowerCase() === 'important' ||
        inheritedVisibility?.toLowerCase() === 'important') {
        return 'important';
    }

    return visibility || inheritedVisibility;
}

export function isConnectorBuiltInTextSuggestion(value: unknown): boolean {
    const parameter = asRecord(value);
    const descriptor = asRecord(parameter?.['x-ms-dynamic-values']);
    const parameters = asRecord(descriptor?.parameters);
    // Designer address suggestions do not define a connector operation; their input remains a string.
    return (parameter?.type === 'string' || asRecord(parameter?.schema)?.type === 'string') &&
        descriptor?.builtInOperation === 'AadGraph.GetUsers' &&
        descriptor.operationId === undefined &&
        descriptor.dynamicState === undefined &&
        descriptor['value-path'] === 'mail' &&
        parameters !== undefined && Object.keys(parameters).length === 0 &&
        !parameter?.['x-ms-dynamic-list'] &&
        !parameter?.['x-ms-dynamic-tree'] &&
        !parameter?.['x-ms-dynamic-schema'] &&
        !parameter?.['x-ms-dynamic-properties'];
}

function hasDynamicMetadata(value: JsonRecord | undefined): boolean {
    return !!value && (
        !!value['x-ms-dynamic-values'] && !isConnectorBuiltInTextSuggestion(value) ||
        !!value['x-ms-dynamic-list'] ||
        !!value['x-ms-dynamic-tree'] ||
        !!value['x-ms-dynamic-schema'] ||
        !!value['x-ms-dynamic-properties']
    );
}

function isSensitive(value: JsonRecord): boolean {
    const format = readString(value.format)?.toLowerCase();
    return value['x-ms-secret'] === true || format === 'password';
}

function normalizeType(value: unknown): ConnectorTriggerInputType {
    switch (readString(value)?.toLowerCase()) {
        case 'array':
            return 'array';
        case 'boolean':
            return 'boolean';
        case 'integer':
            return 'integer';
        case 'number':
            return 'number';
        case 'object':
            return 'object';
        default:
            return 'string';
    }
}

function humanize(value: string): string {
    const normalized = value
        .replace(/_+/g, ' ')
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized ?
        normalized[0].toUpperCase() + normalized.slice(1) :
        value;
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readPrimitive(value: unknown): string | number | boolean | undefined {
    return typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ?
        value :
        undefined;
}

function asRecord(value: unknown): JsonRecord | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ?
        value as JsonRecord :
        undefined;
}

function equalsIgnoreCase(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}
