/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureParentTreeItem, AzureTreeItem, IActionContext, SubscriptionTreeItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { nodeUtils } from '../utils/nodeUtils';

export async function createFunctionApp(this: IActionContext, subscription?: AzureParentTreeItem | string, resourceGroup?: string): Promise<string> {
    let node: AzureParentTreeItem;
    if (typeof subscription === 'string') {
        node = await nodeUtils.getSubscriptionNode(ext.tree, subscription);
    } else if (!subscription) {
        node = <AzureParentTreeItem>await ext.tree.showTreeItemPicker(SubscriptionTreeItem.contextValue);
    } else {
        node = subscription;
    }

    const funcAppNode: AzureTreeItem = await node.createChild({ actionContext: this, resourceGroup });
    return funcAppNode.fullId;
}
