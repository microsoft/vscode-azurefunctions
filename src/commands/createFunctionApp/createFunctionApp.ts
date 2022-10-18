/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzExtTreeDataProvider, compatibilitySubscriptionExperience, IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { SlotTreeItem } from '../../tree/SlotTreeItem';
import { ICreateFunctionAppContext, SubscriptionTreeItem } from '../../tree/SubscriptionTreeItem';
import { ISiteCreatedOptions } from './showSiteCreated';

export async function createFunctionApp(context: IActionContext & Partial<ICreateFunctionAppContext>, subscription?: AzExtParentTreeItem | string, nodesOrNewResourceGroupName?: string | (string | AzExtParentTreeItem)[]): Promise<string> {
    const newResourceGroupName = Array.isArray(nodesOrNewResourceGroupName) ? undefined : nodesOrNewResourceGroupName;
    let node: AzExtParentTreeItem | undefined;
    if (typeof subscription === 'string') {
        node = await ext.rgApi.tree.findTreeItem(`/subscriptions/${subscription}`, context);
        if (!node) {
            throw new Error(localize('noMatchingSubscription', 'Failed to find a subscription matching id "{0}".', subscription));
        }
    } else if (!subscription) {
        const subscriptionContext = await compatibilitySubscriptionExperience(context, ext.v2rgApi.applicationResourceTreeDataProvider);

        node = (<Partial<AzExtParentTreeItem>>{
            treeDataProvider: {} as AzExtTreeDataProvider,
            valuesToMask: [],
            id: '',
            label: '',
            subscription: subscriptionContext,
            parent: undefined,
        }) as unknown as AzExtParentTreeItem;

        // node = await ext.rgApi.tree.showTreeItemPicker<AzExtParentTreeItem>(SubscriptionTreeItem.contextValue, context);
    } else {
        node = subscription;
    }

    context.newResourceGroupName = newResourceGroupName;
    (<ISiteCreatedOptions>context).showCreatedNotification = true;

    const funcAppNode: SlotTreeItem = await SubscriptionTreeItem.createChild(context as ICreateFunctionAppContext, node as SubscriptionTreeItem);

    return funcAppNode.fullId;
}

export async function createFunctionAppAdvanced(context: IActionContext, subscription?: AzExtParentTreeItem | string, nodesOrNewResourceGroupName?: string | (string | AzExtParentTreeItem)[]): Promise<string> {
    return await createFunctionApp({ ...context, advancedCreation: true }, subscription, nodesOrNewResourceGroupName);
}
