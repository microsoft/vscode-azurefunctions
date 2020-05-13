/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeItemActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { SlotsTreeItem } from '../tree/SlotsTreeItem';
import { SlotTreeItem } from '../tree/SlotTreeItem';
import { nonNullProp } from '../utils/nonNull';

export async function createSlot(context: ITreeItemActionContext, node?: SlotsTreeItem): Promise<string> {
    await ext.tree.showTreeItemWizard(SlotsTreeItem.contextValue, context, node);

    const slotNode: SlotTreeItem = <SlotTreeItem>nonNullProp(context, 'newChildTreeItem');
    slotNode.showCreatedOutput();

    return slotNode.fullId;
}
