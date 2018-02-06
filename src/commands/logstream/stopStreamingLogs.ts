/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureTreeDataProvider, IAzureNode } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { FunctionAppTreeItem } from '../../tree/FunctionAppTreeItem';
import { ILogStreamTreeItem } from './ILogStreamTreeItem';

export async function stopStreamingLogs(tree: AzureTreeDataProvider, node?: IAzureNode<ILogStreamTreeItem>): Promise<void> {
    if (!node) {
        node = <IAzureNode<ILogStreamTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    if (node.treeItem.logStream && node.treeItem.logStream.isConnected) {
        node.treeItem.logStream.dispose();
    } else {
        await vscode.window.showWarningMessage(localize('logStreamAlreadyDisconnected', 'The log-streaming service for "{0}" is already disconnected.', node.treeItem.logStreamLabel));
    }
}
