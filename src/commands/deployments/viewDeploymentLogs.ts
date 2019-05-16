/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentTreeItem } from "vscode-azureappservice";
import { ext } from "../../extensionVariables";

export async function viewDeploymentLogs(node?: DeploymentTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<DeploymentTreeItem>(DeploymentTreeItem.contextValue);
    }
    await node.viewDeploymentLogs();
}
