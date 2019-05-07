/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureParentTreeItem, IActionContext, SubscriptionTreeItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
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

    const funcAppNode: ProductionSlotTreeItem = <ProductionSlotTreeItem>(await node.createChild({ actionContext: this, resourceGroup }));
    funcAppNode.showCreatedOutput();

    return funcAppNode.fullId;
}
