/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ConnectorTriggerSetupStatus } from '../../debug/connectorNamespace/connectorTriggerF5Contracts';

export interface ConnectorTriggerSetupViewModel {
    connector: string;
    event: string;
    identityRequired: boolean;
    localSettings: {
        name: string;
        action: string;
        source: string;
        environmentOverride: boolean;
    }[];
    labels: {
        title: string;
        subtitle: string;
        connectorTriggers: string;
        connector: string;
        event: string;
        subscription: string;
        tenant: string;
        cloud: string;
        region: string;
        resources: string;
        action: string;
        localSettings: string;
        setting: string;
        valueSource: string;
        environmentOverride: string;
        notice: string;
        approve: string;
        cancel: string;
        namespace: string;
        namespaceName: string;
        resourceGroup: string;
        connection: string;
        connectionName: string;
        parameters: string;
        parametersLocked: string;
        resourceChoicesLocked: string;
        loading: string;
        working: string;
        provisioning: string;
        loadingSubscriptions: string;
        loadingRegions: string;
        recommendedRegions: string;
        otherRegions: string;
        retry: string;
        selectSubscription: string;
        showAllSubscriptions: string;
        useFilteredSubscriptions: string;
        selectRegion: string;
        signIn: string;
        scopeNotice: string;
        identityNotice: string;
        selectConnector: string;
        selectEvent: string;
        eventTrigger: string;
        eventTriggerNotice: string;
        eventConfigured: string;
    };
    /** Multi-event projects only: the event this setup configures and the others the user can switch to. */
    events?: {
        choices: { id: string; label: string; configured: boolean }[];
        selectedId: string;
    };
}

export interface ConnectorSetupResourceOption {
    id: string;
    label: string;
    regionCategory?: string;
}

export type ConnectorSetupNameField = 'resourceGroupName' | 'namespaceName' | 'connectionName';

export interface ConnectorSetupResourceState {
    revision: number;
    phase: 'resources' | ConnectorTriggerSetupStatus;
    loading: boolean;
    showingAllSubscriptions: boolean;
    status: string;
    subscriptionOptions: ConnectorSetupResourceOption[];
    subscriptionId: string;
    regionOptions: ConnectorSetupResourceOption[];
    regionId: string;
    connectorOptions: ConnectorSetupResourceOption[];
    connectorId: string;
    eventOptions: ConnectorSetupResourceOption[];
    eventId: string;
    regionReady: boolean;
    scopeReady: boolean;
    tenant?: string;
    cloud?: string;
    namespaceOptions: ConnectorSetupResourceOption[];
    namespaceId: string;
    namespaceIsNew: boolean;
    connectionOptions: ConnectorSetupResourceOption[];
    connectionId: string;
    connectionIsNew: boolean;
    names: Record<ConnectorSetupNameField, string>;
    errors: Partial<Record<ConnectorSetupNameField, string>>;
    canApprove: boolean;
    error?: string;
}

export type ConnectorSetupAction =
    | { command: 'selectSubscription' | 'selectRegion' | 'selectConnector' | 'selectEvent' | 'selectNamespace' | 'selectConnection'; id: string }
    | { command: 'editResource'; field: ConnectorSetupNameField; text: string }
    | { command: 'approveSetup' | 'reloadSetup' | 'signInSetup' | 'loadAllSubscriptions' | 'loadFilteredSubscriptions' };

export type ConnectorSetupMessage =
    | { command: 'initializeSetup' }
    | (ConnectorSetupAction & { revision: number });

export function applyConnectorSetupAction(
    current: ConnectorSetupResourceState,
    action: ConnectorSetupAction,
    provisioningStatus: string,
): ConnectorSetupResourceState {
    const loadingSubscriptions = action.command === 'signInSetup' || action.command === 'reloadSetup' ||
        action.command === 'loadAllSubscriptions' || action.command === 'loadFilteredSubscriptions';
    return {
        ...current,
        canApprove: false,
        phase: action.command === 'approveSetup' ? 'provisioning' : current.phase,
        status: action.command === 'approveSetup' ? provisioningStatus : current.status,
        loading: loadingSubscriptions || current.loading,
        error: loadingSubscriptions ? undefined : current.error,
        names: action.command === 'editResource' ? { ...current.names, [action.field]: action.text } : current.names,
        namespaceId: action.command === 'selectNamespace' ? action.id : current.namespaceId,
        connectionId: action.command === 'selectConnection' ? action.id : current.connectionId,
        subscriptionId: action.command === 'selectSubscription' ? action.id : current.subscriptionId,
        regionId: action.command === 'selectSubscription' ? '' : action.command === 'selectRegion' ? action.id : current.regionId,
        connectorId: action.command === 'selectConnector' ? action.id : current.connectorId,
        eventId: action.command === 'selectConnector' ? '' : action.command === 'selectEvent' ? action.id : current.eventId,
        scopeReady: ['selectSubscription', 'selectRegion', 'selectConnector', 'selectEvent'].includes(action.command) ? false : current.scopeReady,
    };
}

export function isConnectorSetupMessage(value: unknown): value is ConnectorSetupMessage {
    if (!value || typeof value !== 'object' || !('command' in value)) {
        return false;
    }
    if (value.command === 'initializeSetup') {
        return true;
    }
    if (!('revision' in value) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) {
        return false;
    }
    switch (value.command) {
        case 'approveSetup':
        case 'reloadSetup':
        case 'signInSetup':
        case 'loadAllSubscriptions':
        case 'loadFilteredSubscriptions':
            return true;
        case 'selectSubscription':
        case 'selectRegion':
        case 'selectConnector':
        case 'selectEvent':
        case 'selectNamespace':
        case 'selectConnection':
            return 'id' in value && typeof value.id === 'string';
        case 'editResource':
            return 'field' in value &&
                (value.field === 'resourceGroupName' || value.field === 'namespaceName' || value.field === 'connectionName') &&
                'text' in value && typeof value.text === 'string';
        default:
            return false;
    }
}

export function isConnectorSetupResponse(value: unknown): value is { command: 'setupState'; state: ConnectorSetupResourceState } {
    return !!value && typeof value === 'object' && 'command' in value && value.command === 'setupState' &&
        'state' in value && !!value.state && typeof value.state === 'object' &&
        'revision' in value.state && Number.isSafeInteger(value.state.revision) &&
        'namespaceOptions' in value.state && Array.isArray(value.state.namespaceOptions) &&
        'canApprove' in value.state && typeof value.state.canApprove === 'boolean';
}
