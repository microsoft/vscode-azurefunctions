/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeploymentsTreeItem } from "vscode-azureappservice";
import { IActionContext } from "vscode-azureextensionui";
import { ext } from "../../extensionVariables";

export async function disconnectRepo(this: IActionContext, node?: DeploymentsTreeItem): Promise<void> {
    if (!node) {
        node = <DeploymentsTreeItem>(await ext.tree.showTreeItemPicker(DeploymentsTreeItem.contextValueConnected));
    }
    await node.disconnectRepo(this);
}
