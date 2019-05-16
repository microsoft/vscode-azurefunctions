/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureParentTreeItem, AzureTreeItem, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { SubscriptionTreeItem } from '../tree/SubscriptionTreeItem';

export async function createFunctionApp(this: IActionContext, subscription?: AzureParentTreeItem | string, resourceGroup?: string): Promise<string> {
    let node: AzureParentTreeItem | undefined;
    if (typeof subscription === 'string') {
        node = await ext.tree.findTreeItem(`/subscriptions/${subscription}`);
        if (!node) {
            throw new Error(localize('noMatchingSubscription', 'Failed to find a subscription matching id "{0}".', subscription));
        }
    } else if (!subscription) {
        node = await ext.tree.showTreeItemPicker<AzureParentTreeItem>(SubscriptionTreeItem.contextValue);
    } else {
        node = subscription;
    }

    const funcAppNode: AzureTreeItem = await node.createChild({ actionContext: this, resourceGroup });
    return funcAppNode.fullId;
}
