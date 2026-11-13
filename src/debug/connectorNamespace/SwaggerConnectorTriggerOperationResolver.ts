/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import {
    findSwaggerOperation,
    getSwaggerOperationParameters,
    resolveSwaggerSchema,
    unwrapConnectorSwagger,
    type SwaggerOperation,
    type SwaggerOperationMethod,
} from '../../connectorTrigger/connectorTriggerSwagger';
import { asRecord, equalsIgnoreCase, isRecord, readString } from '../../connectorTrigger/connectorTriggerUtils';
import { isConnectorBuiltInTextSuggestion, parseConnectorSwaggerInputs } from './connectorTriggerInputs';
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
    /** Query of the operation's `x-ms-paths` key; values can contain `{parameter}` placeholders. */
    queries?: Record<string, string>;
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
        const swagger = unwrapConnectorSwagger(await this.swaggerProvider.getSwagger(context, request));
        if (!swagger) {
            throw invalidEventDefinition();
        }

        const target = findSwaggerOperation(swagger, request.target.operationId);
        const parsedInputs = parseConnectorSwaggerInputs(swagger, request.target.operationId);
        if (!target || !parsedInputs) {
            throw invalidEventDefinition();
        }
        const rawParameters = getOperationParameters(swagger, target);
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
            label: readString(target.operation.summary),
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
    const fillPlaceholders = (template: string, encode: (value: string) => string): string =>
        template.replace(/\{([^}]+)\}/g, (_match, parameterName: string) => {
            consumed.add(parameterName);
            const value = parameters[parameterName];
            if (value === undefined) {
                throw missingDynamicDependency();
            }
            return encode(value);
        });
    const path = fillPlaceholders(spec.path, encodeURIComponent);
    // The query of an x-ms-paths key selects the operation, so it wins over a parameter of the same name.
    const keyQueries = Object.fromEntries(Object.entries(spec.queries ?? {}).map(([name, template]) =>
        [name, fillPlaceholders(template, value => value)]));
    const queries = {
        ...Object.fromEntries(Object.entries(parameters).filter(([name]) => !consumed.has(name))),
        ...keyQueries,
    };

    return {
        request: {
            method: spec.method,
            path,
            ...(Object.keys(queries).length ? { queries } : {}),
        },
    };
}

/** Returns the operation's effective parameters; a malformed parameter declaration makes the event definition invalid. */
function getOperationParameters(swagger: JsonRecord, target: SwaggerOperation): JsonRecord[] {
    for (const declared of [target.pathItem.parameters, target.operation.parameters]) {
        if (declared !== undefined && (!Array.isArray(declared) || !declared.every(isRecord))) {
            throw invalidEventDefinition();
        }
    }
    const parameters = getSwaggerOperationParameters(swagger, target);
    if (parameters.some(parameter => parameter.$ref !== undefined || !readString(parameter.name))) {
        throw invalidEventDefinition();
    }
    return parameters;
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

/** Resolves a schema reference; an unresolvable reference makes the event definition invalid. */
function resolveSchema(schema: JsonRecord | undefined, swagger: JsonRecord): JsonRecord | undefined {
    const resolved = resolveSwaggerSchema(swagger, schema);
    if (schema && !resolved) {
        throw invalidEventDefinition();
    }
    return resolved?.schema;
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

    const target = findSwaggerOperation(swagger, operationId);
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
    // An x-ms-paths key can carry a query string, which must be sent as queries rather than in the path.
    const queryIndex = target.path.indexOf('?');
    const path = queryIndex < 0 ? target.path : target.path.slice(0, queryIndex);
    const queries = queryIndex < 0 ? {} : Object.fromEntries(new URLSearchParams(target.path.slice(queryIndex + 1)));

    return {
        method: target.method.toUpperCase() as Uppercase<SwaggerOperationMethod>,
        path: stripConnectionIdPrefix(path),
        queries: Object.keys(queries).length ? queries : undefined,
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
