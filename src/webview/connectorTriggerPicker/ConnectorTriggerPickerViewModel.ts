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
    eventSupport?: ConnectorTriggerEventSupport;
}

export type ConnectorTriggerAvailability = 'available' | 'unavailable' | 'unknown';
export type ConnectorTriggerEventSupport =
    'none' |
    'poll' |
    'unknown' |
    'webhook-only';

export interface ConnectorTriggerSubscriptionOption {
    id: string;
    label: string;
}

export interface ConnectorTriggerLocationOption {
    name: string;
    label: string;
}

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

export interface ConnectorTriggerDiscoveryClassification {
    connectorId: string;
    eventSupport: Exclude<ConnectorTriggerEventSupport, 'unknown'>;
}

export interface ConnectorTriggerAzureContextDisplay {
    subscriptionId: string;
    subscriptionName: string;
    region: string;
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
        azureContextRequired: string;
        subscription: string;
        selectSubscription: string;
        showAllSubscriptions: string;
        useFilteredSubscriptions: string;
        region: string;
        selectRegion: string;
        loadingSubscriptions: string;
        loadingRegions: string;
        liveCatalogSource: string;
        selectionUnavailable: string;
        unavailable: string;
        connectorGroup: string;
        featuredConnectors: string;
        otherConnectors: string;
        showOtherConnectors: string;
        hideOtherConnectors: string;
        webhookOnlyConnectors: string;
        showWebhookOnlyConnectors: string;
        hideWebhookOnlyConnectors: string;
        webhookOnlyDescription: string;
        webhookEventUnavailable: string;
        webhookDiscoveryDescription: string;
        webhookNoneLoaded: string;
        webhookNoSearchResults: string;
        connectorDiscoveryProgress: string;
        connectorDiscoveryComplete: string;
        connectorDiscoveryPartial: string;
        connectorDiscoveryFailures: string;
        retryConnectorDiscovery: string;
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
        loadingEvents: string;
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
    | { command: 'signIn' }
    | { command: 'loadAllSubscriptions' }
    | { command: 'loadFilteredSubscriptions' }
    | {
        command: 'selectSubscription';
        subscriptionId: string;
    }
    | {
        command: 'selectRegion';
        subscriptionId: string;
        region: string;
    }
    | {
        command: 'loadConnectorOperations';
        connectorId: string;
    }
    | { command: 'retryConnectorDiscovery' }
    | { command: 'loadCatalog' }
    | {
        command: 'continue';
        connectorId: string;
        operationId: string;
    };

export type ConnectorTriggerPickerResponse =
    | {
        command: 'azureContextRequired';
        message: string;
    }
    | {
        command: 'subscriptionsLoaded';
        subscriptions: ConnectorTriggerSubscriptionOption[];
        showingAll: boolean;
    }
    | {
        command: 'locationsLoaded';
        subscriptionId: string;
        locations: ConnectorTriggerLocationOption[];
    }
    | {
        command: 'azureContextSelected';
        azureContext: ConnectorTriggerAzureContextDisplay;
    }
    | {
        command: 'catalogLoaded';
        connectors: ConnectorTriggerOption[];
        operations: ConnectorTriggerOperationOption[];
        warning?: string;
    }
    | {
        command: 'connectorOperationsLoaded';
        connectorId: string;
        eventSupport: Exclude<ConnectorTriggerEventSupport, 'unknown'>;
        operations: ConnectorTriggerOperationOption[];
    }
    | {
        command: 'connectorOperationsFailed';
        connectorId: string;
        message: string;
    }
    | {
        command: 'connectorDiscoveryProgress';
        classifications: ConnectorTriggerDiscoveryClassification[];
        failed: number;
        inProgress: boolean;
        processed: number;
        total: number;
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
        scope: 'azureContext' | 'subscriptions' | 'locations' | 'catalog';
        message: string;
    };

export function isConnectorTriggerPickerMessage(message: unknown): message is ConnectorTriggerPickerMessage {
    if (!message || typeof message !== 'object' || !('command' in message)) {
        return false;
    }

    if (message.command === 'browseTemplates' ||
        message.command === 'openCopilot' ||
        message.command === 'initialize' ||
        message.command === 'signIn' ||
        message.command === 'loadAllSubscriptions' ||
        message.command === 'loadFilteredSubscriptions' ||
        message.command === 'retryConnectorDiscovery' ||
        message.command === 'loadCatalog') {
        return true;
    }

    if (message.command === 'selectSubscription') {
        return 'subscriptionId' in message &&
            typeof message.subscriptionId === 'string';
    }

    if (message.command === 'selectRegion') {
        return 'subscriptionId' in message &&
            typeof message.subscriptionId === 'string' &&
            'region' in message &&
            typeof message.region === 'string';
    }

    if (message.command === 'loadConnectorOperations') {
        return 'connectorId' in message &&
            typeof message.connectorId === 'string';
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

    if (message.command === 'azureContextRequired') {
        return 'message' in message && typeof message.message === 'string';
    }

    if (message.command === 'subscriptionsLoaded') {
        return 'subscriptions' in message &&
            Array.isArray(message.subscriptions) &&
            'showingAll' in message &&
            typeof message.showingAll === 'boolean';
    }

    if (message.command === 'locationsLoaded') {
        return 'subscriptionId' in message &&
            typeof message.subscriptionId === 'string' &&
            'locations' in message &&
            Array.isArray(message.locations);
    }

    if (message.command === 'azureContextSelected') {
        return 'azureContext' in message &&
            isConnectorTriggerAzureContextDisplay(message.azureContext);
    }

    if (message.command === 'catalogLoaded') {
        return 'connectors' in message &&
            Array.isArray(message.connectors) &&
            'operations' in message &&
            Array.isArray(message.operations) &&
            (!('warning' in message) || typeof message.warning === 'string');
    }

    if (message.command === 'connectorOperationsLoaded') {
        return 'connectorId' in message &&
            typeof message.connectorId === 'string' &&
            'eventSupport' in message &&
            (
                message.eventSupport === 'none' ||
                message.eventSupport === 'poll' ||
                message.eventSupport === 'webhook-only'
            ) &&
            'operations' in message &&
            Array.isArray(message.operations);
    }

    if (message.command === 'connectorOperationsFailed') {
        return 'connectorId' in message &&
            typeof message.connectorId === 'string' &&
            'message' in message &&
            typeof message.message === 'string';
    }

    if (message.command === 'connectorDiscoveryProgress') {
        return 'classifications' in message &&
            Array.isArray(message.classifications) &&
            message.classifications.every(classification =>
                !!classification &&
                typeof classification === 'object' &&
                'connectorId' in classification &&
                typeof classification.connectorId === 'string' &&
                'eventSupport' in classification &&
                (
                    classification.eventSupport === 'none' ||
                    classification.eventSupport === 'poll' ||
                    classification.eventSupport === 'webhook-only'
                )) &&
            'failed' in message &&
            typeof message.failed === 'number' &&
            'inProgress' in message &&
            typeof message.inProgress === 'boolean' &&
            'processed' in message &&
            typeof message.processed === 'number' &&
            'total' in message &&
            typeof message.total === 'number';
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
        (
            message.scope === 'azureContext' ||
            message.scope === 'subscriptions' ||
            message.scope === 'locations' ||
            message.scope === 'catalog'
        ) &&
        'message' in message &&
        typeof message.message === 'string';
}

function isConnectorTriggerAzureContextDisplay(
    value: unknown,
): value is ConnectorTriggerAzureContextDisplay {
    return !!value &&
        typeof value === 'object' &&
        'subscriptionId' in value &&
        typeof value.subscriptionId === 'string' &&
        'subscriptionName' in value &&
        typeof value.subscriptionName === 'string' &&
        'region' in value &&
        typeof value.region === 'string' &&
        'regionDisplayName' in value &&
        typeof value.regionDisplayName === 'string';
}
