/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../extensionVariables';
import { ResolvedFunctionAppResource } from '../tree/ResolvedFunctionAppResource';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';

export async function swapSlot(context: IActionContext, sourceSlotNode?: SlotTreeItemBase): Promise<void> {
    if (!sourceSlotNode) {
        sourceSlotNode = await ext.rgApi.tree.showTreeItemPicker<SlotTreeItemBase>(ResolvedFunctionAppResource.slotContextValue, { ...context, suppressCreatePick: true });
    }

    const deploymentSlots: SlotTreeItemBase[] = <SlotTreeItemBase[]>await sourceSlotNode.parent?.getCachedChildren(context);
    await appservice.swapSlot(context, sourceSlotNode.site, deploymentSlots.map(ds => ds.site));
    await sourceSlotNode.parent?.parent?.refresh(context);
}
