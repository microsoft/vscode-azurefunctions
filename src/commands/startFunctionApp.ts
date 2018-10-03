/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteClient } from 'vscode-azureappservice';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';

export async function startFunctionApp(node?: FunctionAppTreeItem): Promise<void> {
    if (!node) {
        node = <FunctionAppTreeItem>await ext.tree.showTreeItemPicker(FunctionAppTreeItem.contextValue);
    }

    const client: SiteClient = node.root.client;
    await node.runWithTemporaryDescription(
        localize('starting', 'Starting...'),
        async () => {
            await client.start();
        }
    );
}
