/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureTreeDataProvider, IAzureNode, TelemetryProperties } from 'vscode-azureextensionui';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import { nodeUtils } from '../utils/nodeUtils';

export async function configureDeploymentSource(telemetryProperties: TelemetryProperties, tree: AzureTreeDataProvider, outputChannel: vscode.OutputChannel, node?: IAzureNode<FunctionAppTreeItem>): Promise<void> {
    if (!node) {
        node = <IAzureNode<FunctionAppTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    const updatedScmType: string | undefined = await node.treeItem.siteWrapper.editScmType(node, nodeUtils.getWebSiteClient(node), outputChannel);
    if (updatedScmType !== undefined) {
        telemetryProperties.updatedScmType = updatedScmType;
    }
}
