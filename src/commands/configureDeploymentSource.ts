/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editScmType } from 'vscode-azureappservice';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';

export async function configureDeploymentSource(this: IActionContext, node?: FunctionAppTreeItem): Promise<void> {
    if (!node) {
        node = <FunctionAppTreeItem>await ext.tree.showTreeItemPicker(FunctionAppTreeItem.contextValue);
    }

    const updatedScmType: string | undefined = await editScmType(node.root.client, node);
    if (updatedScmType !== undefined) {
        this.properties.updatedScmType = updatedScmType;
    }
}
