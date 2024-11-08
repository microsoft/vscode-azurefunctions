/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../localize';
import { type SlotTreeItem } from '../tree/SlotTreeItem';
import { pickFunctionApp } from '../utils/pickFunctionApp';

export async function startFunctionApp(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await pickFunctionApp(context);
    }


    const client: SiteClient = await node.site.createClient(context);
    await node.runWithTemporaryDescription(
        context,
        localize('starting', 'Starting...'),
        async () => {
            await client.start();
        }
    );
}
