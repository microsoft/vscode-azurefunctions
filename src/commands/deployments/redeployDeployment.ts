/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentTreeItem } from "vscode-azureappservice";
import { ext } from "../../extensionVariables";

export async function redeployDeployment(node?: DeploymentTreeItem): Promise<void> {
    if (!node) {
        node = <DeploymentTreeItem>(await ext.tree.showTreeItemPicker(DeploymentTreeItem.contextValue));
    }
    await node.redeployDeployment();
}
