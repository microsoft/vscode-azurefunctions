/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeDataProvider, IAzureParentNode } from 'vscode-azureextensionui';

export async function createChildNode(tree: AzureTreeDataProvider, expectedContextValue: string, node?: IAzureParentNode): Promise<void> {
    if (!node) {
        node = <IAzureParentNode>await tree.showNodePicker(expectedContextValue);
    }

    await node.createChild();
}
