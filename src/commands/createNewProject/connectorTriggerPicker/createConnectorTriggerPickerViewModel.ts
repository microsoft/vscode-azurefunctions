/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../localize';
import { type ConnectorTriggerPickerViewModel } from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { getConnectorTriggerOptions } from './connectorTriggerCatalog';

export function createConnectorTriggerPickerViewModel(): ConnectorTriggerPickerViewModel {
    return {
        connectors: getConnectorTriggerOptions(),
        labels: {
            panelTitle: localize('connectorTriggerPanelTitle', 'Connector Trigger'),
            title: localize('connectorTriggerCreateConnection', 'Create New Connection'),
            connectorGroup: localize('connectorTriggerConnectorGroup', 'Connector'),
            close: localize('connectorTriggerClosePicker', 'Close'),
            continue: localize('connectorTriggerContinuePicker', 'Continue'),
        },
    };
}
