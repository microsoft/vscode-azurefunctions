/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ConnectorTriggerSetupStatus } from '../../debug/connectorNamespace/connectorTriggerF5Contracts';

export interface ConnectorTriggerSetupViewModel {
    connector: string;
    event: string;
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
        resource: string;
        action: string;
        details: string;
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
        retry: string;
        selectSubscription: string;
        selectRegion: string;
        signIn: string;
        scopeNotice: string;
    };
}

export interface ConnectorSetupResourceOption {
    id: string;
    label: string;
}

export type ConnectorSetupNameField = 'resourceGroupName' | 'namespaceName' | 'connectionName';

export interface ConnectorSetupResourceState {
    revision: number;
    phase: 'resources' | ConnectorTriggerSetupStatus;
    loading: boolean;
    status: string;
    subscriptionOptions: ConnectorSetupResourceOption[];
    subscriptionId: string;
    regionOptions: ConnectorSetupResourceOption[];
    regionId: string;
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
    resources: { name: string; type: string; action: string; detail: string }[];
    canApprove: boolean;
    error?: string;
}

export type ConnectorSetupAction =
    | { command: 'selectSubscription' | 'selectRegion' | 'selectNamespace' | 'selectConnection'; id: string }
    | { command: 'editResource'; field: ConnectorSetupNameField; text: string }
    | { command: 'approveSetup' | 'reloadSetup' | 'signInSetup' };

export type ConnectorSetupMessage =
    | { command: 'initializeSetup' }
    | (ConnectorSetupAction & { revision: number });

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
            return true;
        case 'selectSubscription':
        case 'selectRegion':
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
