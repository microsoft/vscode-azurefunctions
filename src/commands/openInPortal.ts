/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ext } from '../extensionVariables';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';

export async function openInPortal(node?: FunctionAppTreeItem): Promise<void> {
    if (!node) {
        node = <FunctionAppTreeItem>await ext.tree.showTreeItemPicker(FunctionAppTreeItem.contextValue);
    }

    node.openInPortal();
}
