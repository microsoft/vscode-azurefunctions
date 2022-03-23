/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedFunctionAppResource } from './ResolvedFunctionAppResource';
import { SlotTreeItemBase } from './SlotTreeItemBase';
import { SubscriptionTreeItem } from './SubscriptionTreeItem';

export class ProductionSlotTreeItem extends SlotTreeItemBase {
    public static contextValue: string = 'azFuncProductionSlot';
    public readonly contextValue: string = ProductionSlotTreeItem.contextValue;

    public constructor(parent: SubscriptionTreeItem, resolvedFunctionAppResource: ResolvedFunctionAppResource) {
        super(parent, resolvedFunctionAppResource);
    }
}
