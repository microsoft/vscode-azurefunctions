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
            title: localize('connectorTriggerChooseConnector', 'Choose a connector'),
            description: localize(
                'connectorTriggerChooseConnectorDescription',
                'Select the service whose events should trigger your function.',
            ),
            connectorGroup: localize('connectorTriggerConnectorGroup', 'Connectors'),
            selectedConnector: localize('connectorTriggerSelectedConnector', 'Selected connector'),
            close: localize('connectorTriggerClosePicker', 'Close'),
            continue: localize('connectorTriggerContinuePicker', 'Continue'),
        },
    };
}
