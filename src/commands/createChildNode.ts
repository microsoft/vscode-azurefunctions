/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureParentTreeItem, ISubscriptionRoot } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';

export async function createChildNode<T extends ISubscriptionRoot>(expectedContextValue: string, node?: AzureParentTreeItem<T>): Promise<void> {
    if (!node) {
        node = <AzureParentTreeItem<T>>await ext.tree.showTreeItemPicker(expectedContextValue);
    }

    await node.createChild();
}
