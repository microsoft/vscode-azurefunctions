/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import { FunctionAppNode } from '../nodes/FunctionAppNode';
import { NodeBase } from '../nodes/NodeBase';

export async function openInPortal(explorer: AzureFunctionsExplorer, node?: NodeBase): Promise<void> {
    if (!node) {
        node = <FunctionAppNode>(await explorer.showNodePicker(FunctionAppNode.contextValue));
    }

    (<(s: string) => void>opn)(`https://portal.azure.com/${node.tenantId}/#resource${node.id}`);
}
