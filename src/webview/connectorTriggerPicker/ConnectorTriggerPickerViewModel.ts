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
    availability?: ConnectorTriggerAvailability;
}

export type ConnectorTriggerAvailability = 'available' | 'unavailable' | 'unknown';

export type ConnectorTriggerInputType =
    'array' |
    'boolean' |
    'integer' |
    'number' |
    'object' |
    'string';

export interface ConnectorTriggerInputOption {
    label: string;
    value: string;
}

export interface ConnectorTriggerInputDefinition {
    name: string;
    label: string;
    description?: string;
    type: ConnectorTriggerInputType;
    format?: string;
    required: boolean;
    defaultValue?: string | number | boolean;
    options?: ConnectorTriggerInputOption[];
    dynamic: boolean;
    sensitive: boolean;
    visibility?: string;
}

export interface ConnectorTriggerOperationOption {
    id: string;
    connectorId: string;
    label: string;
    description?: string;
    isWebhook: boolean;
    isNotification: boolean;
    inputDefinitions?: ConnectorTriggerInputDefinition[];
    availability?: ConnectorTriggerAvailability;
}

export type ConnectorTriggerCatalogSource = 'bundled' | 'remote' | 'live';

export interface ConnectorTriggerAzureContextDisplay {
    subscriptionName: string;
    regionDisplayName: string;
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
        selectingAzureContext: string;
        azureContextRequired: string;
        selectedAzureContext: string;
        selectAzureContext: string;
        bundledCatalogSource: string;
        remoteCatalogSource: string;
        liveCatalogSource: string;
        refreshingCatalog: string;
        catalogSetupDeferred: string;
        selectionUnavailable: string;
        unavailable: string;
        connectorGroup: string;
        featuredConnectors: string;
        otherConnectors: string;
        showOtherConnectors: string;
        hideOtherConnectors: string;
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
        useTemplate: string;
        creatingProject: string;
        retry: string;
    };
}

export type ConnectorTriggerPickerMessage =
    | { command: 'browseTemplates' }
    | { command: 'openCopilot' }
    | { command: 'initialize' }
    | { command: 'loadCatalog' }
    | {
        command: 'continue';
        connectorId: string;
        operationId: string;
    };

export type ConnectorTriggerPickerResponse =
    | {
        command: 'azureContextSelected';
        azureContext: ConnectorTriggerAzureContextDisplay;
    }
    | {
        command: 'azureContextSelectionCancelled';
        message: string;
    }
    | {
        command: 'catalogLoaded';
        source: ConnectorTriggerCatalogSource;
        connectors: ConnectorTriggerOption[];
        operations: ConnectorTriggerOperationOption[];
        warning?: string;
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
        scope: 'azureContext' | 'catalog';
        message: string;
    };

export function isConnectorTriggerPickerMessage(message: unknown): message is ConnectorTriggerPickerMessage {
    if (!message || typeof message !== 'object' || !('command' in message)) {
        return false;
    }

    if (message.command === 'browseTemplates' ||
        message.command === 'openCopilot' ||
        message.command === 'initialize' ||
        message.command === 'loadCatalog') {
        return true;
    }

    return message.command === 'continue' &&
        'connectorId' in message &&
        typeof message.connectorId === 'string' &&
        'operationId' in message &&
        typeof message.operationId === 'string';
}

export function isConnectorTriggerPickerResponse(message: unknown): message is ConnectorTriggerPickerResponse {
    if (!message || typeof message !== 'object' || !('command' in message)) {
        return false;
    }

    if (message.command === 'azureContextSelected') {
        return 'azureContext' in message &&
            isConnectorTriggerAzureContextDisplay(message.azureContext);
    }

    if (message.command === 'azureContextSelectionCancelled') {
        return 'message' in message && typeof message.message === 'string';
    }

    if (message.command === 'catalogLoaded') {
        return 'source' in message &&
            isConnectorTriggerCatalogSource(message.source) &&
            'connectors' in message &&
            Array.isArray(message.connectors) &&
            'operations' in message &&
            Array.isArray(message.operations) &&
            (!('warning' in message) || typeof message.warning === 'string');
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
        (message.scope === 'azureContext' || message.scope === 'catalog') &&
        'message' in message &&
        typeof message.message === 'string';
}

function isConnectorTriggerCatalogSource(value: unknown): value is ConnectorTriggerCatalogSource {
    return value === 'bundled' || value === 'remote' || value === 'live';
}

function isConnectorTriggerAzureContextDisplay(
    value: unknown,
): value is ConnectorTriggerAzureContextDisplay {
    return !!value &&
        typeof value === 'object' &&
        'subscriptionName' in value &&
        typeof value.subscriptionName === 'string' &&
        'regionDisplayName' in value &&
        typeof value.regionDisplayName === 'string';
}
