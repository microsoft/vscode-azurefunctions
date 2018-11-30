/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from 'vscode-azureappservice';
import { ext } from '../extensionVariables';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function swapSlot(sourceSlotNode: SlotTreeItem | undefined): Promise<void> {
    if (!sourceSlotNode) {
        sourceSlotNode = <SlotTreeItem>await ext.tree.showTreeItemPicker(SlotTreeItem.contextValue);
    }

    const deploymentSlots: SlotTreeItem[] = <SlotTreeItem[]>await sourceSlotNode.parent.getCachedChildren();
    await appservice.swapSlot(sourceSlotNode, deploymentSlots);
}
