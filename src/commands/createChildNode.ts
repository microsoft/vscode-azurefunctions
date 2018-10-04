/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureParentTreeItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';

export async function createChildNode(expectedContextValue: string, node?: AzureParentTreeItem): Promise<void> {
    if (!node) {
        node = <AzureParentTreeItem>await ext.tree.showTreeItemPicker(expectedContextValue);
    }

    await node.createChild();
}
