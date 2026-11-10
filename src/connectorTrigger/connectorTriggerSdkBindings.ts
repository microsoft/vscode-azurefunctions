/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { connectorSdkBindings } from './connectorTriggerSdkBindings.generated';

export interface ConnectorTriggerSdkBinding {
    csharp?: { namespace: string; payloadType: string };
    python?: { importPath: string; moduleName: string; itemType: string };
    typescript: { helper?: string; importPath?: string; itemType?: string };
}

export function getConnectorTriggerSdkBinding(connectorId: string, operationId: string): ConnectorTriggerSdkBinding {
    const connectorName = connectorId.toLowerCase();
    const connector = Object.hasOwn(connectorSdkBindings, connectorName) ? connectorSdkBindings[connectorName] : undefined;
    const binding = connector && Object.hasOwn(connector, operationId) ? connector[operationId] : undefined;
    return {
        csharp: binding?.csharp,
        python: binding?.python,
        typescript: {
            helper: binding?.typescript.helper,
            importPath: binding?.typescript.importPath,
            itemType: binding?.typescript.itemType,
        },
    };
}
