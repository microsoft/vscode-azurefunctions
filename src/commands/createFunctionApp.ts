/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem, window } from 'vscode';
import { AzureParentTreeItem, IActionContext, SubscriptionTreeItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { nodeUtils } from '../utils/nodeUtils';
import { deploy } from './deploy/deploy';

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
    const createdNewApp: string = localize('createdNewFunctionApp', 'Created new function app "{0}": {1}', funcAppNode.root.client.fullName, "https://" + funcAppNode.root.client.defaultHostName);

    ext.outputChannel.appendLine(createdNewApp);
    ext.outputChannel.appendLine('');
    const viewOutput: MessageItem = {
        title: localize('viewOutput', 'View Output')
    };
    const deployButton: MessageItem = {
        title: 'Deploy to Function App'
    };

    //tslint:disable-next-line: no-this-assignment
    const actionContext: IActionContext = this;
    // Note: intentionally not waiting for the result of this before returning
    window.showInformationMessage(createdNewApp, deployButton, viewOutput).then(async (result: MessageItem | undefined) => {
        if (result === viewOutput) {
            ext.outputChannel.show();
        } else if (result === deployButton) {
            await deploy(actionContext, funcAppNode);
        }
    });

    return funcAppNode.fullId;
}
