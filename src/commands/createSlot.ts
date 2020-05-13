/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeItemWizardContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { SlotsTreeItem } from '../tree/SlotsTreeItem';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function createSlot(context: ITreeItemWizardContext, node?: SlotsTreeItem): Promise<string> {
    const slotNode: SlotTreeItem = await ext.tree.showCreateWizard<SlotTreeItem>(SlotsTreeItem.contextValue, context, node);
    slotNode.showCreatedOutput();
    return slotNode.fullId;
}
