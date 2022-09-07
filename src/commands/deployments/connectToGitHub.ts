/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem, editScmType } from "@microsoft/vscode-azext-azureappservice";
import { GenericTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { connectToGithubContextValue, functionFilter, ScmType } from "../../constants";
import { ext } from "../../extensionVariables";
import { ResolvedFunctionAppResource } from "../../tree/ResolvedFunctionAppResource";
import { isSlotTreeItem, SlotTreeItem } from "../../tree/SlotTreeItem";
import { treeUtils } from "../../utils/treeUtils";

export async function connectToGitHub(context: IActionContext, target?: GenericTreeItem): Promise<void> {
    let parentNode: SlotTreeItem;
    let connectToNode: GenericTreeItem;

    if (!target) {
        parentNode = await ext.rgApi.pickAppResource<SlotTreeItem>(context, {
            filter: functionFilter,
        });

        try {
            connectToNode = await ext.rgApi.appResourceTree.showTreeItemPicker<GenericTreeItem>(connectToGithubContextValue, context, parentNode);
        } catch (_err) {
            // Swallow an edge-case error where running from command palette causes showTreeItemPicker to sometimes queue running an extra time after finishing command execution
            return;
        }
    } else {
        parentNode = treeUtils.findNearestParent<SlotTreeItem>(target, ResolvedFunctionAppResource.productionContextValue);
        connectToNode = target;
    }

    const node: DeploymentsTreeItem = connectToNode.parent as DeploymentsTreeItem;

    if (node.parent && isSlotTreeItem(node.parent)) {
        await editScmType(context, node.site, node.subscription, ScmType.GitHub);
        await parentNode.refresh(context);
    } else {
        throw new Error('Internal error: Action not supported.');
    }
}
