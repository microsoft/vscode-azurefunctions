/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../extensionVariables';
import { SlotsTreeItem } from '../tree/SlotsTreeItem';
import { SlotTreeItem } from '../tree/SlotTreeItem';
import { ISiteCreatedOptions } from './createFunctionApp/showSiteCreated';

export async function createSlot(context: IActionContext, node?: SlotsTreeItem): Promise<string> {
    if (!node) {
        node = await ext.rgApi.tree.showTreeItemPicker<SlotsTreeItem>(SlotsTreeItem.contextValue, context);
    }

    (<ISiteCreatedOptions>context).showCreatedNotification = true;
    const slotNode: SlotTreeItem = await node.createChild(context);
    return slotNode.fullId;
}
