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
            eventStep: localize('connectorTriggerEventStep', 'Event'),
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
            webhookOnlyConnectors: localize(
                'connectorTriggerWebhookOnlyConnectors',
                'Webhook only ({0})',
            ),
            showWebhookOnlyConnectors: localize(
                'connectorTriggerShowWebhookOnlyConnectors',
                'Show webhook-only connectors',
            ),
            hideWebhookOnlyConnectors: localize(
                'connectorTriggerHideWebhookOnlyConnectors',
                'Hide webhook-only connectors',
            ),
            webhookOnlyDescription: localize(
                'connectorTriggerWebhookOnlyDescription',
                'This connector only exposes webhook triggers. Webhook authoring is not available yet.',
            ),
            webhookEventUnavailable: localize(
                'connectorTriggerWebhookEventUnavailable',
                'Webhook authoring is not available yet.',
            ),
            webhookDiscoveryDescription: localize(
                'connectorTriggerWebhookDiscoveryDescription',
                'Webhook-only connectors will appear here as live event discovery completes.',
            ),
            webhookNoneLoaded: localize(
                'connectorTriggerWebhookNoneLoaded',
                'No webhook-only connectors were found in the event metadata checked so far.',
            ),
            webhookNoSearchResults: localize(
                'connectorTriggerWebhookNoSearchResults',
                'No webhook-only connectors match your search.',
            ),
            connectorDiscoveryProgress: localize(
                'connectorTriggerDiscoveryProgress',
                'Checking live event metadata: {0} of {1} connectors checked.',
            ),
            connectorDiscoveryComplete: localize(
                'connectorTriggerDiscoveryComplete',
                'Live event discovery complete.',
            ),
            connectorDiscoveryPartial: localize(
                'connectorTriggerDiscoveryPartial',
                'Live event discovery is incomplete: {0} of {1} connectors checked.',
            ),
            connectorDiscoveryFailures: localize(
                'connectorTriggerDiscoveryFailures',
                '{0} connectors could not be checked and are not included.',
            ),
            retryConnectorDiscovery: localize(
                'connectorTriggerRetryDiscovery',
                'Retry failed checks',
            ),
            connectorPageTitle: localize('connectorTriggerChooseConnector', 'Choose a connector'),
            connectorPageDescription: localize('connectorTriggerChooseConnectorDescription', 'Find the service that will start your function, then choose an event.'),
            connectorSearchPlaceholder: localize('connectorTriggerSearchConnectors', 'Search connectors...'),
            connectorCount: localize('connectorTriggerConnectorCount', '{0} connectors'),
            showMoreConnectors: localize('connectorTriggerShowMoreConnectors', 'Show more connectors'),
            loadingConnectors: localize('connectorTriggerLoadingConnectors', 'Loading connectors...'),
            noConnectors: localize('connectorTriggerNoConnectors', 'No connectors with trigger operations are available in this catalog.'),
            eventPageTitle: localize('connectorTriggerChooseEvent', 'Choose an event'),
            eventPageDescription: localize('connectorTriggerChooseEventDescription', 'Select the event that will start your function.'),
            eventSearchPlaceholder: localize('connectorTriggerSearchEvents', 'Search events...'),
            loadingEvents: localize('connectorTriggerLoadingEvents', 'Loading events...'),
            eventCount: localize('connectorTriggerEventCount', 'Showing {0} of {1} events.'),
            eventSelected: localize('connectorTriggerEventSelected', 'Selected: {0}'),
            changeConnector: localize('connectorTriggerChangeConnector', 'Change connector'),
            noTriggers: localize('connectorTriggerNoTriggers', 'No triggers are available for this connector.'),
            useTemplate: localize('connectorTriggerUseTemplate', 'Use Template'),
            creatingProject: localize('connectorTriggerCreatingProject', 'Creating project...'),
            retry: localize('connectorTriggerRetry', 'Retry'),
        },
    };
}
