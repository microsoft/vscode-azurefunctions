/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../../extensionVariables';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';

export async function stopStreamingLogs(context: IActionContext, node?: SlotTreeItemBase | RemoteFunctionTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, { ...context, suppressCreatePick: true });
    }

    const site: ParsedSite = node instanceof SlotTreeItemBase ? node.site : node.parent.parent.site;
    await appservice.stopStreamingLogs(site, node.logStreamPath);
}
