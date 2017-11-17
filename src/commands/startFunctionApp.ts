/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { AzureTreeDataProvider, IAzureNode } from 'vscode-azureextensionui';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import { nodeUtils } from '../utils/nodeUtils';

export async function startFunctionApp(tree: AzureTreeDataProvider, node?: IAzureNode<FunctionAppTreeItem>): Promise<void> {
    if (!node) {
        node = <IAzureNode<FunctionAppTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
    await node.treeItem.siteWrapper.start(client);
    tree.refresh(node.parent);
}
