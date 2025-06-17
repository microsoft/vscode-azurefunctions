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

    const site: ParsedSite = isSlotTreeItem(node) ?
        await node.getSite(context) :
        await node.parent.parent.getSite(context);
    await appservice.stopStreamingLogs(site, node.logStreamPath);
}
