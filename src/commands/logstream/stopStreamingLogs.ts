/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../../extensionVariables';
import { RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';
import { ResolvedFunctionAppResource } from '../../tree/ResolvedFunctionAppResource';
import { isSlotTreeItem, SlotTreeItem } from '../../tree/SlotTreeItem';

export async function stopStreamingLogs(context: IActionContext, node?: SlotTreeItem | RemoteFunctionTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.tree.showTreeItemPicker<SlotTreeItem>(new RegExp(ResolvedFunctionAppResource.productionContextValue), { ...context, suppressCreatePick: true });
    }

    const site: ParsedSite = isSlotTreeItem(node) ? node.site : node.parent.parent.site;
    await appservice.stopStreamingLogs(site, node.logStreamPath);
}
