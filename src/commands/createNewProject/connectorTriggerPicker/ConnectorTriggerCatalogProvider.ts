/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../localize';
import {
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import {
    ConnectorTriggerCatalogCache,
    type IConnectorTriggerCatalogCache,
} from './ConnectorTriggerCatalogCache';
import {
    convertConnectorCatalogManifest,
    type ConnectorCatalogManifestConversion,
    type ConnectorCatalogSnapshotSource,
} from './ConnectorTriggerCatalogManifest';

export type ConnectorCatalogItemAvailability =
    'available' |
    'unavailable' |
    'unknown';

export interface ConnectorCatalogConnector extends ConnectorTriggerOption {
    availability?: ConnectorCatalogItemAvailability;
}

export interface ConnectorCatalogOperation extends ConnectorTriggerOperationOption {
    availability?: ConnectorCatalogItemAvailability;
}

export interface ConnectorTriggerCatalog {
    connectors: ConnectorCatalogConnector[];
    operations: ConnectorCatalogOperation[];
}

export type ConnectorCatalogPublicSource =
    'bundled' |
    'remote' |
    'remoteCache';

export type ConnectorCatalogSource =
    ConnectorCatalogPublicSource |
    'live';

export type ConnectorCatalogLiveRefresh =
    'failed' |
    'notRequested' |
    'succeeded';

export enum ConnectorCatalogError {
    BundledCatalogInvalid = 'BundledCatalogInvalid',
    BundledCatalogMissing = 'BundledCatalogMissing',
    BundledManifestUnavailable = 'BundledManifestUnavailable',
    LiveCatalogUnavailable = 'LiveCatalogUnavailable',
    LiveCloudMismatch = 'LiveCloudMismatch',
    LiveSubscriptionUnavailable = 'LiveSubscriptionUnavailable',
    RemoteCatalogInvalid = 'RemoteCatalogInvalid',
    RemoteCatalogMissing = 'RemoteCatalogMissing',
    RemoteManifestUnavailable = 'RemoteManifestUnavailable',
}

export interface ConnectorTriggerCatalogResult {
    baselineSource?: ConnectorCatalogPublicSource;
    catalog: ConnectorTriggerCatalog;
    errors: ConnectorCatalogError[];
    liveRefresh: ConnectorCatalogLiveRefresh;
    snapshotSource?: ConnectorCatalogSnapshotSource;
    source: ConnectorCatalogSource;
}

export interface ConnectorCatalogBaseline {
    catalog: ConnectorTriggerCatalog;
    snapshotSource: ConnectorCatalogSnapshotSource;
}

export type ConnectorCatalogLiveLoader =
    (baseline?: ConnectorCatalogBaseline) =>
        Promise<ConnectorTriggerCatalog | undefined>;

export interface IConnectorTriggerCatalogProvider {
    getCatalog(
        context: IActionContext,
        liveLoader?: ConnectorCatalogLiveLoader,
    ): Promise<ConnectorTriggerCatalogResult>;
}

interface PublicCatalogResult {
    catalog?: ConnectorTriggerCatalog;
    errors: ConnectorCatalogError[];
    snapshotSource?: ConnectorCatalogSnapshotSource;
    source?: ConnectorCatalogPublicSource;
}

interface LiveCatalogResult {
    catalog?: ConnectorTriggerCatalog;
    error?: ConnectorCatalogError;
    requested: boolean;
}

export class ConnectorCatalogLiveLoadError extends Error {
    public constructor(public readonly reason: ConnectorCatalogError) {
        super(reason);
    }
}

export class ConnectorTriggerCatalogProvider implements IConnectorTriggerCatalogProvider {
    public constructor(
        private readonly cache: IConnectorTriggerCatalogCache =
            new ConnectorTriggerCatalogCache(),
    ) { }

    public async getCatalog(
        context: IActionContext,
        liveLoader?: ConnectorCatalogLiveLoader,
    ): Promise<ConnectorTriggerCatalogResult> {
        const publicResult = await this.loadPublicCatalog(context);
        const baseline = publicResult.catalog && publicResult.snapshotSource ? {
            catalog: publicResult.catalog,
            snapshotSource: publicResult.snapshotSource,
        } : undefined;
        const liveResult = await loadLiveCatalog(liveLoader, baseline);
        const errors = [
            ...publicResult.errors,
            ...(liveResult.error ? [liveResult.error] : []),
        ];

        if (liveResult.catalog) {
            const catalog = publicResult.catalog ?
                reconcileCatalogs(publicResult.catalog, liveResult.catalog) :
                withAvailability(liveResult.catalog, 'available');
            const result: ConnectorTriggerCatalogResult = {
                baselineSource: publicResult.source,
                catalog,
                errors,
                liveRefresh: 'succeeded',
                snapshotSource: publicResult.snapshotSource,
                source: 'live',
            };
            recordTelemetry(context, result);
            return result;
        }

        if (publicResult.catalog && publicResult.source) {
            const result: ConnectorTriggerCatalogResult = {
                catalog: withAvailability(publicResult.catalog, 'unknown'),
                errors,
                liveRefresh: liveResult.requested ? 'failed' : 'notRequested',
                snapshotSource: publicResult.snapshotSource,
                source: publicResult.source,
            };
            recordTelemetry(context, result);
            return result;
        }

        recordUnavailableTelemetry(
            context,
            liveResult.requested ? 'failed' : 'notRequested',
            errors,
        );
        throw new Error(localize(
            'connectorTriggerCatalogUnavailable',
            'The connector trigger catalog is unavailable.',
        ));
    }

    private async loadPublicCatalog(context: IActionContext): Promise<PublicCatalogResult> {
        const errors: ConnectorCatalogError[] = [];
        let primaryManifest: unknown;
        let primarySource: ConnectorCatalogPublicSource | undefined;
        try {
            const result = await this.cache.getManifest(context);
            primaryManifest = result.manifest;
            primarySource = result.source;
            if (primarySource === 'bundled' &&
                context.telemetry.properties.manifestFetchError) {
                errors.push(ConnectorCatalogError.RemoteManifestUnavailable);
            }
        } catch {
            errors.push(ConnectorCatalogError.RemoteManifestUnavailable);
        }

        const primaryConversion = convertConnectorCatalogManifest(primaryManifest);
        if (primaryConversion.status === 'valid' && primarySource) {
            return createPublicCatalogResult(
                primaryConversion,
                primarySource,
                errors,
            );
        }

        if (primarySource === 'bundled') {
            errors.push(primaryConversion.status === 'missing' ?
                ConnectorCatalogError.BundledCatalogMissing :
                ConnectorCatalogError.BundledCatalogInvalid);
            return { errors };
        } else if (primarySource) {
            errors.push(primaryConversion.status === 'missing' ?
                ConnectorCatalogError.RemoteCatalogMissing :
                ConnectorCatalogError.RemoteCatalogInvalid);
        }

        let bundledConversion: ConnectorCatalogManifestConversion | undefined;
        try {
            bundledConversion = convertConnectorCatalogManifest(
                await this.cache.getBundledManifest(),
            );
        } catch {
            errors.push(ConnectorCatalogError.BundledManifestUnavailable);
        }

        if (bundledConversion?.status === 'valid') {
            return createPublicCatalogResult(
                bundledConversion,
                'bundled',
                errors,
            );
        } else if (bundledConversion?.status === 'missing') {
            errors.push(ConnectorCatalogError.BundledCatalogMissing);
        } else if (bundledConversion?.status === 'invalid') {
            errors.push(ConnectorCatalogError.BundledCatalogInvalid);
        }

        return { errors };
    }
}

async function loadLiveCatalog(
    liveLoader: ConnectorCatalogLiveLoader | undefined,
    baseline: ConnectorCatalogBaseline | undefined,
): Promise<LiveCatalogResult> {
    if (!liveLoader) {
        return { requested: false };
    }

    try {
        const liveValue = await liveLoader(baseline);
        if (!liveValue) {
            return { requested: false };
        }

        const catalog = normalizeCatalog(liveValue);
        return catalog ?
            { catalog, requested: true } :
            {
                error: ConnectorCatalogError.LiveCatalogUnavailable,
                requested: true,
            };
    } catch (error) {
        return {
            error: error instanceof ConnectorCatalogLiveLoadError ?
                error.reason :
                ConnectorCatalogError.LiveCatalogUnavailable,
            requested: true,
        };
    }
}

function createPublicCatalogResult(
    conversion: Extract<ConnectorCatalogManifestConversion, { status: 'valid' }>,
    source: ConnectorCatalogPublicSource,
    errors: ConnectorCatalogError[],
): PublicCatalogResult {
    return {
        catalog: conversion.catalog,
        errors,
        snapshotSource: conversion.source,
        source,
    };
}

function reconcileCatalogs(
    baselineCatalog: ConnectorTriggerCatalog,
    liveCatalog: ConnectorTriggerCatalog,
): ConnectorTriggerCatalog {
    const connectors = new Map<string, ConnectorCatalogConnector>();
    for (const connector of baselineCatalog.connectors) {
        connectors.set(normalizeId(connector.id), {
            ...connector,
            availability: 'unavailable',
        });
    }
    for (const liveConnector of liveCatalog.connectors) {
        const key = normalizeId(liveConnector.id);
        const baselineConnector = connectors.get(key);
        connectors.set(key, {
            ...(baselineConnector ?? liveConnector),
            label: liveConnector.label || baselineConnector?.label || liveConnector.id,
            description: liveConnector.description ?? baselineConnector?.description,
            iconUrl: liveConnector.iconUrl ?? baselineConnector?.iconUrl,
            availability: 'available',
        });
    }

    const operations = new Map<string, ConnectorCatalogOperation>();
    for (const operation of baselineCatalog.operations) {
        operations.set(getOperationKey(operation.connectorId, operation.id), {
            ...operation,
            availability: 'unavailable',
        });
    }
    for (const liveOperation of liveCatalog.operations) {
        const key = getOperationKey(liveOperation.connectorId, liveOperation.id);
        const baselineOperation = operations.get(key);
        operations.set(key, {
            ...(baselineOperation ?? liveOperation),
            label: liveOperation.label || baselineOperation?.label || liveOperation.id,
            description: liveOperation.description ?? baselineOperation?.description,
            isWebhook: liveOperation.isWebhook,
            isNotification: liveOperation.isNotification,
            inputDefinitions:
                liveOperation.inputDefinitions ?? baselineOperation?.inputDefinitions,
            availability: 'available',
        });
    }

    return {
        connectors: [...connectors.values()].sort(compareConnectors),
        operations: [...operations.values()].sort(compareOperations),
    };
}

function withAvailability(
    catalog: ConnectorTriggerCatalog,
    availability: ConnectorCatalogItemAvailability,
): ConnectorTriggerCatalog {
    return {
        connectors: catalog.connectors.map(connector => ({
            ...connector,
            availability,
        })),
        operations: catalog.operations.map(operation => ({
            ...operation,
            availability,
        })),
    };
}

function normalizeCatalog(
    catalog: ConnectorTriggerCatalog,
): ConnectorTriggerCatalog | undefined {
    if (!catalog ||
        !Array.isArray(catalog.connectors) ||
        !Array.isArray(catalog.operations)) {
        return undefined;
    }

    const connectors = new Map<string, ConnectorCatalogConnector>();
    for (const connector of catalog.connectors) {
        const id = connector.id?.trim();
        const label = connector.label?.trim();
        const key = id ? normalizeId(id) : undefined;
        if (!id || !label || !key || connectors.has(key)) {
            return undefined;
        }

        connectors.set(key, {
            id,
            label,
            description: connector.description?.trim() || undefined,
            iconUrl: connector.iconUrl,
        });
    }

    const operations = new Map<string, ConnectorCatalogOperation>();
    for (const operation of catalog.operations) {
        const id = operation.id?.trim();
        const connectorId = operation.connectorId?.trim();
        const label = operation.label?.trim();
        if (!id || !connectorId || !label ||
            !connectors.has(normalizeId(connectorId))) {
            return undefined;
        }

        const key = getOperationKey(connectorId, id);
        if (operations.has(key)) {
            return undefined;
        }

        operations.set(key, {
            id,
            connectorId,
            label,
            description: operation.description?.trim() || undefined,
            isWebhook: operation.isWebhook === true,
            isNotification: operation.isNotification === true,
            ...(operation.inputDefinitions === undefined ? {} : {
                inputDefinitions: operation.inputDefinitions,
            }),
        });
    }

    const connectorIdsWithTriggers = new Set(
        [...operations.values()].map(operation => normalizeId(operation.connectorId)),
    );
    return {
        connectors: [...connectors.entries()]
            .filter(([connectorId]) => connectorIdsWithTriggers.has(connectorId))
            .map(([, connector]) => connector)
            .sort(compareConnectors),
        operations: [...operations.values()].sort(compareOperations),
    };
}

function recordTelemetry(
    context: IActionContext,
    result: ConnectorTriggerCatalogResult,
): void {
    context.telemetry.properties.connectorCatalogSource = result.source;
    context.telemetry.properties.connectorCatalogBaselineSource = result.baselineSource;
    context.telemetry.properties.connectorCatalogLiveRefresh = result.liveRefresh;
    context.telemetry.properties.connectorCatalogErrors = result.errors.length > 0 ?
        result.errors.join(',') :
        undefined;
}

function recordUnavailableTelemetry(
    context: IActionContext,
    liveRefresh: ConnectorCatalogLiveRefresh,
    errors: ConnectorCatalogError[],
): void {
    context.telemetry.properties.connectorCatalogSource = 'unavailable';
    context.telemetry.properties.connectorCatalogBaselineSource = undefined;
    context.telemetry.properties.connectorCatalogLiveRefresh = liveRefresh;
    context.telemetry.properties.connectorCatalogErrors = errors.join(',');
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
