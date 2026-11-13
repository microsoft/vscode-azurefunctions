/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ConnectorTriggerStep } from './ConnectorTriggerShell';
import { type ConnectorTriggerOperationOption, type ConnectorTriggerOption } from './ConnectorTriggerPickerViewModel';

export interface ConnectorTriggerPickerSelection {
    activeStep: ConnectorTriggerStep;
    connectorId: string;
    operationIds: string[];
}

export function reconcileConnectorTriggerSelection(
    selection: ConnectorTriggerPickerSelection,
    connectors: readonly ConnectorTriggerOption[],
    operations: readonly ConnectorTriggerOperationOption[],
): ConnectorTriggerPickerSelection & { selectionUnavailable: boolean } {
    const connector = connectors.find(item => equalsIgnoreCase(item.id, selection.connectorId));
    if (!connector || connector.availability === 'unavailable') {
        return {
            activeStep: 1, connectorId: '', operationIds: [],
            selectionUnavailable: !!selection.connectorId,
        };
    }
    const availableOperations = operations.filter(operation =>
        equalsIgnoreCase(operation.connectorId, connector.id) &&
        operation.availability !== 'unavailable' && !operation.isWebhook);
    const operationIds = selection.operationIds.flatMap(id => {
        const operation = availableOperations.find(item => equalsIgnoreCase(item.id, id));
        return operation ? [operation.id] : [];
    });
    return {
        ...selection, connectorId: connector.id, operationIds,
        selectionUnavailable: operationIds.length !== selection.operationIds.length,
    };
}

function equalsIgnoreCase(left: string, right: string): boolean {
    return left.toLowerCase() === right.toLowerCase();
}
