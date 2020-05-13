/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from 'vscode-azureappservice';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';

export async function stopStreamingLogs(context: IActionContext, node?: SlotTreeItemBase | RemoteFunctionTreeItem): Promise<void> {
    node = await ext.tree.showTreeItemWizard<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context, node);
    await appservice.stopStreamingLogs(node.client, node.logStreamPath);
}
