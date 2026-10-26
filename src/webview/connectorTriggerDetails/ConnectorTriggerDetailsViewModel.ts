/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ConnectorTriggerDetailTone = 'default' | 'muted' | 'success' | 'warning';
export type ConnectorTriggerCopyField = 'baseUrl' | 'triggerConfigurationName';

export interface ConnectorTriggerDetailValue {
    text: string;
    tone: ConnectorTriggerDetailTone;
}

export interface ConnectorTriggerCopyableValue extends ConnectorTriggerDetailValue {
    copyValue?: string;
}

export interface ConnectorTriggerParameterViewModel {
    name: string;
    value: string;
}

export interface ConnectorTriggerMessageHistoryItem {
    receivedAt: string;
    status: string;
    result: string;
}

export interface ConnectorTriggerDetailsViewModel {
    templateId: string;
    title: string;
    description: string;
    contextMessage: string;
    labels: {
        panelTitle: string;
        overview: string;
        name: string;
        description: string;
        location: string;
        configuration: string;
        connection: string;
        authenticatedUser: string;
        status: string;
        event: string;
        triggerParameters: string;
        noTriggerParameters: string;
        pollingEndpoint: string;
        pollingEndpointDescription: string;
        baseUrl: string;
        triggerConfigurationName: string;
        deliveryInformation: string;
        deliveryMode: string;
        latestPoll: string;
        pendingMessages: string;
        messageHistory: string;
        messageReceivedAt: string;
        messageStatus: string;
        messageResult: string;
        emptyMessageHistoryTitle: string;
        emptyMessageHistoryDescription: string;
        copy: string;
        copyUnavailable: string;
        copied: string;
        copyFailed: string;
        continue: string;
        close: string;
    };
    overview: {
        name: ConnectorTriggerDetailValue;
        description: ConnectorTriggerDetailValue;
        location: ConnectorTriggerDetailValue;
    };
    configuration: {
        connection: ConnectorTriggerDetailValue;
        authenticatedUser: ConnectorTriggerDetailValue;
        status: ConnectorTriggerDetailValue;
        event: ConnectorTriggerDetailValue;
        triggerParameters: readonly ConnectorTriggerParameterViewModel[];
    };
    pollingEndpoint: {
        baseUrl: ConnectorTriggerCopyableValue;
        triggerConfigurationName: ConnectorTriggerCopyableValue;
    };
    delivery: {
        mode: ConnectorTriggerDetailValue;
        latestPoll: ConnectorTriggerDetailValue;
        pendingMessages: ConnectorTriggerDetailValue;
    };
    messageHistory: readonly ConnectorTriggerMessageHistoryItem[];
}
