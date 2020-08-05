/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeItem, IActionContext, openInPortal as uiOpenInPortal } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';

export async function openInPortal(context: IActionContext, node?: AzureTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<AzureTreeItem>(ProductionSlotTreeItem.contextValue, context);
    }

    await uiOpenInPortal(node, node.fullId);
}
