/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem, editScmType } from "@microsoft/vscode-azext-azureappservice";
import { GenericTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { functionFilter, ScmType } from "../../constants";
import { ext } from "../../extensionVariables";
import { ResolvedFunctionAppResource } from "../../tree/ResolvedFunctionAppResource";
import { SlotTreeItem } from "../../tree/SlotTreeItem";

export async function connectToGitHub(context: IActionContext, target?: GenericTreeItem): Promise<void> {
    let node: SlotTreeItem | DeploymentsTreeItem;

    if (!target) {
        node = await ext.rgApi.pickAppResource<SlotTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(ResolvedFunctionAppResource.productionContextValue)
        });
    } else {
        node = <DeploymentsTreeItem>target.parent;
    }

    if (node?.parent instanceof SlotTreeItem) {
        await editScmType(context, node.site, node.subscription, ScmType.GitHub);
    } else {
        throw Error('Internal error: Action not supported.');
    }

    if (node instanceof SlotTreeItem) {
        if (node.deploymentsNode) {
            await node.deploymentsNode.refresh(context);
        }
    } else {
        await node.parent?.refresh(context);
    }
}
