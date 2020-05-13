/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deleteSite } from 'vscode-azureappservice';
import { AzExtTreeItem, ITreeItemWizardContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function deleteSlot(context: ITreeItemWizardContext, arg1?: AzExtTreeItem): Promise<void> {
    context.suppressCreatePick = true;
    const node: SlotTreeItem = await ext.tree.showTreeItemWizard(SlotTreeItem.contextValue, context, arg1);
    await node.withDeleteProgress(async () => {
        await deleteSite(node.client);
    });
}
