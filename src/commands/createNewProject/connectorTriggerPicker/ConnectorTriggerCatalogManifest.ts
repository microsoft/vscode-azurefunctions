/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerInputOption,
    type ConnectorTriggerInputType,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { parseConnectorInputsDefinition } from './connectorTriggerInputs';
import { type ConnectorTriggerCatalog } from './ConnectorTriggerCatalogProvider';

type JsonRecord = Record<string, unknown>;

export interface ConnectorCatalogSnapshotSource {
    catalogApiVersion: string;
    cloud: string;
    kind: 'azure-managed-connectors';
    operationsApiVersion: string;
    region: string;
    swaggerApiVersion: string;
}

export type ConnectorCatalogManifestConversion =
    | { status: 'missing' }
    | { status: 'invalid' }
    | {
        status: 'valid';
        version: string;
        catalog: ConnectorTriggerCatalog;
        source: ConnectorCatalogSnapshotSource;
    };

/**
 * This is the only compatibility boundary for the optional public-manifest contract.
 * Keep aliases here until the checked-in schema type is available from the snapshot lane.
 */
export function convertConnectorCatalogManifest(
    manifestValue: unknown,
): ConnectorCatalogManifestConversion {
    const manifest = asRecord(manifestValue);
    if (!manifest || manifest.connectorCatalog === undefined) {
        return { status: 'missing' };
    }

    const connectorCatalog = asRecord(manifest.connectorCatalog);
    const version = readString(connectorCatalog?.version);
    const source = asRecord(connectorCatalog?.source);
    const catalogApiVersion = readString(source?.catalogApiVersion);
    const cloud = readString(source?.cloud);
    const operationsApiVersion = readString(source?.operationsApiVersion);
    const region = readString(source?.region);
    const swaggerApiVersion = readString(source?.swaggerApiVersion);
    if (!connectorCatalog ||
        !version ||
        !readString(connectorCatalog.generatedAt) ||
        source?.kind !== 'azure-managed-connectors' ||
        !cloud ||
        !region ||
        !catalogApiVersion ||
        !operationsApiVersion ||
        !swaggerApiVersion ||
        !Array.isArray(connectorCatalog.connectors)) {
        return { status: 'invalid' };
    }

    const connectors = new Map<string, ConnectorTriggerOption>();
    const seenConnectorIds = new Set<string>();
    const hiddenConnectorIds = new Set<string>();
    const operations = new Map<string, ConnectorTriggerOperationOption>();
    for (const connectorValue of connectorCatalog.connectors) {
        const connector = asRecord(connectorValue);
        const id = readString(connector?.id);
        const connectorId = id ? normalizeId(id) : undefined;
        const metadataState = readString(connector?.metadataState);
        if (!connector ||
            !id ||
            !connectorId ||
            seenConnectorIds.has(connectorId) ||
            (metadataState !== 'complete' &&
                metadataState !== 'partial' &&
                metadataState !== 'catalogOnly')) {
            return { status: 'invalid' };
        }
        seenConnectorIds.add(connectorId);

        if (shouldHide(connector.visibility)) {
            hiddenConnectorIds.add(connectorId);
            continue;
        }

        const label = readFirstString(
            connector.label,
            connector.displayName,
            connector.name,
        ) ?? id;
        connectors.set(connectorId, {
            id,
            label,
            description: readString(connector.description),
            iconUrl: normalizeIconUrl(readFirstString(
                connector.iconUrl,
                connector.iconUri,
                connector.icon,
            )),
        });

        const nestedOperations = connector.operations ?? connector.triggers;
        if (nestedOperations !== undefined) {
            if (!Array.isArray(nestedOperations) ||
                !addOperations(operations, nestedOperations, hiddenConnectorIds, id)) {
                return { status: 'invalid' };
            }
        }
    }

    if (connectorCatalog.operations !== undefined) {
        if (!Array.isArray(connectorCatalog.operations) ||
            !addOperations(
                operations,
                connectorCatalog.operations,
                hiddenConnectorIds,
            )) {
            return { status: 'invalid' };
        }
    }

    for (const operation of operations.values()) {
        if (!connectors.has(normalizeId(operation.connectorId))) {
            return { status: 'invalid' };
        }
    }

    const connectorIdsWithTriggers = new Set(
        [...operations.values()].map(operation => normalizeId(operation.connectorId)),
    );
    const normalizedConnectors = [...connectors.entries()]
        .filter(([connectorId]) => connectorIdsWithTriggers.has(connectorId))
        .map(([, connector]) => connector)
        .sort(compareConnectors);
    const normalizedOperations = [...operations.values()].sort(compareOperations);

    return {
        status: 'valid',
        version,
        catalog: {
            connectors: normalizedConnectors,
            operations: normalizedOperations,
        },
        source: {
            catalogApiVersion,
            cloud,
            kind: 'azure-managed-connectors',
            operationsApiVersion,
            region,
            swaggerApiVersion,
        },
    };
}

function addOperations(
    operations: Map<string, ConnectorTriggerOperationOption>,
    operationValues: unknown[],
    hiddenConnectorIds: Set<string>,
    nestedConnectorId?: string,
): boolean {
    for (const operationValue of operationValues) {
        const operation = convertOperation(operationValue, nestedConnectorId);
        if (operation === 'hidden') {
            continue;
        }

        if (!operation) {
            return false;
        }

        if (hiddenConnectorIds.has(normalizeId(operation.connectorId))) {
            continue;
        }

        const key = getOperationKey(operation.connectorId, operation.id);
        if (operations.has(key)) {
            return false;
        }

        operations.set(key, operation);
    }

    return true;
}

