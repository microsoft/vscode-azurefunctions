/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { parseConnectorSwaggerInputs } from '../../commands/createNewProject/connectorTriggerPicker/connectorTriggerInputs';
import { localize } from '../../localize';
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
    method: string;
    path: string;
    parameterLiterals?: Record<string, string>;
    parameterMap?: Record<string, string>;
    collectionPath: string;
    valuePath: string;
    labelPath: string;
}

type DynamicInputMetadata =
    | {
        kind: 'tree';
        open: DynamicInvocationSpec;
        browse?: DynamicInvocationSpec;
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
            throw new Error(localize(
                'invalidConnectorSwagger',
                'Azure did not return a valid connector definition.',
            ));
        }

        const parsedInputs = parseConnectorSwaggerInputs(swagger, request.handoff.operationId);
        const rawParameters = getOperationParameters(swagger, request.handoff.operationId);
        const inputs = (parsedInputs ?? []).map(input => {
            const rawParameter = rawParameters.find(parameter =>
                equalsIgnoreCase(readString(parameter.name), input.name));
            const dynamicMetadata = rawParameter ? getDynamicInputMetadata(rawParameter, swagger) : undefined;
            return {
                name: input.name,
                label: input.label,
                description: input.description,
                type: input.type,
                required: input.required,
                visibility: normalizeVisibility(input.visibility),
                sensitive: input.sensitive,
                defaultValue: input.defaultValue,
                options: input.options,
                dynamic: dynamicMetadata ? {
                    kind: dynamicMetadata.kind,
                    dependsOn: getDynamicDependencies(dynamicMetadata),
                    metadata: dynamicMetadata,
                } : undefined,
                metadata: rawParameter,
            } satisfies ConnectorTriggerInputDefinition;
        });

        return {
            inputs,
            metadata: { swagger } satisfies OperationMetadata,
        };
    }

    public async resolveDynamicInput(
        context: IActionContext,
        request: Parameters<ConnectorTriggerOperationResolver['resolveDynamicInput']>[1],
    ): Promise<ConnectorTriggerDynamicResolution> {
        const metadata = asDynamicInputMetadata(request.input.dynamic?.metadata);
        const invocation = metadata?.kind === 'tree' ? metadata.open : metadata?.invocation;
        if (!invocation) {
            return {};
        }

        const response = await this.gateway.dynamicInvoke(
            context,
            request.handoff,
            request.namespace,
            request.connection,
            buildConnectorDynamicInvokeRequest(invocation, request.values),
        );
        return {
            options: projectDynamicOptions(response, invocation),
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
): ConnectorTriggerDynamicInvokeRequest {
    const parameters: Record<string, string> = { ...spec.parameterLiterals };
    for (const [targetName, sourceName] of Object.entries(spec.parameterMap ?? {})) {
        const value = getByPath(values, sourceName);
        if (isPrimitive(value)) {
            parameters[targetName] = String(value);
        }
    }

    const consumed = new Set<string>();
    const path = spec.path.replace(/\{([^}]+)\}/g, (_match, parameterName: string) => {
        consumed.add(parameterName);
        return encodeURIComponent(parameters[parameterName] ?? '');
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
    const topLevelParameters = asRecord(swagger.parameters) ?? {};
    return Array.isArray(operation?.parameters) ?
        operation.parameters.flatMap(parameter => {
            const record = asRecord(parameter);
            const reference = readString(record?.$ref)?.match(/^#\/parameters\/(.+)$/)?.[1];
            return [reference ? asRecord(topLevelParameters[reference]) ?? record : record].filter(isDefined);
        }) :
        [];
}

function getDynamicInputMetadata(parameter: JsonRecord, swagger: JsonRecord): DynamicInputMetadata | undefined {
    const tree = asRecord(parameter['x-ms-dynamic-tree']);
    if (tree) {
        const open = createInvocationSpec(asRecord(tree.open), tree, swagger);
        const browse = createInvocationSpec(asRecord(tree.browse), tree, swagger);
        if (open) {
            return {
                kind: 'tree',
                open,
                ...(browse ? { browse } : {}),
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
        return undefined;
    }

    const target = findOperation(swagger, operationId);
    if (!target) {
        return undefined;
    }

    const parameterMappings = asRecord(descriptor.parameters) ??
        asRecord(dynamicState?.parameters) ??
        asRecord(dynamicExtension?.parameters);
    const { literals, parameterMap } = parseParameterMappings(parameterMappings);

    return {
        method: target.method,
        path: stripConnectionIdPrefix(target.path),
        parameterLiterals: Object.keys(literals).length ? literals : undefined,
        parameterMap: Object.keys(parameterMap).length ? parameterMap : undefined,
        collectionPath: readString(descriptor.itemsPath) ??
            readString(descriptor.valueCollection) ??
            readString(descriptor['value-collection']) ??
            readString(defaults?.itemsPath) ??
            readString(defaults?.['value-collection']) ??
            'value',
        valuePath: readString(descriptor.itemValuePath) ??
            readString(descriptor.valuePath) ??
            readString(descriptor['value-path']) ??
            readString(defaults?.itemValuePath) ??
            readString(defaults?.['value-property']) ??
            'id',
        labelPath: readString(descriptor.itemTitlePath) ??
            readString(descriptor.valueTitle) ??
            readString(descriptor['value-title']) ??
            readString(defaults?.itemTitlePath) ??
            readString(defaults?.['value-title']) ??
            readString(descriptor.itemValuePath) ??
            'id',
    };
}

function parseParameterMappings(parameters: JsonRecord | undefined): {
    literals: Record<string, string>;
    parameterMap: Record<string, string>;
} {
    const literals: Record<string, string> = {};
    const parameterMap: Record<string, string> = {};
    for (const [targetName, mapping] of Object.entries(parameters ?? {})) {
        const record = asRecord(mapping);
        const sourceName = readString(record?.parameter) ?? readString(record?.parameterReference);
        if (sourceName) {
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
        }
    }
    return { literals, parameterMap };
}

function findOperation(
    swagger: JsonRecord,
    operationId: string,
): { method: string; path: string; operation: JsonRecord } | undefined {
    const paths = asRecord(swagger.paths);
    for (const [path, pathItemValue] of Object.entries(paths ?? {})) {
        const pathItem = asRecord(pathItemValue);
        for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
            const operation = asRecord(pathItem?.[method]);
            if (equalsIgnoreCase(readString(operation?.operationId), operationId)) {
                return {
                    method: method.toUpperCase(),
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
): ConnectorTriggerInputOption[] {
    const root = unwrapDynamicInvokeResponse(response);
    const collection = getByPath(root, spec.collectionPath);
    if (!Array.isArray(collection)) {
        return [];
    }

    return collection.flatMap(item => {
        const value = getByPath(item, spec.valuePath);
        if (!isPrimitive(value)) {
            return [];
        }
        const label = getByPath(item, spec.labelPath);
        return [{
            label: isPrimitive(label) ? String(label) : String(value),
            value,
        }];
    });
}

function unwrapDynamicInvokeResponse(response: unknown): unknown {
    const outer = asRecord(response);
    const nestedResponse = asRecord(outer?.response);
    const statusCode = nestedResponse?.statusCode ?? outer?.statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400) {
        throw new Error(localize(
            'connectorDynamicInvokeFailed',
            'The connector could not resolve this parameter.',
        ));
    }

    const body = nestedResponse?.body ?? outer?.body ?? nestedResponse ?? response;
    if (typeof body === 'string') {
        try {
            return JSON.parse(body) as unknown;
        } catch {
            return body;
        }
    }
    return body;
}

function getDynamicDependencies(metadata: DynamicInputMetadata): string[] | undefined {
    const invocation = metadata.kind === 'tree' ? metadata.open : metadata.invocation;
    const dependencies = Object.values(invocation.parameterMap ?? {});
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
    let current = value;
    for (const segment of path.split(/[./]/).filter(Boolean)) {
        const record = asRecord(current);
        if (!record) {
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

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}
