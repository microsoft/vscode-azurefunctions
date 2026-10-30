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
            configureStep: localize('connectorTriggerConfigureStep', 'Configure & preview'),
            bundledCatalogSource: localize(
                'connectorTriggerBundledCatalogSource',
                'Browsing the bundled Microsoft connector catalog snapshot.',
            ),
            remoteCatalogSource: localize(
                'connectorTriggerRemoteCatalogSource',
                'Browsing the Microsoft connector catalog.',
            ),
            liveCatalogSource: localize(
                'connectorTriggerLiveCatalogSource',
                'Connector availability was refreshed from Azure.',
            ),
            refreshingCatalog: localize(
                'connectorTriggerRefreshingCatalog',
                'Refreshing connector availability...',
            ),
            catalogSetupDeferred: localize(
                'connectorTriggerCatalogSetupDeferred',
                'Create the local project now. Connector Namespace and connection setup will be requested when you debug, deploy, or configure the trigger.',
            ),
            selectionUnavailable: localize(
                'connectorTriggerSelectionUnavailable',
                'The previous connector or event is not available in the refreshed catalog. Choose another selection.',
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
            configurePageTitle: localize('connectorTriggerConfigurePreview', 'Configure & preview'),
            configurePageDescription: localize('connectorTriggerConfigurePreviewDescription', 'Choose how your function receives events and preview the selected template configuration.'),
            changeEvent: localize('connectorTriggerChangeEvent', 'Change event'),
            deliveryQuestion: localize('connectorTriggerDeliveryQuestion', 'How should your function receive events?'),
            polling: localize('connectorTriggerPolling', 'Polling'),
            webhook: localize('connectorTriggerWebhook', 'Webhook'),
            pollingDescription: localize('connectorTriggerPollingDescription', 'Check for changes on a schedule.'),
            webhookDescription: localize('connectorTriggerWebhookDescription', 'Webhook delivery is not available in VS Code yet.'),
            eventParameters: localize('connectorTriggerEventParameters', 'Event parameters'),
            eventParametersDescription: localize(
                'connectorTriggerEventParametersDescription',
                'Configure the inputs defined by the selected connector event.',
            ),
            loadingEventParameters: localize(
                'connectorTriggerLoadingEventParameters',
                'Loading event parameters...',
            ),
            noEventParameters: localize(
                'connectorTriggerNoEventParameters',
                'This event has no configurable parameters.',
            ),
            eventParametersDeferred: localize(
                'connectorTriggerEventParametersDeferred',
                'Parameter details will be completed when you configure the trigger during debug or deployment.',
            ),
            dynamicParameterDescription: localize(
                'connectorTriggerDynamicParameterDescription',
                'Connection-dependent values for this field will be resolved during trigger setup.',
            ),
            requiredParameter: localize('connectorTriggerRequiredParameter', 'required'),
            optionalParameters: localize('connectorTriggerOptionalParameters', 'Optional parameters ({0})'),
            showOptionalParameters: localize('connectorTriggerShowOptionalParameters', 'Show optional parameters'),
            hideOptionalParameters: localize('connectorTriggerHideOptionalParameters', 'Hide optional parameters'),
            selectionPreview: localize('connectorTriggerSelectionPreview', 'Selection preview'),
            triggerMetadataPreview: localize('connectorTriggerTriggerMetadata', 'Trigger metadata'),
            resourceMetadataPreview: localize('connectorTriggerResourceMetadata', 'Resource metadata'),
            resourceSetupDeferred: localize(
                'connectorTriggerResourceSetupDeferred',
                'Azure resources are not required to create this project. Namespace, connection, and trigger configuration are deferred until debug or deployment.',
            ),
            useTemplate: localize('connectorTriggerUseTemplate', 'Use Template'),
            creatingProject: localize('connectorTriggerCreatingProject', 'Creating project...'),
            retry: localize('connectorTriggerRetry', 'Retry'),
        },
    };
}
