/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';

export async function openInPortal(node?: AzureTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker(ProductionSlotTreeItem.contextValue);
    }

    await node.openInPortal();
}
