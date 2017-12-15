/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { AzureTreeDataProvider, IAzureNode } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import { nodeUtils } from '../utils/nodeUtils';

export async function stopFunctionApp(tree: AzureTreeDataProvider, node?: IAzureNode<FunctionAppTreeItem>): Promise<void> {
    if (!node) {
        node = <IAzureNode<FunctionAppTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
    node.treeItem.state = localize('stopping', 'Stopping...');
    try {
        node.refresh();
        await node.treeItem.siteWrapper.stop(client);
    } finally {
        node.treeItem.state = await node.treeItem.siteWrapper.getState(client);
        node.refresh();
    }
}
