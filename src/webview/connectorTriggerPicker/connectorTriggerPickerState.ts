/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ConnectorTriggerStep } from './ConnectorTriggerShell';
import {
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
} from './ConnectorTriggerPickerViewModel';

export interface ConnectorTriggerSelection {
    activeStep: ConnectorTriggerStep;
    connectorId: string;
    operationId: string;
}

export interface ReconciledConnectorTriggerSelection extends ConnectorTriggerSelection {
    selectionUnavailable: boolean;
}

export function reconcileConnectorTriggerSelection(
    selection: ConnectorTriggerSelection,
    connectors: readonly ConnectorTriggerOption[],
    operations: readonly ConnectorTriggerOperationOption[],
): ReconciledConnectorTriggerSelection {
    if (!selection.connectorId) {
        return { ...selection, selectionUnavailable: false };
    }

    const connector = connectors.find(item => equalsIgnoreCase(item.id, selection.connectorId));
    if (!connector) {
        return {
            activeStep: 1,
            connectorId: '',
            operationId: '',
            selectionUnavailable: true,
        };
    }

    if (!selection.operationId) {
        return {
            ...selection,
            connectorId: connector.id,
            selectionUnavailable: connector.availability === 'unavailable',
        };
    }

    const operation = operations.find(item =>
        equalsIgnoreCase(item.connectorId, connector.id) &&
        equalsIgnoreCase(item.id, selection.operationId));
    if (!operation) {
        return {
            activeStep: selection.activeStep === 1 ? 1 : 2,
            connectorId: connector.id,
            operationId: '',
            selectionUnavailable: true,
        };
    }

    return {
        ...selection,
        connectorId: connector.id,
        operationId: operation.id,
        selectionUnavailable:
            connector.availability === 'unavailable' ||
            operation.availability === 'unavailable',
    };
}

function equalsIgnoreCase(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}
