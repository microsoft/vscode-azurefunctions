/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';

export async function createChildNode(expectedContextValue: string, node?: AzExtParentTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<AzExtParentTreeItem>(expectedContextValue);
    }

    await node.createChild();
}
