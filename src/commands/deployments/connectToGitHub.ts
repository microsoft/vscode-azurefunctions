/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem } from "vscode-azureappservice";
import { GenericTreeItem, IActionContext } from "vscode-azureextensionui";
import { ext } from "../../extensionVariables";
import { ProductionSlotTreeItem } from "../../tree/ProductionSlotTreeItem";

export async function connectToGitHub(context: IActionContext, target?: GenericTreeItem): Promise<void> {
    let node: ProductionSlotTreeItem | DeploymentsTreeItem;

    if (!target) {
        node = await ext.tree.showTreeItemPicker<ProductionSlotTreeItem>(ProductionSlotTreeItem.contextValue, context);
    } else {
        node = <DeploymentsTreeItem>target.parent;
    }

    if (node instanceof DeploymentsTreeItem) {
        // await editScmType(node.client, node.parent.root, context, ScmType.GitHub);
        await node.parent?.refresh();
    } else if (node instanceof ProductionSlotTreeItem) {
        if (node.deploymentsNode) {
            await node.deploymentsNode.refresh();
        }
    }
}
