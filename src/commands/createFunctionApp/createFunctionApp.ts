/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../../extensionVariables';
import { SlotTreeItem } from '../../tree/SlotTreeItem';
import { ICreateFunctionAppContext, SubscriptionTreeItem } from '../../tree/SubscriptionTreeItem';
import { ISiteCreatedOptions } from './showSiteCreated';

export async function createFunctionApp(context: IActionContext & Partial<ICreateFunctionAppContext>, subscription?: AzExtParentTreeItem, newResourceGroupName?: string): Promise<string> {
    let node: AzExtParentTreeItem | undefined;
    if (!subscription) {
        node = await ext.rgApi.tree.showTreeItemPicker<AzExtParentTreeItem>(SubscriptionTreeItem.contextValue, context);
    } else {
        node = subscription;
    }

    context.newResourceGroupName = newResourceGroupName;
    (<ISiteCreatedOptions>context).showCreatedNotification = true;

    const funcAppNode: SlotTreeItem = await SubscriptionTreeItem.createChild(context as ICreateFunctionAppContext, node as SubscriptionTreeItem);

    return funcAppNode.fullId;
}

export async function createFunctionAppAdvanced(context: IActionContext, subscription?: AzExtParentTreeItem, newResourceGroupName?: string): Promise<string> {
    return await createFunctionApp({ ...context, advancedCreation: true }, subscription, newResourceGroupName);
}
