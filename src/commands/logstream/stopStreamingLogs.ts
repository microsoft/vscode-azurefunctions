/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';
import { isSlotTreeItem, type SlotTreeItem } from '../../tree/SlotTreeItem';
import { pickFunctionApp } from '../../utils/pickFunctionApp';

export async function stopStreamingLogs(context: IActionContext, node?: SlotTreeItem | RemoteFunctionTreeItem): Promise<void> {
    if (!node) {
        node = await pickFunctionApp({ ...context, suppressCreatePick: true });
    }

    let site: ParsedSite;
    if (isSlotTreeItem(node)) {
        // If it's a SlotTreeItem, we need to ensure the site is initialized
        await node.initSite(context);
        site = node.site;
    } else {
        // If it's a RemoteFunctionTreeItem, we need to get the parent SlotTreeItem
        await node.parent.parent.initSite(context);
        site = node.parent.parent.site;
    }
    await appservice.stopStreamingLogs(site, node.logStreamPath);
}
