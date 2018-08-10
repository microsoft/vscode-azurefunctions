/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureNode } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';

export async function deleteNode(expectedContextValue: string, node?: IAzureNode): Promise<void> {
    if (!node) {
        node = <IAzureNode>await ext.tree.showNodePicker(expectedContextValue);
    }

    await node.deleteNode();
}
