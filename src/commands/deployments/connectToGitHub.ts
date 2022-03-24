/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem, editScmType } from "@microsoft/vscode-azext-azureappservice";
import { GenericTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { ScmType } from "../../constants";
import { ext } from "../../extensionVariables";
import { ResolvedFunctionAppResource } from "../../tree/ResolvedFunctionAppResource";
import { SlotTreeItemBase } from "../../tree/SlotTreeItemBase";

export async function connectToGitHub(context: IActionContext, target?: GenericTreeItem): Promise<void> {
    let node: SlotTreeItemBase | DeploymentsTreeItem;

    if (!target) {
        node = await ext.rgApi.tree.showTreeItemPicker<SlotTreeItemBase>(new RegExp(ResolvedFunctionAppResource.productionContextValue), context);
    } else {
        node = <DeploymentsTreeItem>target.parent;
    }

    if (node?.parent instanceof SlotTreeItemBase) {
        await editScmType(context, node.site, node.subscription, ScmType.GitHub);
    } else {
        throw Error('Internal error: Action not supported.');
    }

    if (node instanceof SlotTreeItemBase) {
        if (node.deploymentsNode) {
            await node.deploymentsNode.refresh(context);
        }
    } else {
        await node.parent?.refresh(context);
    }
}
