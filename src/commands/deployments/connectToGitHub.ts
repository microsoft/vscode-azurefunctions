/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem, editScmType } from "vscode-azureappservice";
import { GenericTreeItem, IActionContext } from "vscode-azureextensionui";
import { ScmType } from "../../constants";
import { ext } from "../../extensionVariables";
import { ProductionSlotTreeItem } from "../../tree/ProductionSlotTreeItem";
import { SlotTreeItemBase } from "../../tree/SlotTreeItemBase";

export async function connectToGitHub(context: IActionContext, target?: GenericTreeItem): Promise<void> {
    let node: ProductionSlotTreeItem | DeploymentsTreeItem;

    if (!target) {
        node = await ext.tree.showTreeItemPicker<ProductionSlotTreeItem>(ProductionSlotTreeItem.contextValue, context);
    } else {
        node = <DeploymentsTreeItem>target.parent;
    }

    if (node?.parent instanceof SlotTreeItemBase) {
        await editScmType(context, node.parent.root.client, node.parent.root, ScmType.GitHub);
    } else {
        throw Error('Internal error: Action not supported.');
    }

    if (node instanceof ProductionSlotTreeItem) {
        if (node.deploymentsNode) {
            await node.deploymentsNode.refresh();
        }
    } else {
        await node.parent?.refresh();
    }
}
