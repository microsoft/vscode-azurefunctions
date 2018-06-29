/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editScmType } from 'vscode-azureappservice';
import { AzureTreeDataProvider, IAzureNode, TelemetryProperties } from 'vscode-azureextensionui';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';

export async function configureDeploymentSource(telemetryProperties: TelemetryProperties, tree: AzureTreeDataProvider, node?: IAzureNode<FunctionAppTreeItem>): Promise<void> {
    if (!node) {
        node = <IAzureNode<FunctionAppTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    const updatedScmType: string | undefined = await editScmType(node.treeItem.client, node);
    if (updatedScmType !== undefined) {
        telemetryProperties.updatedScmType = updatedScmType;
    }
}
