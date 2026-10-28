/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ConnectorNamespaceOption {
    id: string;
    name: string;
    label: string;
    location: string;
    resourceGroup: string;
    subscriptionId: string;
    subscriptionName: string;
}

export interface ConnectorTriggerOption {
    id: string;
    label: string;
    description?: string;
    iconUrl?: string;
    templateSearch: string;
}

export interface ConnectorTriggerOperationOption {
    id: string;
    connectorId: string;
    label: string;
    description?: string;
    isWebhook: boolean;
    isNotification: boolean;
}

export interface ConnectorTriggerPickerViewModel {
    labels: {
        panelTitle: string;
        title: string;
        namespaceGroup: string;
        selectNamespace: string;
        createNamespace: string;
        creatingNamespace: string;
        loadingNamespaces: string;
        noNamespaces: string;
        connectorGroup: string;
        loadingConnectors: string;
        noConnectors: string;
        triggerGroup: string;
        selectTrigger: string;
        loadingTriggers: string;
        noTriggers: string;
        retry: string;
        close: string;
        continue: string;
    };
}

export type ConnectorTriggerPickerMessage =
    | { command: 'close' }
    | { command: 'loadNamespaces' }
    | { command: 'createNamespace' }
    | { command: 'loadCatalog'; namespaceId: string }
    | {
        command: 'continue';
        namespaceId: string;
        connectorId: string;
        operationId: string;
    };

export type ConnectorTriggerPickerResponse =
    | {
        command: 'namespacesLoaded';
        namespaces: ConnectorNamespaceOption[];
        selectedNamespaceId?: string;
        warning?: string;
    }
    | {
        command: 'catalogLoaded';
        namespaceId: string;
        connectors: ConnectorTriggerOption[];
        operations: ConnectorTriggerOperationOption[];
    }
    | {
        command: 'namespaceCreationCancelled';
    }
    | {
        command: 'loadFailed';
        scope: 'namespaces' | 'catalog';
        namespaceId?: string;
        message: string;
    };

export function isConnectorTriggerPickerMessage(message: unknown): message is ConnectorTriggerPickerMessage {
    if (!message || typeof message !== 'object' || !('command' in message)) {
        return false;
    }

    if (message.command === 'close' ||
        message.command === 'loadNamespaces' ||
        message.command === 'createNamespace') {
        return true;
    }

    if (message.command === 'loadCatalog') {
        return 'namespaceId' in message && typeof message.namespaceId === 'string';
    }

    return message.command === 'continue' &&
        'namespaceId' in message &&
        typeof message.namespaceId === 'string' &&
        'connectorId' in message &&
        typeof message.connectorId === 'string' &&
        'operationId' in message &&
        typeof message.operationId === 'string';
}

export function isConnectorTriggerPickerResponse(message: unknown): message is ConnectorTriggerPickerResponse {
    if (!message || typeof message !== 'object' || !('command' in message)) {
        return false;
    }

    if (message.command === 'namespacesLoaded') {
        return 'namespaces' in message &&
            Array.isArray(message.namespaces) &&
            (!('selectedNamespaceId' in message) || typeof message.selectedNamespaceId === 'string');
    }

    if (message.command === 'catalogLoaded') {
        return 'namespaceId' in message &&
            typeof message.namespaceId === 'string' &&
            'connectors' in message &&
            Array.isArray(message.connectors) &&
            'operations' in message &&
            Array.isArray(message.operations);
    }

    if (message.command === 'namespaceCreationCancelled') {
        return true;
    }

    return message.command === 'loadFailed' &&
        'scope' in message &&
        (message.scope === 'namespaces' || message.scope === 'catalog') &&
        'message' in message &&
        typeof message.message === 'string' &&
        (!('namespaceId' in message) || typeof message.namespaceId === 'string');
}
