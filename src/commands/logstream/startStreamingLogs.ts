/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureActionHandler, AzureTreeDataProvider, IAzureNode } from 'vscode-azureextensionui';
import KuduClient from 'vscode-azurekudu';
import { localize } from '../../localize';
import { FunctionAppTreeItem } from '../../tree/FunctionAppTreeItem';
import { nodeUtils } from '../../utils/nodeUtils';
import { ILogStreamTreeItem } from './ILogStreamTreeItem';

export async function startStreamingLogs(context: vscode.ExtensionContext, actionHandler: AzureActionHandler, tree: AzureTreeDataProvider, node?: IAzureNode<ILogStreamTreeItem>): Promise<void> {
    if (!node) {
        node = <IAzureNode<ILogStreamTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    const client: KuduClient = await nodeUtils.getKuduClient(node, node.treeItem.siteWrapper);
    const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(localize('logStreamLabel', '{0} - Log Stream', node.treeItem.logStreamLabel));
    context.subscriptions.push(outputChannel);
    node.treeItem.logStream = await node.treeItem.siteWrapper.startStreamingLogs(client, actionHandler, outputChannel, node.treeItem.logStreamPath);
}
