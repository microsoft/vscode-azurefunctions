/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { isConnectorBuiltInTextSuggestion, parseConnectorSwaggerInputs } from '../../commands/createNewProject/connectorTriggerPicker/connectorTriggerInputs';
import { localize } from '../../localize';
import { ConnectorTriggerF5SetupError } from './connectorTriggerF5Setup';
import {
    type ConnectorTriggerDynamicInvokeRequest,
    type ConnectorTriggerDynamicResolution,
    type ConnectorTriggerGateway,
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerInputOption,
    type ConnectorTriggerOperationDefinition,
    type ConnectorTriggerOperationParameter,
    type ConnectorTriggerOperationResolutionRequest,
    type ConnectorTriggerOperationResolver,
    type ConnectorTriggerParameterValue,
    type ConnectorTriggerSwaggerProvider,
} from './connectorTriggerF5Contracts';

type JsonRecord = Record<string, unknown>;

interface DynamicInvocationSpec {
    method: ConnectorTriggerDynamicInvokeRequest['request']['method'];
    path: string;
    parameterLiterals?: Record<string, string>;
    parameterMap?: Record<string, string>;
    selectedItemMap?: Record<string, string>;
    collectionPath: string;
    valuePath: string;
    labelPath: string;
    isParentExpression?: string;
}

type DynamicInputMetadata =
    | {
        kind: 'tree';
        open: DynamicInvocationSpec;
        browse?: DynamicInvocationSpec;
        canSelectParentNodes: boolean;
        canSelectLeafNodes: boolean;
    }
    | {
        kind: 'values';
        invocation: DynamicInvocationSpec;
    };

interface OperationMetadata {
    swagger: JsonRecord;
}

export class SwaggerConnectorTriggerOperationResolver implements ConnectorTriggerOperationResolver {
    public constructor(
        private readonly gateway: ConnectorTriggerGateway,
        private readonly swaggerProvider: ConnectorTriggerSwaggerProvider,
    ) { }

