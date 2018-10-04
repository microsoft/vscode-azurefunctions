/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appservice from 'vscode-azureappservice';
import { ext } from '../../extensionVariables';
import { FunctionAppTreeItem } from '../../tree/FunctionAppTreeItem';
import { FunctionTreeItem } from '../../tree/FunctionTreeItem';

export async function stopStreamingLogs(node?: FunctionAppTreeItem | FunctionTreeItem): Promise<void> {
    if (!node) {
        node = <FunctionAppTreeItem>await ext.tree.showTreeItemPicker(FunctionAppTreeItem.contextValue);
    }

    await appservice.stopStreamingLogs(node.root.client, node.logStreamPath);
}
