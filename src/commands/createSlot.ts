/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { SlotsTreeItem } from '../tree/SlotsTreeItem';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function createSlot(this: IActionContext, node?: SlotsTreeItem, resourceGroup?: string): Promise<string> {
    if (!node) {
        node = <SlotsTreeItem>await ext.tree.showTreeItemPicker(SlotsTreeItem.contextValue);
    }

    const slotNode: SlotTreeItem = <SlotTreeItem>(await node.createChild({ actionContext: this, resourceGroup }));
    slotNode.showCreatedOutput();

    return slotNode.fullId;
}
