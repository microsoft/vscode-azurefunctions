/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from 'vscode-azureappservice';
import { ext } from '../../extensionVariables';
import { FunctionTreeItem } from '../../tree/FunctionTreeItem';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';

export async function stopStreamingLogs(node?: SlotTreeItemBase | FunctionTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue);
    }

    await appservice.stopStreamingLogs(node.root.client, node.logStreamPath);
}
