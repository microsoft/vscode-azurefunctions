/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzureParentTreeItem, ITreeItemActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { ICreateFuntionAppContext, SubscriptionTreeItem } from '../../tree/SubscriptionTreeItem';

export async function createFunctionApp(context: ITreeItemActionContext & Partial<ICreateFuntionAppContext>, arg1?: AzureParentTreeItem | string, newResourceGroupName?: string): Promise<string> {
    let startingTreeItem: AzExtParentTreeItem | undefined;
    if (typeof arg1 === 'string') {
        startingTreeItem = await ext.tree.findTreeItem(`/subscriptions/${arg1}`, context);
        if (!startingTreeItem) {
            throw new Error(localize('noMatchingSubscription', 'Failed to find a subscription matching id "{0}".', arg1));
        }
    } else {
        startingTreeItem = arg1;
    }

    // tslint:disable-next-line: strict-boolean-expressions
    context.action = context.action || 'createChild';
    context.newResourceGroupName = newResourceGroupName;
    const funcAppNode: ProductionSlotTreeItem = await ext.tree.showTreeItemWizard(SubscriptionTreeItem.contextValueId, context, startingTreeItem);
    funcAppNode.showCreatedOutput();

    return funcAppNode.fullId;
}

export async function createFunctionAppAdvanced(context: ITreeItemActionContext, subscription?: AzureParentTreeItem | string, newResourceGroupName?: string): Promise<string> {
    context.action = 'createChildAdvanced';
    return await createFunctionApp(context, subscription, newResourceGroupName);
}
