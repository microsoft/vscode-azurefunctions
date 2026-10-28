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
            namespaceGroup: localize('connectorTriggerNamespaceGroup', 'Connector Namespace'),
            selectNamespace: localize('connectorTriggerSelectNamespace', 'Select a Connector Namespace'),
            createNamespace: localize('connectorTriggerCreateNamespaceOption', '+ Create new Connector Namespace...'),
            creatingNamespace: localize('connectorTriggerCreatingNamespace', 'Creating Connector Namespace...'),
            loadingNamespaces: localize('connectorTriggerLoadingNamespaces', 'Loading Connector Namespaces...'),
            noNamespaces: localize('connectorTriggerNoNamespaces', 'No Connector Namespaces were found in your Azure subscriptions.'),
            connectorGroup: localize('connectorTriggerConnectorGroup', 'Connector'),
            connectorPageTitle: localize('connectorTriggerChooseConnector', 'Choose a connector'),
            connectorPageDescription: localize('connectorTriggerChooseConnectorDescription', 'Find the service that will start your function, then choose an event.'),
            connectorSearchPlaceholder: localize('connectorTriggerSearchConnectors', 'Search connectors...'),
            connectorCount: localize('connectorTriggerConnectorCount', '{0} connectors'),
            showMoreConnectors: localize('connectorTriggerShowMoreConnectors', 'Show more connectors'),
            loadingConnectors: localize('connectorTriggerLoadingConnectors', 'Loading connectors...'),
            noConnectors: localize('connectorTriggerNoConnectors', 'No connectors with trigger operations are available in this Connector Namespace.'),
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
            selectionPreview: localize('connectorTriggerSelectionPreview', 'Selection preview'),
            functionPreview: localize('connectorTriggerFunctionPreview', 'Function'),
            infrastructurePreview: localize('connectorTriggerInfrastructurePreview', 'Infrastructure'),
            useTemplate: localize('connectorTriggerUseTemplate', 'Use Template'),
            retry: localize('connectorTriggerRetry', 'Retry'),
        },
    };
}
