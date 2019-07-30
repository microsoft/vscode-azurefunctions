/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, openReadOnlyJson } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { BindingTreeItem } from '../tree/BindingTreeItem';
import { FunctionTreeItemBase } from '../tree/FunctionTreeItemBase';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';

export async function viewProperties(context: IActionContext, node?: SlotTreeItemBase | FunctionTreeItemBase | BindingTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<ProductionSlotTreeItem>(ProductionSlotTreeItem.contextValue, context);
    }

    let data: {};
    if (node instanceof SlotTreeItemBase) {
        data = node.site;
    } else if (node instanceof FunctionTreeItemBase) {
        data = node.config.data;
    } else {
        data = node.binding;
    }

    await openReadOnlyJson(node, data);
}
