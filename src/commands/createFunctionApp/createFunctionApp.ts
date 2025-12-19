/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullValueAndProp, type AzExtParentTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { SubscriptionTreeItem, type ICreateFunctionAppContext } from '../../tree/SubscriptionTreeItem';
import { type ContainerTreeItem } from '../../tree/containerizedFunctionApp/ContainerTreeItem';
import { getRootWorkspaceFolder, isMultiRootWorkspace } from '../../utils/workspace';

function isSubscription(item?: AzExtParentTreeItem): boolean {
    try {
        // Accessing item.subscription throws an error for some workspace items
        // see https://github.com/microsoft/vscode-azurefunctions/issues/3731
        return !!item && !!item.subscription;
    } catch {
        return false;
    }
}

export async function createFunctionApp(context: IActionContext & Partial<ICreateFunctionAppContext>, subscription?: AzExtParentTreeItem | string, nodesOrNewResourceGroupName?: string | (string | AzExtParentTreeItem)[]): Promise<string> {
    const newResourceGroupName = Array.isArray(nodesOrNewResourceGroupName) ? undefined : nodesOrNewResourceGroupName;
    let node: AzExtParentTreeItem | undefined;
    if (typeof subscription === 'string') {
        node = await ext.rgApi.tree.findTreeItem(`/subscriptions/${subscription}`, context);
        if (!node) {
            throw new Error(localize('noMatchingSubscription', 'Failed to find a subscription matching id "{0}".', subscription));
        }
    } else if (!isSubscription(subscription)) {
        node = await ext.rgApi.appResourceTree.showTreeItemPicker<AzExtParentTreeItem>(SubscriptionTreeItem.contextValue, context);
    } else {
        node = subscription;
    }

    context.newResourceGroupName = newResourceGroupName;
    if (!isMultiRootWorkspace()) {
        // only set the workspace if we're not doing in a multiroot project
        context.workspaceFolder = await getRootWorkspaceFolder(context);
    }

    const funcAppNode: SlotTreeItem | ContainerTreeItem = await SubscriptionTreeItem.createChild(context as ICreateFunctionAppContext, node as SubscriptionTreeItem);

    // Full id has it as "undefined/subscriptions/...."
    return nonNullValueAndProp(funcAppNode.site, 'id');
}

export async function createFunctionAppAdvanced(context: IActionContext, subscription?: AzExtParentTreeItem | string, nodesOrNewResourceGroupName?: string | (string | AzExtParentTreeItem)[]): Promise<string | undefined> {
    return await createFunctionApp({ ...context, advancedCreation: true }, subscription, nodesOrNewResourceGroupName);
}
