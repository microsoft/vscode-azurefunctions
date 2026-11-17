/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { type Memento } from 'vscode';
import { type ConnectorTriggerConnectionDefaultsStore, type ConnectorTriggerReusableConnection } from './connectorTriggerF5Contracts';

const connectionDefaultsStateKey = 'connectorTriggerF5.connectionDefaults';
const maxConnectionsPerProject = 20;

/**
 * Kept in workspaceState rather than committed settings: the IDs identify the signed-in account's
 * subscription and resources, which other users and machines cannot assume.
 */
export class WorkspaceStateConnectorTriggerConnectionDefaultsStore implements ConnectorTriggerConnectionDefaultsStore {
    public constructor(private readonly state: Memento) { }

    public read(projectPath: string): Promise<ConnectorTriggerReusableConnection[]> {
        const saved = this.state.get<unknown>(connectionDefaultsStateKey);
        const entries = isRecord(saved) ? saved[path.resolve(projectPath)] : undefined;
        return Promise.resolve(Array.isArray(entries) ? entries.filter(isReusableConnection) : []);
    }

    public async record(projectPath: string, connection: ConnectorTriggerReusableConnection): Promise<void> {
        const saved = this.state.get<unknown>(connectionDefaultsStateKey);
        const all: Record<string, unknown> = isRecord(saved) ? saved : {};
        const sanitized = sanitize(connection);
        const key = scopeKey(sanitized);
        const entries = (await this.read(projectPath)).filter(entry => scopeKey(entry) !== key);
        await this.state.update(connectionDefaultsStateKey, {
            ...all,
            [path.resolve(projectPath)]: [...entries, sanitized].slice(-maxConnectionsPerProject),
        });
    }
}

/** One saved connection per connector and exact Azure scope; the most recent use replaces older ones. */
function scopeKey(connection: ConnectorTriggerReusableConnection): string {
    const { subscription, region } = connection.scope;
    return JSON.stringify([
        connection.connectorId.toLowerCase(),
        subscription.id.toLowerCase(),
        subscription.accountId ?? null,
        subscription.tenantId.toLowerCase(),
        subscription.environment.name,
        subscription.environment.resourceManagerEndpointUrl,
        region.replace(/\s+/g, '').toLowerCase(),
    ]);
}

/** Copies only the known non-secret fields so nothing else on the source objects is persisted. */
function sanitize(connection: ConnectorTriggerReusableConnection): ConnectorTriggerReusableConnection {
    const { subscription, region } = connection.scope;
    return {
        scope: {
            subscription: {
                id: subscription.id,
                tenantId: subscription.tenantId,
                ...(subscription.accountId !== undefined ? { accountId: subscription.accountId } : {}),
                environment: {
                    name: subscription.environment.name,
                    resourceManagerEndpointUrl: subscription.environment.resourceManagerEndpointUrl,
                },
            },
            region,
        },
        namespaceId: connection.namespaceId,
        connectorId: connection.connectorId,
        connectionId: connection.connectionId,
    };
}

function isReusableConnection(value: unknown): value is ConnectorTriggerReusableConnection {
    if (!isRecord(value) || !isRecord(value.scope) || !isRecord(value.scope.subscription)) {
        return false;
    }
    const subscription = value.scope.subscription;
    return isRecord(subscription.environment) &&
        isNonEmptyString(subscription.id) &&
        isNonEmptyString(subscription.tenantId) &&
        (subscription.accountId === undefined || isNonEmptyString(subscription.accountId)) &&
        isNonEmptyString(subscription.environment.name) &&
        isNonEmptyString(subscription.environment.resourceManagerEndpointUrl) &&
        isNonEmptyString(value.scope.region) &&
        isNonEmptyString(value.namespaceId) &&
        isNonEmptyString(value.connectorId) &&
        isNonEmptyString(value.connectionId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}
