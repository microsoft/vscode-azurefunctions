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
    language?: string;
    labels: {
        panelTitle: string;
        galleryTitle: string;
        gallerySubtitle: string;
        browseTemplates: string;
        connectorTriggers: string;
        buildWithCopilotChat: string;
        connectorStep: string;
        eventStep: string;
        configureStep: string;
        namespaceGroup: string;
        selectNamespace: string;
        createNamespace: string;
        creatingNamespace: string;
        loadingNamespaces: string;
        noNamespaces: string;
        connectorGroup: string;
        connectorPageTitle: string;
        connectorPageDescription: string;
        connectorSearchPlaceholder: string;
        connectorCount: string;
        showMoreConnectors: string;
        loadingConnectors: string;
        noConnectors: string;
        eventPageTitle: string;
        eventPageDescription: string;
        eventSearchPlaceholder: string;
        eventCount: string;
        eventSelected: string;
        changeConnector: string;
        noTriggers: string;
        configurePageTitle: string;
        configurePageDescription: string;
        changeEvent: string;
        deliveryQuestion: string;
        polling: string;
        webhook: string;
        pollingDescription: string;
        webhookDescription: string;
        selectionPreview: string;
        functionPreview: string;
        infrastructurePreview: string;
        useTemplate: string;
        creatingProject: string;
        retry: string;
    };
}

export type ConnectorDeliveryMode = 'Polling' | 'Webhook';

export type ConnectorTriggerPickerMessage =
    | { command: 'browseTemplates' }
    | { command: 'openCopilot' }
    | { command: 'loadNamespaces' }
    | { command: 'createNamespace' }
    | { command: 'loadCatalog'; namespaceId: string }
    | {
        command: 'continue';
        namespaceId: string;
        connectorId: string;
        operationId: string;
        deliveryMode: ConnectorDeliveryMode;
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
        command: 'projectCreationStarted';
    }
    | {
        command: 'projectCreationProgress';
        detail: string;
    }
    | {
        command: 'projectCreationFailed';
        message: string;
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

    if (message.command === 'browseTemplates' ||
        message.command === 'openCopilot' ||
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
        typeof message.operationId === 'string' &&
        'deliveryMode' in message &&
        (message.deliveryMode === 'Polling' || message.deliveryMode === 'Webhook');
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

    if (message.command === 'projectCreationStarted') {
        return true;
    }

    if (message.command === 'projectCreationProgress') {
        return 'detail' in message && typeof message.detail === 'string';
    }

    if (message.command === 'projectCreationFailed') {
        return 'message' in message && typeof message.message === 'string';
    }

    return message.command === 'loadFailed' &&
        'scope' in message &&
        (message.scope === 'namespaces' || message.scope === 'catalog') &&
        'message' in message &&
        typeof message.message === 'string' &&
        (!('namespaceId' in message) || typeof message.namespaceId === 'string');
}