    public async resolveOperation(
        context: IActionContext,
        request: ConnectorTriggerOperationResolutionRequest,
    ): Promise<ConnectorTriggerOperationDefinition> {
        const response = asRecord(await this.swaggerProvider.getSwagger(context, request));
        const swagger = asRecord(asRecord(response?.properties)?.swagger) ?? response;
        if (!swagger) {
            throw invalidEventDefinition();
        }

        const parsedInputs = parseConnectorSwaggerInputs(swagger, request.target.operationId);
        const rawParameters = getOperationParameters(swagger, request.target.operationId);
        if (!parsedInputs) {
            throw invalidEventDefinition();
        }
        const inputNames = new Set<string>();
        const inputs = parsedInputs.map((input): ConnectorTriggerInputDefinition => {
            if (inputNames.has(input.name)) {
                throw invalidEventDefinition();
            }
            inputNames.add(input.name);
            const rawParameter = getInputMetadata(rawParameters, input.name, swagger);
            const dynamicMetadata = rawParameter ? getDynamicInputMetadata(rawParameter, swagger) : undefined;
            if (input.dynamic && !dynamicMetadata && !isConnectorBuiltInTextSuggestion(rawParameter)) {
                throw unsupportedDynamicMetadata();
            }
            return {
                name: input.name,
                label: input.label,
                description: input.description,
                type: input.type,
                required: input.required,
                visibility: normalizeVisibility(input.visibility),
                sensitive: input.sensitive,
                defaultValue: input.defaultValue,
                options: input.options?.map(option => ({
                    label: option.label,
                    value: parseOptionValue(option.value, input.type),
                })),
                dynamic: dynamicMetadata ? {
                    kind: dynamicMetadata.kind,
                    metadata: dynamicMetadata,
                } : undefined,
                metadata: rawParameter,
            } satisfies ConnectorTriggerInputDefinition;
        });
        for (const input of inputs) {
            const dynamic = input.dynamic;
            if (!dynamic) {
                continue;
            }
            const metadata = asDynamicInputMetadata(dynamic.metadata);
            if (!metadata) {
                throw unsupportedDynamicMetadata();
            }
            const invocations = metadata.kind === 'tree' ?
                [metadata.open, ...(metadata.browse ? [metadata.browse] : [])] :
                [metadata.invocation];
            for (const invocation of invocations) {
                const parameterMap = invocation.parameterMap;
                for (const [name, reference] of Object.entries(parameterMap ?? {})) {
                    const matches = inputs.filter(candidate =>
                        candidate.name === reference ||
                        candidate.name === reference.replace(/\//g, '.') ||
                        rawParameters.some(parameter =>
                            parameter.in === 'body' &&
                            reference.startsWith(`${readString(parameter.name)}/`) &&
                            candidate.name === reference.substring(String(parameter.name).length + 1).replace(/\//g, '.')));
                    if (matches.length !== 1) {
                        throw unsupportedDynamicMetadata();
                    }
                    if (parameterMap) {
                        parameterMap[name] = matches[0].name;
                    }
                }
            }
            dynamic.dependsOn = getDynamicDependencies(metadata);
        }

        return {
            inputs,
            label: readString(findOperation(swagger, request.target.operationId)?.operation.summary),
            connectorLabel: readString(asRecord(swagger.info)?.title),
            metadata: { swagger } satisfies OperationMetadata,
        };
    }

    public async resolveDynamicInput(
        context: IActionContext,
        request: Parameters<ConnectorTriggerOperationResolver['resolveDynamicInput']>[1],
    ): Promise<ConnectorTriggerDynamicResolution> {
        const metadata = asDynamicInputMetadata(request.input.dynamic?.metadata);
        const invocation = metadata?.kind === 'tree' ?
            request.parent ? metadata.browse : metadata.open :
            metadata?.invocation;
        if (!invocation) {
            throw unsupportedDynamicMetadata();
        }

        const response = await this.gateway.dynamicInvoke(
            context,
            request.target,
            request.namespace,
            request.connection,
            buildConnectorDynamicInvokeRequest(invocation, request.values, request.parent?.metadata),
        );
        return {
            options: projectDynamicOptions(response, invocation, metadata?.kind === 'tree' ? metadata : undefined),
        };
    }

    public serializeParameters(
        _operation: ConnectorTriggerOperationDefinition,
        inputs: readonly ConnectorTriggerInputDefinition[],
        values: Readonly<Record<string, ConnectorTriggerParameterValue>>,
    ): ConnectorTriggerOperationParameter[] {
        const allowedNames = new Set(inputs.map(input => input.name));
        return Object.entries(values).flatMap(([name, value]) =>
            allowedNames.has(name) ? [{ name, value }] : []);
    }
}

export function buildConnectorDynamicInvokeRequest(
    spec: DynamicInvocationSpec,
    values: Readonly<Record<string, ConnectorTriggerParameterValue>>,
    selectedItem?: unknown,
): ConnectorTriggerDynamicInvokeRequest {
    const parameters: Record<string, string> = { ...spec.parameterLiterals };
    for (const [targetName, sourceName] of Object.entries(spec.parameterMap ?? {})) {
        const value = getByPath(values, sourceName);
        if (!isPrimitive(value)) {
            throw missingDynamicDependency();
        }
        parameters[targetName] = String(value);
    }
    for (const [targetName, sourcePath] of Object.entries(spec.selectedItemMap ?? {})) {
        const value = getByPath(selectedItem, sourcePath);
        if (!isPrimitive(value)) {
            throw invalidDynamicResponse();
        }
        parameters[targetName] = String(value);
    }

    const consumed = new Set<string>();
    const path = spec.path.replace(/\{([^}]+)\}/g, (_match, parameterName: string) => {
        consumed.add(parameterName);
        const value = parameters[parameterName];
        if (value === undefined) {
            throw missingDynamicDependency();
        }
        return encodeURIComponent(value);
    });
    const queries = Object.fromEntries(
        Object.entries(parameters).filter(([name]) => !consumed.has(name)),
    );

    return {
        request: {
            method: spec.method,
            path,
            ...(Object.keys(queries).length ? { queries } : {}),
        },
    };
}

function getOperationParameters(swagger: JsonRecord, operationId: string): JsonRecord[] {
    const operation = findOperation(swagger, operationId)?.operation;
    if (!operation ||
        operation.parameters !== undefined && !Array.isArray(operation.parameters)) {
        throw invalidEventDefinition();
    }
    const topLevelParameters = asRecord(swagger.parameters) ?? {};
    return Array.isArray(operation.parameters) ?
        operation.parameters.map(parameter => {
            const record = asRecord(parameter);
            const reference = readString(record?.$ref)?.match(/^#\/parameters\/(.+)$/)?.[1];
            const resolved = reference ? asRecord(topLevelParameters[reference]) : record;
            if (!resolved || !readString(resolved.name) || record?.$ref && !reference) {
                throw invalidEventDefinition();
            }
            return resolved;
        }) :
        [];
}

function getInputMetadata(
    parameters: readonly JsonRecord[],
    inputName: string,
    swagger: JsonRecord,
): JsonRecord | undefined {
    const parameter = parameters.find(candidate =>
        equalsIgnoreCase(readString(candidate.name), inputName));
    if (parameter) {
        return { ...resolveSchema(asRecord(parameter.schema), swagger), ...parameter };
    }
    for (const body of parameters.filter(candidate => candidate.in === 'body')) {
        let schema = resolveSchema(asRecord(body.schema), swagger);
        for (const segment of inputName.split('.')) {
            schema = resolveSchema(asRecord(asRecord(schema?.properties)?.[segment]), swagger);
        }
        if (schema) {
            return schema;
        }
    }
    return undefined;
}

function resolveSchema(schema: JsonRecord | undefined, swagger: JsonRecord): JsonRecord | undefined {
    const seen = new Set<string>();
    while (typeof schema?.$ref === 'string') {
        const reference = schema.$ref;
        if (!reference.startsWith('#/') || seen.has(reference)) {
            throw invalidEventDefinition();
        }
        seen.add(reference);
        schema = asRecord(getByPath(swagger, reference.substring(2)));
        if (!schema) {
            throw invalidEventDefinition();
        }
    }
    return schema;
}

function getDynamicInputMetadata(parameter: JsonRecord, swagger: JsonRecord): DynamicInputMetadata | undefined {
    if (isConnectorBuiltInTextSuggestion(parameter)) {
        return undefined;
    }
    const tree = asRecord(parameter['x-ms-dynamic-tree']);
    if (tree) {
        const open = createInvocationSpec(asRecord(tree.open), tree, swagger);
        const browse = createInvocationSpec(asRecord(tree.browse), tree, swagger);
        if (open) {
            const settings = asRecord(tree.settings);
            return {
                kind: 'tree',
                open,
                ...(browse ? { browse } : {}),
                canSelectParentNodes: settings?.canSelectParentNodes !== false,
                canSelectLeafNodes: settings?.canSelectLeafNodes !== false,
            };
        }
    }

    const descriptor = asRecord(parameter['x-ms-dynamic-list']) ??
        asRecord(parameter['x-ms-dynamic-values']);
    const invocation = createInvocationSpec(descriptor, descriptor, swagger);
    return invocation ? { kind: 'values', invocation } : undefined;
}

function createInvocationSpec(
    descriptor: JsonRecord | undefined,
    defaults: JsonRecord | undefined,
    swagger: JsonRecord,
): DynamicInvocationSpec | undefined {
    if (!descriptor) {
        return undefined;
    }

    const dynamicState = asRecord(descriptor.dynamicState);
    const dynamicExtension = asRecord(dynamicState?.extension);
    const operationId = readString(descriptor.operationId) ??
        readString(dynamicState?.operationId) ??
        readString(dynamicExtension?.operationId);
    if (!operationId) {
        throw unsupportedDynamicMetadata();
    }

    const target = findOperation(swagger, operationId);
    if (!target) {
        throw unsupportedDynamicMetadata();
    }

    const parameterMappings = asRecord(descriptor.parameters) ??
        asRecord(dynamicState?.parameters) ??
        asRecord(dynamicExtension?.parameters);
    const { literals, parameterMap, selectedItemMap } = parseParameterMappings(parameterMappings);
    const valuePath = readString(descriptor.itemValuePath) ??
        readString(descriptor.valuePath) ??
        readString(descriptor['value-path']) ??
        readString(defaults?.itemValuePath) ??
        readString(defaults?.['value-property']) ??
        '';

    return {
        method: target.method,
        path: stripConnectionIdPrefix(target.path),
        parameterLiterals: Object.keys(literals).length ? literals : undefined,
        parameterMap: Object.keys(parameterMap).length ? parameterMap : undefined,
        selectedItemMap: Object.keys(selectedItemMap).length ? selectedItemMap : undefined,
        collectionPath: readString(descriptor.itemsPath) ??
            readString(descriptor.valueCollection) ??
            readString(descriptor['value-collection']) ??
            readString(defaults?.itemsPath) ??
            readString(defaults?.['value-collection']) ??
            '',
        valuePath,
        labelPath: readString(descriptor.itemTitlePath) ??
            readString(descriptor.valueTitle) ??
            readString(descriptor['value-title']) ??
            readString(defaults?.itemTitlePath) ??
            readString(defaults?.['value-title']) ??
            valuePath,
        isParentExpression: readString(descriptor.itemIsParent) ?? readString(defaults?.itemIsParent),
    };
}

function parseParameterMappings(parameters: JsonRecord | undefined): {
    literals: Record<string, string>;
    parameterMap: Record<string, string>;
    selectedItemMap: Record<string, string>;
} {
    const literals: Record<string, string> = {};
    const parameterMap: Record<string, string> = {};
    const selectedItemMap: Record<string, string> = {};
    for (const [targetName, mapping] of Object.entries(parameters ?? {})) {
        const record = asRecord(mapping);
        const sourceName = readString(record?.parameter) ?? readString(record?.parameterReference);
        const selectedItemPath = readString(record?.selectedItemValuePath) ?? readString(record?.['value-property']);
        if (selectedItemPath) {
            selectedItemMap[targetName] = selectedItemPath;
        } else if (sourceName) {
            parameterMap[targetName] = sourceName;
        } else if (record && 'value' in record && isPrimitive(record.value)) {
            literals[targetName] = String(record.value);
        } else if (isPrimitive(mapping)) {
            const reference = typeof mapping === 'string' ? mapping.match(/^\{(.+)\}$/)?.[1] : undefined;
            if (reference) {
                parameterMap[targetName] = reference;
            } else {
                literals[targetName] = String(mapping);
            }
        } else {
            throw unsupportedDynamicMetadata();
        }
    }
    return { literals, parameterMap, selectedItemMap };
}

function findOperation(
    swagger: JsonRecord,
    operationId: string,
): {
    method: ConnectorTriggerDynamicInvokeRequest['request']['method'];
    path: string;
    operation: JsonRecord;
} | undefined {
    const paths = asRecord(swagger.paths);
    for (const [path, pathItemValue] of Object.entries(paths ?? {})) {
        const pathItem = asRecord(pathItemValue);
        for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
            const operation = asRecord(pathItem?.[method]);
            if (equalsIgnoreCase(readString(operation?.operationId), operationId)) {
                return {
                    method: method.toUpperCase() as Uppercase<typeof method>,
                    path,
                    operation: operation ?? {},
                };
            }
        }
    }
    return undefined;
}

function projectDynamicOptions(
    response: unknown,
    spec: DynamicInvocationSpec,
    tree?: Extract<DynamicInputMetadata, { kind: 'tree' }>,
): ConnectorTriggerInputOption[] {
    const root = unwrapDynamicInvokeResponse(response);
    const collection = getByPath(root, spec.collectionPath);
    if (!Array.isArray(collection)) {
        throw invalidDynamicResponse();
    }

    return collection.map(item => {
        const value = getByPath(item, spec.valuePath);
        const label = getByPath(item, spec.labelPath);
        if (!isPrimitive(value) || !isPrimitive(label)) {
            throw invalidDynamicResponse();
        }
        const hasChildren = tree?.browse ? isParentItem(item, spec.isParentExpression) : undefined;
        return {
            label: String(label),
            value,
            ...(hasChildren !== undefined ? {
                hasChildren,
                selectable: hasChildren ? tree?.canSelectParentNodes : tree?.canSelectLeafNodes,
                metadata: item,
            } : {}),
        };
    });
}

function isParentItem(item: unknown, expression: string | undefined): boolean {
    if (!expression) {
        throw unsupportedDynamicMetadata();
    }
    const comparison = expression.match(/^\(?\s*([\w/.]+)\s+eq\s+(true|false)\s*\)?$/i);
    const value = getByPath(item, comparison?.[1] ?? expression);
    if (typeof value !== 'boolean') {
        throw invalidDynamicResponse();
    }
    return comparison ? value === (comparison[2].toLowerCase() === 'true') : value;
}

function unwrapDynamicInvokeResponse(response: unknown): unknown {
    const outer = asRecord(response);
    const nestedResponse = asRecord(outer?.response);
    const statusCode = nestedResponse?.statusCode ?? outer?.statusCode;
    if (statusCode !== undefined && statusCode !== 'OK' &&
        (!/^\d{3}$/.test(String(statusCode)) || Number(statusCode) < 200 || Number(statusCode) >= 300)) {
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorDynamicInvokeFailed',
            'The connector could not resolve this parameter.',
        ));
    }

    const body = nestedResponse?.body ?? outer?.body ?? nestedResponse ?? response;
    if (typeof body === 'string') {
        try {
            return JSON.parse(body) as unknown;
        } catch {
            throw invalidDynamicResponse();
        }
    }
    return body;
}

function getDynamicDependencies(metadata: DynamicInputMetadata): string[] | undefined {
    const invocations = metadata.kind === 'tree' ?
        [metadata.open, ...(metadata.browse ? [metadata.browse] : [])] :
        [metadata.invocation];
    const dependencies = [...new Set(invocations.flatMap(invocation => Object.values(invocation.parameterMap ?? {})))];
    return dependencies.length ? dependencies : undefined;
}

function normalizeVisibility(value: string | undefined): ConnectorTriggerInputDefinition['visibility'] {
    switch (value?.toLowerCase()) {
        case 'important':
            return 'important';
        case 'advanced':
            return 'advanced';
        case 'internal':
        case 'hideinui':
            return 'hidden';
        default:
            return 'default';
    }
}

function asDynamicInputMetadata(value: unknown): DynamicInputMetadata | undefined {
    const record = asRecord(value);
    if (record?.kind === 'tree' && asRecord(record.open)) {
        return value as DynamicInputMetadata;
    }
    if (record?.kind === 'values' && asRecord(record.invocation)) {
        return value as DynamicInputMetadata;
    }
    return undefined;
}

function stripConnectionIdPrefix(path: string): string {
    if (path.toLowerCase() === '/{connectionid}') {
        return '/';
    }
    return path.toLowerCase().startsWith('/{connectionid}/') ?
        path.substring('/{connectionId}'.length) :
        path;
}

function getByPath(value: unknown, path: string): unknown {
    const root = asRecord(value);
    if (root && Object.prototype.hasOwnProperty.call(root, path)) {
        return root[path];
    }
    let current = value;
    for (const part of path.split(path.includes('/') ? '/' : '.').filter(Boolean)) {
        const segment = part.replace(/~1/g, '/').replace(/~0/g, '~');
        const record = asRecord(current);
        if (!record || !Object.prototype.hasOwnProperty.call(record, segment)) {
            return undefined;
        }
        current = record[segment];
    }
    return current;
}

function isPrimitive(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function equalsIgnoreCase(left: string | undefined, right: string): boolean {
    return typeof left === 'string' && left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function asRecord(value: unknown): JsonRecord | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ?
        value as JsonRecord :
        undefined;
}

function parseOptionValue(value: string, type: ConnectorTriggerInputDefinition['type']): ConnectorTriggerParameterValue {
    if (type === 'boolean' && (value === 'true' || value === 'false')) {
        return value === 'true';
    }
    if ((type === 'integer' || type === 'number') && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return value;
}

function invalidEventDefinition(): Error {
    return new ConnectorTriggerF5SetupError(undefined, localize(
        'connectorEventDefinitionUnavailable',
        'The selected connector event definition or its parameters are unavailable. Reload the event metadata and retry debugging.',
    ));
}

function unsupportedDynamicMetadata(): Error {
    return new ConnectorTriggerF5SetupError(undefined, localize(
        'connectorDynamicMetadataUnsupported',
        'The connector parameter uses missing or unsupported dynamic metadata. Check the selected event definition before retrying debugging.',
    ));
}

function missingDynamicDependency(): Error {
    return new ConnectorTriggerF5SetupError(undefined, localize(
        'connectorDynamicDependencyMissing',
        'A connector parameter dependency has no supported value. Configure its required inputs before loading dynamic values.',
    ));
}

function invalidDynamicResponse(): Error {
    return new ConnectorTriggerF5SetupError(undefined, localize(
        'connectorDynamicResponseInvalid',
        'The connector returned an invalid parameter values response. Check the connection and retry debugging.',
    ));
}
