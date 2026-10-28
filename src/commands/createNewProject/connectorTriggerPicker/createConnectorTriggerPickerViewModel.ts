/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../localize';
import { type ConnectorTriggerPickerViewModel } from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';

export function createConnectorTriggerPickerViewModel(): ConnectorTriggerPickerViewModel {
    return {
        labels: {
            panelTitle: localize('connectorTriggerPanelTitle', 'Connector Trigger'),
            title: localize('connectorTriggerCreateConnection', 'Create New Connection'),
            namespaceGroup: localize('connectorTriggerNamespaceGroup', 'Connector Namespace'),
            selectNamespace: localize('connectorTriggerSelectNamespace', 'Select a Connector Namespace'),
            loadingNamespaces: localize('connectorTriggerLoadingNamespaces', 'Loading Connector Namespaces...'),
            noNamespaces: localize('connectorTriggerNoNamespaces', 'No Connector Namespaces were found in your Azure subscriptions.'),
            connectorGroup: localize('connectorTriggerConnectorGroup', 'Connector'),
            loadingConnectors: localize('connectorTriggerLoadingConnectors', 'Loading connectors...'),
            noConnectors: localize('connectorTriggerNoConnectors', 'No connectors with trigger operations are available in this Connector Namespace.'),
            triggerGroup: localize('connectorTriggerTriggerGroup', 'Trigger'),
            selectTrigger: localize('connectorTriggerSelectTrigger', 'Select a trigger'),
            loadingTriggers: localize('connectorTriggerLoadingTriggers', 'Loading triggers...'),
            noTriggers: localize('connectorTriggerNoTriggers', 'No triggers are available for this connector.'),
            retry: localize('connectorTriggerRetry', 'Retry'),
            close: localize('connectorTriggerClosePicker', 'Close'),
            continue: localize('connectorTriggerContinuePicker', 'Continue'),
        },
    };
}
