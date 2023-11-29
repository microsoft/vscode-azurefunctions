/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentTreeItem } from "@microsoft/vscode-azext-azureappservice";
import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { functionFilter } from "../../constants";
import { ext } from "../../extensionVariables";

export async function redeployDeployment(context: IActionContext, node?: DeploymentTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<DeploymentTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: DeploymentTreeItem.contextValue
        });
    }
    await node.redeployDeployment(context);
}
