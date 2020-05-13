/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteClient } from 'vscode-azureappservice';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';

export async function stopFunctionApp(context: IActionContext, node?: SlotTreeItemBase): Promise<SlotTreeItemBase> {
    node = await ext.tree.showTreeItemWizard<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context, node);

    const client: SiteClient = node.root.client;
    await node.withProgress(
        localize('stopping', 'Stopping...'),
        async () => {
            await client.stop();
        }
    );
    return node;
}
