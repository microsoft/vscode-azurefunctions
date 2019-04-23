/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';

export async function deleteNode(expectedContextValue: string | RegExp, node?: AzureTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker(expectedContextValue);
    }

    await node.deleteTreeItem();
}
