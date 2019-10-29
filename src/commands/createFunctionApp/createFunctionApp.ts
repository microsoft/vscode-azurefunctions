/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureParentTreeItem, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { ICreateFuntionAppContext, SubscriptionTreeItem } from '../../tree/SubscriptionTreeItem';

export async function createFunctionApp(context: IActionContext & Partial<ICreateFuntionAppContext>, subscription?: AzureParentTreeItem | string, newResourceGroupName?: string): Promise<string> {
    let node: AzureParentTreeItem | undefined;
    if (typeof subscription === 'string') {
        node = await ext.tree.findTreeItem(`/subscriptions/${subscription}`, context);
        if (!node) {
            throw new Error(localize('noMatchingSubscription', 'Failed to find a subscription matching id "{0}".', subscription));
        }
    } else if (!subscription) {
        node = await ext.tree.showTreeItemPicker<AzureParentTreeItem>(SubscriptionTreeItem.contextValue, context);
    } else {
        node = subscription;
    }

    context.newResourceGroupName = newResourceGroupName;
    const funcAppNode: ProductionSlotTreeItem = await node.createChild(context);
    funcAppNode.showCreatedOutput();

    return funcAppNode.fullId;
}

export async function createFunctionAppAdvanced(context: IActionContext, subscription?: AzureParentTreeItem | string, newResourceGroupName?: string): Promise<string> {
    return await createFunctionApp({ ...context, advancedCreation: true }, subscription, newResourceGroupName);
}
