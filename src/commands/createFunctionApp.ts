/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeDataProvider, IActionContext, IAzureNode, IAzureParentNode } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { nodeUtils } from '../utils/nodeUtils';

export async function createFunctionApp(actionContext: IActionContext, tree: AzureTreeDataProvider, subscription?: IAzureParentNode | string, resourceGroup?: string): Promise<string> {
    let node: IAzureParentNode;
    if (typeof subscription === 'string') {
        node = await nodeUtils.getSubscriptionNode(tree, subscription);
    } else if (!subscription) {
        node = <IAzureParentNode>await ext.tree.showNodePicker(AzureTreeDataProvider.subscriptionContextValue);
    } else {
        node = subscription;
    }

    const funcAppNode: IAzureNode = await node.createChild({ actionContext, resourceGroup });
    return funcAppNode.id;
}
