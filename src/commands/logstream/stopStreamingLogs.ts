/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { functionFilter } from '../../constants';
import { ext } from '../../extensionVariables';
import { isSlotTreeItem, type SlotTreeItem } from '../../tree/SlotTreeItem';
import { type RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';

export async function stopStreamingLogs(context: IActionContext, node?: SlotTreeItem | RemoteFunctionTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<SlotTreeItem>({ ...context, suppressCreatePick: true }, {
            filter: functionFilter
        });
    }

    const site: ParsedSite = isSlotTreeItem(node) ? node.site : node.parent.parent.site;
    await appservice.stopStreamingLogs(site, node.logStreamPath);
}
