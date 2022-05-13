/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';
import { SlotsTreeItem } from '../tree/SlotsTreeItem';
import { SlotTreeItem } from '../tree/SlotTreeItem';
import { ISiteCreatedOptions } from './createFunctionApp/showSiteCreated';

export async function createSlot(context: IActionContext, node?: SlotsTreeItem): Promise<string> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<SlotsTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: SlotsTreeItem.contextValue
        });
    }

    (<ISiteCreatedOptions>context).showCreatedNotification = true;
    const slotNode: SlotTreeItem = await node.createChild(context);
    return slotNode.fullId;
}
