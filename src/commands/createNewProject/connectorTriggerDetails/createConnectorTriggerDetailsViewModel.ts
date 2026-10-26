/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../localize';
import { type IProjectTemplate } from '../../../templates/projectTemplates/IProjectTemplate';
import {
    type ConnectorTriggerDetailsViewModel,
    type ConnectorTriggerDetailTone,
    type ConnectorTriggerDetailValue,
} from '../../../webview/connectorTriggerDetails/ConnectorTriggerDetailsViewModel';

export function isConnectorTriggerTemplate(template: Pick<IProjectTemplate, 'bindingType' | 'resource'>): boolean {
    return equalsIgnoreCase(template.resource, 'connector') &&
        (template.bindingType === undefined || equalsIgnoreCase(template.bindingType, 'trigger'));
}

export function createPollingConnectorTriggerDetailsViewModel(template: IProjectTemplate): ConnectorTriggerDetailsViewModel {
    const notConfigured = localize('connectorTriggerDetailNotConfigured', 'Not configured');
    const notAvailable = localize('connectorTriggerDetailNotAvailable', 'Not available yet');
    const title = template.displayName || localize('connectorTrigger', 'Connector Trigger');
    const description = template.longDescription?.trim() || template.shortDescription;

    return {
        templateId: template.id,
        title,
        description,
        contextMessage: localize(
            'connectorTriggerDetailContext',
            'This preview uses template metadata. Connection, endpoint, delivery, and message values will appear after the connector trigger and Connector Namespace are configured.',
        ),
        labels: {
            panelTitle: localize('connectorTriggerDetailsPanelTitle', 'Connector trigger details'),
            overview: localize('connectorTriggerOverview', 'Overview'),
            name: localize('connectorTriggerName', 'Name'),
            description: localize('connectorTriggerDetailsDescriptionLabel', 'Description'),
            location: localize('connectorTriggerLocation', 'Location'),
            configuration: localize('connectorTriggerConfiguration', 'Connector configuration'),
            connection: localize('connectorTriggerConnection', 'Connection'),
            authenticatedUser: localize('connectorTriggerAuthenticatedUser', 'Authenticated user'),
            status: localize('connectorTriggerStatus', 'Status'),
            event: localize('connectorTriggerEvent', 'Event'),
            triggerParameters: localize('connectorTriggerParameters', 'Trigger parameters'),
            noTriggerParameters: localize('connectorTriggerNoParameters', 'No trigger parameters are configured.'),
            pollingEndpoint: localize('connectorTriggerPollingEndpoint', 'Polling endpoint'),
            pollingEndpointDescription: localize(
                'connectorTriggerPollingEndpointDescription',
                'These values become available after the Connector Namespace provisions the polling trigger configuration.',
            ),
            baseUrl: localize('connectorTriggerBaseUrl', 'Base URL'),
            triggerConfigurationName: localize('connectorTriggerConfigurationName', 'Trigger Configuration Name'),
            deliveryInformation: localize('connectorTriggerDeliveryInformation', 'Delivery information'),
            deliveryMode: localize('connectorTriggerDeliveryMode', 'Delivery mode'),
            latestPoll: localize('connectorTriggerLatestPoll', 'Latest poll'),
            pendingMessages: localize('connectorTriggerPendingMessages', 'Pending messages'),
            messageHistory: localize('connectorTriggerMessageHistory', 'Message history'),
            messageReceivedAt: localize('connectorTriggerMessageReceivedAt', 'Received'),
            messageStatus: localize('connectorTriggerMessageStatus', 'Status'),
            messageResult: localize('connectorTriggerMessageResult', 'Result'),
            emptyMessageHistoryTitle: localize('connectorTriggerNoMessageHistory', 'Message history unavailable'),
            emptyMessageHistoryDescription: localize(
                'connectorTriggerNoMessageHistoryDescription',
                'Messages will appear here after the configured polling trigger receives events.',
            ),
            copy: localize('connectorTriggerCopy', 'Copy'),
            copyUnavailable: localize('connectorTriggerCopyUnavailable', 'Available after configuration'),
            copied: localize('connectorTriggerCopied', 'Copied'),
            copyFailed: localize('connectorTriggerCopyFailed', 'Copy failed'),
            continue: localize('connectorTriggerContinueTemplateSetup', 'Continue with template setup'),
            close: localize('connectorTriggerCloseDetails', 'Close'),
        },
        overview: {
            name: detailValue(title),
            description: detailValue(template.shortDescription),
            location: detailValue(notConfigured, 'muted'),
        },
        configuration: {
            connection: detailValue(notConfigured, 'muted'),
            authenticatedUser: detailValue(notConfigured, 'muted'),
            status: detailValue(localize('connectorTriggerConfigurationRequired', 'Configuration required'), 'warning'),
            event: detailValue(localize('connectorTriggerEventNotSelected', 'Not selected'), 'muted'),
            triggerParameters: [],
        },
        pollingEndpoint: {
            baseUrl: { ...detailValue(notConfigured, 'muted'), copyValue: undefined },
            triggerConfigurationName: { ...detailValue(notConfigured, 'muted'), copyValue: undefined },
        },
        delivery: {
            mode: detailValue(localize('connectorTriggerPollDeliveryMode', 'Poll'), 'success'),
            latestPoll: detailValue(notAvailable, 'muted'),
            pendingMessages: detailValue(notAvailable, 'muted'),
        },
        messageHistory: [],
    };
}

function detailValue(text: string, tone: ConnectorTriggerDetailTone = 'default'): ConnectorTriggerDetailValue {
    return { text, tone };
}

function equalsIgnoreCase(value: string | undefined, expected: string): boolean {
    return value?.localeCompare(expected, undefined, { sensitivity: 'accent' }) === 0;
}
