/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureTreeDataProvider, IAzureNode } from 'vscode-azureextensionui';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import { nodeUtils } from '../utils/nodeUtils';

export async function configureDeploymentSource(telemetryProperties: { [key: string]: string; }, tree: AzureTreeDataProvider, outputChannel: vscode.OutputChannel, node?: IAzureNode<FunctionAppTreeItem>): Promise<void> {
    if (!node) {
        node = <IAzureNode<FunctionAppTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    const updatedScmType: string | undefined = await node.treeItem.siteWrapper.editScmType(nodeUtils.getWebSiteClient(node));
    if (updatedScmType !== undefined) {
        telemetryProperties.updatedScmType = updatedScmType;
        outputChannel.show(true);
        outputChannel.appendLine(`Deployment source for "${node.treeItem.siteWrapper.name}" has been updated to "${updatedScmType}".`);
    }
}
