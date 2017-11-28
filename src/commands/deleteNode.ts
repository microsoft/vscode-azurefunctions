/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeDataProvider, IAzureNode } from 'vscode-azureextensionui';

export async function deleteNode(tree: AzureTreeDataProvider, expectedContextValue: string, node?: IAzureNode): Promise<void> {
    if (!node) {
        node = <IAzureNode>await tree.showNodePicker(expectedContextValue);
    }

    await node.deleteNode();
}
