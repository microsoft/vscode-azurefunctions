/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem, editScmType } from "@microsoft/vscode-azext-azureappservice";
import { type GenericTreeItem, type IActionContext } from "@microsoft/vscode-azext-utils";
import { ScmType, functionFilter } from "../../constants";
import { ext } from "../../extensionVariables";
import { isSlotTreeItem } from "../../tree/SlotTreeItem";

export async function connectToGitHub(context: IActionContext, target?: GenericTreeItem): Promise<void> {
    let deployments: DeploymentsTreeItem;

    if (!target) {
        deployments = await ext.rgApi.pickAppResource<DeploymentsTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(DeploymentsTreeItem.contextValueUnconnected)
        });
    } else {
        deployments = <DeploymentsTreeItem>target.parent;
    }

    await deployments.init(context);
    if (deployments.parent && isSlotTreeItem(deployments.parent)) {
        const siteItem = deployments.parent;
        await siteItem.initSite(context);
        await editScmType(context, deployments.site, deployments.subscription, ScmType.GitHub);
        await deployments.refresh(context);
    } else {
        throw Error('Internal error: Action not supported.');
    }
}
