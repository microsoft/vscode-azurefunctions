/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ConnectorTriggerSelection {
    connectorId: string;
    operationId: string;
}

export interface ConnectorTriggerAuthoringContext {
    subscriptionId: string;
    accountId?: string;
    tenantId: string;
    environmentName: string;
    region: string;
}

export interface ConnectorTriggerEventSettings extends ConnectorTriggerSelection {
    azureContext?: ConnectorTriggerAuthoringContext;
}

export function isConnectorTriggerAuthoringContext(value: unknown): value is ConnectorTriggerAuthoringContext {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
        'subscriptionId' in value && isIdentifier(value.subscriptionId) &&
        'tenantId' in value && isIdentifier(value.tenantId) &&
        'environmentName' in value && isIdentifier(value.environmentName) &&
        'region' in value && isIdentifier(value.region) &&
        (!('accountId' in value) || value.accountId === undefined || isIdentifier(value.accountId)) &&
        Object.keys(value).every(key => ['subscriptionId', 'accountId', 'tenantId', 'environmentName', 'region'].includes(key));
}

export interface ConnectorTriggerBatchSelection {
    connectorId: string;
    operationIds: string[];
}

export type ConnectorTriggerSelections = ConnectorTriggerSelection | ConnectorTriggerBatchSelection;

export function isConnectorTriggerSelections(value: unknown): value is ConnectorTriggerSelections {
    if (!value || typeof value !== 'object' ||
        !('connectorId' in value) || !isIdentifier(value.connectorId)) {
        return false;
    }

    if ('operationId' in value) {
        return !('operationIds' in value) && isIdentifier(value.operationId);
    }

    return 'operationIds' in value && Array.isArray(value.operationIds) &&
        value.operationIds.length > 0 && value.operationIds.every(isIdentifier) &&
        new Set(value.operationIds.map(id => id.toLowerCase())).size === value.operationIds.length;
}

export function getConnectorTriggerSelections(selection: ConnectorTriggerSelections): ConnectorTriggerSelection[] {
    const operationIds = 'operationIds' in selection ? selection.operationIds : [selection.operationId];
    return operationIds.map(operationId => ({ connectorId: selection.connectorId, operationId }));
}

function isIdentifier(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.trim() === value &&
        ![...value].some(character => character.charCodeAt(0) < 32);
}