function convertOperation(
    operationValue: unknown,
    nestedConnectorId?: string,
): ConnectorTriggerOperationOption | 'hidden' | undefined {
    const operation = asRecord(operationValue);
    const id = readFirstString(operation?.id, operation?.operationId);
    const connectorId = nestedConnectorId ?? readString(operation?.connectorId);
    if (!operation || !id || !connectorId) {
        return undefined;
    }

    const declaredConnectorId = readString(operation.connectorId);
    if (nestedConnectorId &&
        declaredConnectorId &&
        normalizeId(nestedConnectorId) !== normalizeId(declaredConnectorId)) {
        return undefined;
    }

    if (shouldHide(operation.visibility)) {
        return 'hidden';
    }

    const delivery = readDeliveryClassification(operation);
    if (!delivery) {
        return undefined;
    } else if (delivery === 'webhook') {
        return 'hidden';
    }

    const inputDefinitions = convertInputDefinitions(
        operation.inputDefinitions ??
        operation.inputs ??
        operation.inputSchema ??
        operation.inputsDefinition,
    );
    if (inputDefinitions === 'invalid') {
        return undefined;
    }

    return {
        id,
        connectorId,
        label: readFirstString(
            operation.label,
            operation.displayName,
            operation.name,
            operation.summary,
        ) ?? id,
        description: readFirstString(
            operation.description,
            operation.triggerHint,
        ),
        isWebhook: false,
        isNotification: delivery === 'notification',
        ...(inputDefinitions === undefined ? {} : { inputDefinitions }),
    };
}

function readDeliveryClassification(
    operation: JsonRecord,
): 'polling' | 'notification' | 'webhook' | undefined {
    const rawDelivery = readFirstString(
        operation.delivery,
        operation.deliveryMode,
        operation.deliveryClassification,
        operation.deliveryType,
    )?.replace(/[\s_-]+/g, '').toLowerCase();
    if (rawDelivery === 'polling' || rawDelivery === 'poll') {
        return 'polling';
    } else if (rawDelivery === 'notification') {
        return 'notification';
    } else if (rawDelivery === 'webhook') {
        return 'webhook';
    } else if (rawDelivery) {
        return undefined;
    }

    if (operation.isWebhook === true) {
        return 'webhook';
    } else if (operation.isNotification === true) {
        return 'notification';
    } else {
        return undefined;
    }
}

function convertInputDefinitions(
    value: unknown,
): ConnectorTriggerInputDefinition[] | 'invalid' | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        return asRecord(value) ? parseConnectorInputsDefinition(value) : 'invalid';
    }

    const result: ConnectorTriggerInputDefinition[] = [];
    for (const inputValue of value) {
        const input = convertInputDefinition(inputValue);
        if (!input) {
            return 'invalid';
        }
        result.push(input);
    }
    return result;
}

function convertInputDefinition(value: unknown): ConnectorTriggerInputDefinition | undefined {
    const input = asRecord(value);
    const name = readString(input?.name);
    const type = normalizeInputType(input?.type);
    if (!input ||
        !name ||
        !type ||
        typeof input.required !== 'boolean' ||
        typeof input.dynamic !== 'boolean' ||
        typeof input.sensitive !== 'boolean') {
        return undefined;
    }

    const options = convertInputOptions(input.options);
    if (options === 'invalid') {
        return undefined;
    }

    const defaultValue = readPrimitive(input.defaultValue ?? input.default);
    return {
        name,
        label: readFirstString(
            input.label,
            input.displayName,
            input.title,
        ) ?? name,
        description: readString(input.description),
        type,
        format: readString(input.format),
        required: input.required,
        defaultValue,
        options,
        dynamic: input.dynamic,
        sensitive: input.sensitive,
        ...(readString(input.visibility) ? {
            visibility: readString(input.visibility),
        } : {}),
    };
}

function convertInputOptions(
    value: unknown,
): ConnectorTriggerInputOption[] | 'invalid' | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        return 'invalid';
    }

    const options: ConnectorTriggerInputOption[] = [];
    for (const optionValue of value) {
        const option = asRecord(optionValue);
        if (!option ||
            typeof option.label !== 'string' ||
            typeof option.value !== 'string') {
            return 'invalid';
        }

        options.push({
            label: option.label,
            value: option.value,
        });
    }
    return options;
}

function normalizeInputType(value: unknown): ConnectorTriggerInputType | undefined {
    return value === 'array' ||
        value === 'boolean' ||
        value === 'integer' ||
        value === 'number' ||
        value === 'object' ||
        value === 'string' ?
        value :
        undefined;
}

function normalizeIconUrl(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ?
        value :
        `https://${value.replace(/^\/\//, '')}`;
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

function shouldHide(value: unknown): boolean {
    const visibility = readString(value);
    return !!visibility &&
        ['internal', 'hideinui'].includes(
            visibility.replace(/\s+/g, '').toLowerCase(),
        );
}

function compareConnectors(
    left: ConnectorTriggerOption,
    right: ConnectorTriggerOption,
): number {
    return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

function compareOperations(
    left: ConnectorTriggerOperationOption,
    right: ConnectorTriggerOperationOption,
): number {
    return left.connectorId.localeCompare(right.connectorId) ||
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id);
}

function getOperationKey(connectorId: string, operationId: string): string {
    return `${normalizeId(connectorId)}\0${normalizeId(operationId)}`;
}

function normalizeId(value: string): string {
    return value.trim().toLowerCase();
}

function asRecord(value: unknown): JsonRecord | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ?
        value as JsonRecord :
        undefined;
}

function readFirstString(...values: unknown[]): string | undefined {
    for (const value of values) {
        const result = readString(value);
        if (result) {
            return result;
        }
    }

    return undefined;
}

function readString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const result = value.trim();
    return result || undefined;
}

function readPrimitive(value: unknown): string | number | boolean | undefined {
    return typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ?
        value :
        undefined;
}
