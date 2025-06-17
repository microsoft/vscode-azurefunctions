/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../localize';
import { type SlotTreeItem } from '../tree/SlotTreeItem';
import { pickFunctionApp } from '../utils/pickFunctionApp';

export async function stopFunctionApp(context: IActionContext, node?: SlotTreeItem): Promise<SlotTreeItem> {
    if (!node) {
        node = await pickFunctionApp(context);
    }

    const client: SiteClient = await (await node.getSite(context)).createClient(context);
    await node.runWithTemporaryDescription(
        context,
        localize('stopping', 'Stopping...'),
        async () => {
            await client.stop();
        }
    );
    return node;
}
