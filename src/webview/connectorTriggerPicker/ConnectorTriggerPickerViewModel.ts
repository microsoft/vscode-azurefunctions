/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
    regionCategory?: string;
}

export interface ConnectorTriggerOperationOption {
    id: string;
    connectorId: string;
    label: string;
    description?: string;
    isWebhook: boolean;
    isNotification: boolean;
    availability?: ConnectorTriggerAvailability;
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
        recommendedRegions: string;
        otherRegions: string;
        liveCatalogSource: string;
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
        loadingEvents: string;
        pollingEventDelivery: string;
        webhookEventDelivery: string;
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
    | { command: 'loadCatalog' }
    | ({
        command: 'continue';
    } & ConnectorTriggerSelections);

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

    return message.command === 'continue' && isConnectorTriggerSelections(message);
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
            message.subscriptions.every((value: unknown) =>
                !!value && typeof value === 'object' &&
                'id' in value && typeof value.id === 'string' &&
                'label' in value && typeof value.label === 'string') &&
            'showingAll' in message &&
            typeof message.showingAll === 'boolean';
    }

    if (message.command === 'locationsLoaded') {
        return 'subscriptionId' in message &&
            typeof message.subscriptionId === 'string' &&
            'locations' in message &&
            Array.isArray(message.locations) &&
            message.locations.every(isConnectorTriggerLocationOption);
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

function isConnectorTriggerLocationOption(
    value: unknown,
): value is ConnectorTriggerLocationOption {
    return !!value &&
        typeof value === 'object' &&
        'name' in value &&
        typeof value.name === 'string' &&
        'label' in value &&
        typeof value.label === 'string' &&
        (
            !('regionCategory' in value) ||
            typeof value.regionCategory === 'string'
        );
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
import { isConnectorTriggerSelections, type ConnectorTriggerSelections } from '../../connectorTrigger/connectorTriggerSelection';
