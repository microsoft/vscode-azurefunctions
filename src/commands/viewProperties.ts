/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, window } from 'vscode';
import { IActionContext, openReadOnlyJson } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { LocalFunctionTreeItem } from '../tree/localProject/LocalFunctionTreeItem';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { RemoteFunctionTreeItem } from '../tree/remoteProject/RemoteFunctionTreeItem';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';

export async function viewProperties(context: IActionContext, node?: SlotTreeItemBase | RemoteFunctionTreeItem | LocalFunctionTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<ProductionSlotTreeItem>(ProductionSlotTreeItem.contextValue, context);
    }

    if (node instanceof LocalFunctionTreeItem) {
        await window.showTextDocument(Uri.file(node.functionJsonPath));
    } else {
        let data: {};
        if (node instanceof SlotTreeItemBase) {
            data = node.site;
        } else {
            data = node.config.data;
        }

        await openReadOnlyJson(node, data);
    }
}
