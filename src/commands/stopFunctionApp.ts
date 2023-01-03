/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function stopFunctionApp(context: IActionContext, node?: SlotTreeItem): Promise<SlotTreeItem> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<SlotTreeItem>(context, { filter: functionFilter });
    }

    const client: SiteClient = await node.site.createClient(context);
    await node.runWithTemporaryDescription(
        context,
        localize('stopping', 'Stopping...'),
        async () => {
            await client.stop();
        }
    );
    return node;
}
