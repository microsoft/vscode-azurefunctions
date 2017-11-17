/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeDataProvider, IAzureParentNode } from 'vscode-azureextensionui';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';

export async function deleteFunctionApp(tree: AzureTreeDataProvider, node?: IAzureParentNode): Promise<void> {
    if (!node) {
        node = <IAzureParentNode>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    await node.deleteNode();
}
