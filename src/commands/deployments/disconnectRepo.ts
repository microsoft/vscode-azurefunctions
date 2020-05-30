/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem, disconnectRepo as disconnectRepository } from "vscode-azureappservice";
import { IActionContext } from "vscode-azureextensionui";
import { ext } from "../../extensionVariables";
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';

export async function disconnectRepo(context: IActionContext, node?: DeploymentsTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<DeploymentsTreeItem>(DeploymentsTreeItem.contextValueConnected, context);
    }

    if (node.parent instanceof SlotTreeItemBase) {
        await disconnectRepository(context, node.parent.client, node.parent.root);
        await node.refresh();
    } else {
        throw Error('Internal error: Action not supported.');
    }
}
