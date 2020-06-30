/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from 'vscode-azureappservice';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function swapSlot(context: IActionContext, sourceSlotNode?: SlotTreeItem): Promise<void> {
    if (!sourceSlotNode) {
        sourceSlotNode = await ext.tree.showTreeItemPicker<SlotTreeItem>(SlotTreeItem.contextValue, { ...context, suppressCreatePick: true });
    }

    const deploymentSlots: SlotTreeItem[] = <SlotTreeItem[]>await sourceSlotNode.parent.getCachedChildren(context);
    await appservice.swapSlot(sourceSlotNode, deploymentSlots);
    await sourceSlotNode.parent.parent.refresh();
}
