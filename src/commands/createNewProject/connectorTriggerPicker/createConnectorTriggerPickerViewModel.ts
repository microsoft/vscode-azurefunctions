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
            selectAzureContext: localize(
                'connectorTriggerSelectAzureContext',
                'Select Azure context',
            ),
            subscription: localize(
                'connectorTriggerSubscription',
                'Subscription',
            ),
            selectSubscription: localize(
                'connectorTriggerSelectSubscription',
                'Select a subscription',
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
            catalogSetupDeferred: localize(
                'connectorTriggerCatalogSetupDeferred',
                'No Azure resources are created now. The selected subscription and region will be used when you configure the trigger during debugging.',
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
            connectorPageDescription: localize('connectorTriggerChooseConnectorDescription', 'Find the service that will start your function, then choose an event.'),
            connectorSearchPlaceholder: localize('connectorTriggerSearchConnectors', 'Search connectors...'),
            connectorCount: localize('connectorTriggerConnectorCount', '{0} connectors'),
            showMoreConnectors: localize('connectorTriggerShowMoreConnectors', 'Show more connectors'),
            loadingConnectors: localize('connectorTriggerLoadingConnectors', 'Loading connectors...'),
            noConnectors: localize('connectorTriggerNoConnectors', 'No connectors with trigger operations are available in this catalog.'),
            eventPageTitle: localize('connectorTriggerChooseEvent', 'Choose an event'),
            eventPageDescription: localize('connectorTriggerChooseEventDescription', 'Select the event that will start your function.'),
            eventSearchPlaceholder: localize('connectorTriggerSearchEvents', 'Search events...'),
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
