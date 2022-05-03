/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';
import { ResolvedFunctionAppResource } from '../tree/ResolvedFunctionAppResource';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function swapSlot(context: IActionContext, sourceSlotNode?: SlotTreeItem): Promise<void> {
    if (!sourceSlotNode) {
        sourceSlotNode = await ext.rgApi.pickAppResource<SlotTreeItem>({ ...context, suppressCreatePick: true }, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(ResolvedFunctionAppResource.productionContextValue)
        });
    }

    const deploymentSlots: SlotTreeItem[] = <SlotTreeItem[]>await sourceSlotNode.parent?.getCachedChildren(context);
    await appservice.swapSlot(context, sourceSlotNode.site, deploymentSlots.map(ds => ds.site));
    await sourceSlotNode.parent?.parent?.refresh(context);
}
