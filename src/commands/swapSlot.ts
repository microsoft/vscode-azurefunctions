/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { ResolvedFunctionAppResource } from '../tree/ResolvedFunctionAppResource';
import { type SlotTreeItem } from '../tree/SlotTreeItem';
import { pickFunctionApp } from '../utils/pickFunctionApp';

export async function swapSlot(context: IActionContext, sourceSlotNode?: SlotTreeItem): Promise<void> {
    if (!sourceSlotNode) {
        sourceSlotNode = await pickFunctionApp(context, {
            expectedChildContextValue: new RegExp(ResolvedFunctionAppResource.pickSlotContextValue)
        });
    }

    await sourceSlotNode.initSite(context);
    const deploymentSlots: SlotTreeItem[] = <SlotTreeItem[]>await sourceSlotNode.parent?.getCachedChildren(context);
    await appservice.swapSlot(context, sourceSlotNode.site, deploymentSlots.map(ds => ds.site));
    await sourceSlotNode.parent?.parent?.refresh(context);
}
