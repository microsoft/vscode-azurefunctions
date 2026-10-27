/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ConnectorTriggerOption {
    id: string;
    label: string;
    templateSearch: string;
}

export interface ConnectorTriggerPickerViewModel {
    connectors: readonly ConnectorTriggerOption[];
    labels: {
        panelTitle: string;
        title: string;
        description: string;
        connectorGroup: string;
        selectedConnector: string;
        close: string;
        continue: string;
    };
}

export type ConnectorTriggerPickerMessage =
    | { command: 'close' }
    | { command: 'continue'; connectorId: string };

export function isConnectorTriggerPickerMessage(message: unknown): message is ConnectorTriggerPickerMessage {
    if (!message || typeof message !== 'object' || !('command' in message)) {
        return false;
    }

    if (message.command === 'close') {
        return true;
    }

    return message.command === 'continue' &&
        'connectorId' in message &&
        typeof message.connectorId === 'string';
}
