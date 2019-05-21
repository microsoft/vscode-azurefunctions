/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem, editScmType } from "vscode-azureappservice";
import { IActionContext } from "vscode-azureextensionui";
import { ScmType } from "../../constants";
import { ext } from "../../extensionVariables";
import { ProductionSlotTreeItem } from "../../tree/ProductionSlotTreeItem";

export async function connectToGitHub(context: IActionContext, node?: ProductionSlotTreeItem | DeploymentsTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<ProductionSlotTreeItem>(ProductionSlotTreeItem.contextValue, context);
    }
    await editScmType(node.root.client, node, context, ScmType.GitHub);
    if (node instanceof ProductionSlotTreeItem) {
        if (node.deploymentsNode) {
            await node.deploymentsNode.refresh();
        }
    } else {
        await node.parent.refresh();
    }
}
