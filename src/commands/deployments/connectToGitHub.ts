/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem, editScmType } from "@microsoft/vscode-azext-azureappservice";
import { GenericTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { functionFilter, ScmType } from "../../constants";
import { ext } from "../../extensionVariables";
import { isSlotTreeItem, SlotTreeItem } from "../../tree/SlotTreeItem";

export async function connectToGitHub(context: IActionContext, target?: GenericTreeItem): Promise<void> {
    const parentNode: SlotTreeItem = await ext.rgApi.pickAppResource<SlotTreeItem>(context, {
        filter: functionFilter,
    });

    let connectToNode: GenericTreeItem;

    if (!target) {
        connectToNode = await ext.rgApi.appResourceTree.showTreeItemPicker<GenericTreeItem>('ConnectToGithub', context, parentNode);
    } else {
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
