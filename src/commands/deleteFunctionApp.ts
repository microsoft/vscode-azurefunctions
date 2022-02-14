/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem, IActionContext } from '@microsoft/vscode-azext-utils';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { deleteNode } from './deleteNode';

export async function deleteFunctionApp(context: IActionContext, node?: AzExtTreeItem): Promise<void> {
    await deleteNode(context, ProductionSlotTreeItem.contextValue, node)
}
