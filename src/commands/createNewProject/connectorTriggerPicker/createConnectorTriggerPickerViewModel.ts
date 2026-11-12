/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../localize';
import { type ConnectorTriggerPickerViewModel } from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';

export function createConnectorTriggerPickerViewModel(language?: string): ConnectorTriggerPickerViewModel {
    return {
        language,
        labels: {
            panelTitle: localize('templateGallery', 'Template Gallery'),
            galleryTitle: localize('templateGallery', 'Template Gallery'),
            gallerySubtitle: localize('templateGallerySubtitle', 'Create a new Azure Functions project from a template'),
            browseTemplates: localize('connectorTriggerBrowseTemplates', 'Browse Templates'),
            connectorTriggers: localize('connectorTriggerTab', 'Connector Triggers'),
            buildWithCopilotChat: localize('connectorTriggerBuildWithCopilot', 'Build with Copilot Chat'),
            connectorStep: localize('connectorTriggerConnectorStep', 'Connector'),
            eventStep: localize('connectorTriggerEventStep', 'Events'),
            azureContextRequired: localize(
                'connectorTriggerAzureContextRequired',
                'Azure sign-in, a subscription, and a region are required before you can browse Connector Triggers.',
            ),
            subscription: localize(
                'connectorTriggerSubscription',
                'Subscription',
            ),
            selectSubscription: localize(
                'connectorTriggerSelectSubscription',
                'Select a subscription',
            ),
            showAllSubscriptions: localize(
                'connectorTriggerShowAllSubscriptions',
                'Show all subscriptions...',
            ),
            useFilteredSubscriptions: localize(
                'connectorTriggerUseFilteredSubscriptions',
                'Use subscription filter...',
            ),
            region: localize(
                'connectorTriggerRegion',
                'Region',
            ),
            selectRegion: localize(
                'connectorTriggerSelectRegion',
                'Select a region',
            ),
            loadingSubscriptions: localize(
                'connectorTriggerLoadingSubscriptions',
                'Loading subscriptions...',
            ),
            loadingRegions: localize(
                'connectorTriggerLoadingRegions',
                'Loading regions...',
            ),
            recommendedRegions: localize(
                'connectorTriggerRecommendedRegions',
                'Recommended',
            ),
            otherRegions: localize(
                'connectorTriggerOtherRegions',
                'Other',
            ),
            liveCatalogSource: localize(
                'connectorTriggerLiveCatalogSource',
                'Browsing connectors available in the selected Azure subscription and region.',
            ),
            selectionUnavailable: localize(
                'connectorTriggerSelectionUnavailable',
                'The previous connector or event is no longer available in the live catalog. Choose another selection.',
            ),
            unavailable: localize(
                'connectorTriggerUnavailable',
                'Unavailable in the selected Azure catalog',
            ),
            connectorGroup: localize('connectorTriggerConnectorGroup', 'Connector'),
            featuredConnectors: localize('connectorTriggerFeaturedConnectors', 'Featured connectors'),
            otherConnectors: localize('connectorTriggerOtherConnectors', 'Other connectors ({0})'),
            showOtherConnectors: localize('connectorTriggerShowOtherConnectors', 'Show other connectors'),
            hideOtherConnectors: localize('connectorTriggerHideOtherConnectors', 'Hide other connectors'),
            connectorPageTitle: localize('connectorTriggerChooseConnector', 'Choose a connector'),
            connectorPageDescription: localize('connectorTriggerChooseConnectorDescription', 'Find the service that will start your functions, then choose one or more events.'),
            connectorSearchPlaceholder: localize('connectorTriggerSearchConnectors', 'Search connectors...'),
            connectorCount: localize('connectorTriggerConnectorCount', '{0} connectors'),
            showMoreConnectors: localize('connectorTriggerShowMoreConnectors', 'Show more connectors'),
            loadingConnectors: localize('connectorTriggerLoadingConnectors', 'Loading connectors...'),
            noConnectors: localize('connectorTriggerNoConnectors', 'No connectors are available in this catalog.'),
            eventPageTitle: localize('connectorTriggerChooseEvent', 'Choose events'),
            eventPageDescription: localize('connectorTriggerChooseEventDescription', 'Select one or more polling events. Each selected event creates a separate function. Azure resources and connection authorization are configured separately.'),
            eventSearchPlaceholder: localize('connectorTriggerSearchEvents', 'Search events...'),
            loadingEvents: localize('connectorTriggerLoadingEvents', 'Loading events...'),
            pollingEventDelivery: localize(
                'connectorTriggerPollingEventDelivery',
                'Polling',
            ),
            webhookEventDelivery: localize(
                'connectorTriggerWebhookEventDelivery',
                'Webhook - creation is not supported yet',
            ),
            eventCount: localize('connectorTriggerEventCount', 'Showing {0} of {1} events.'),
            eventSelected: localize('connectorTriggerEventSelected', '{0} selected'),
            changeConnector: localize('connectorTriggerChangeConnector', 'Change connector'),
            noTriggers: localize('connectorTriggerNoTriggers', '{0} has no triggers that can start a function. Choose a connector that offers triggers.'),
            noMatchingEvents: localize('connectorTriggerNoMatchingEvents', 'No events match your search.'),
            chooseAnotherConnector: localize('connectorTriggerChooseAnotherConnector', 'Choose another connector'),
            useTemplate: localize('connectorTriggerUseTemplate', 'Create functions'),
            creatingProject: localize('connectorTriggerCreatingProject', 'Creating project...'),
            retry: localize('connectorTriggerRetry', 'Retry'),
        },
    };
}
