/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from 'vscode-azureappservice';
import { AzureTreeDataProvider, IAzureNode } from 'vscode-azureextensionui';

export async function editAppSetting(tree: AzureTreeDataProvider, node?: IAzureNode<AppSettingTreeItem>): Promise<void> {
    if (!node) {
        node = <IAzureNode<AppSettingTreeItem>>await tree.showNodePicker(AppSettingTreeItem.contextValue);
    }

    await node.treeItem.edit(node);
}
