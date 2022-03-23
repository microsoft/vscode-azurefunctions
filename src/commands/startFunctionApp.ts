/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { AzureExtensionApiProvider } from '@microsoft/vscode-azext-utils/api';
import { AzureResourceGroupsExtensionApi } from '../api';
import { getApiExport } from '../getExtensionApi';
import { localize } from '../localize';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';

export async function startFunctionApp(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    if (!node) {
        const rgApi = await getApiExport<AzureExtensionApiProvider>('ms-azuretools.vscode-azureresourcegroups');
        if (!rgApi) {
            throw new Error();
        }

        node = await rgApi.getApi<AzureResourceGroupsExtensionApi>('0.0.1').tree.showTreeItemPicker<SlotTreeItemBase>(new RegExp(ProductionSlotTreeItem.contextValue), context);
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
