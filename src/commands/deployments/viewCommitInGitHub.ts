/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentTreeItem } from "vscode-azureappservice";
import { IActionContext } from "vscode-azureextensionui";
import { ext } from "../../extensionVariables";

export async function viewCommitInGitHub(context: IActionContext, node?: DeploymentTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemWizard<DeploymentTreeItem>({ id: DeploymentTreeItem.contextValueId, scmType: 'github' }, context);
    }
    await node.viewCommitInGitHub();
}
