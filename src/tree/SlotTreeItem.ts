/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedFunctionAppResource } from './ResolvedFunctionAppResource';
import { SlotsTreeItem } from './SlotsTreeItem';
import { SlotTreeItemBase } from './SlotTreeItemBase';

export class SlotTreeItem extends SlotTreeItemBase {
    public static contextValue: string = 'azFuncSlot';
    public readonly contextValue: string = SlotTreeItem.contextValue;
    public readonly parent: SlotsTreeItem;

    public constructor(parent: SlotsTreeItem, resolvedFunctionAppResource: ResolvedFunctionAppResource) {
        super(parent, resolvedFunctionAppResource);
    }
}
