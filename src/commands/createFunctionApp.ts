/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeDataProvider, IAzureParentNode } from 'vscode-azureextensionui';

export async function createFunctionApp(tree: AzureTreeDataProvider, node?: IAzureParentNode): Promise<void> {
    if (!node) {
        node = <IAzureParentNode>await tree.showNodePicker('azureSubscription');
    }

    await node.createChild();
}
