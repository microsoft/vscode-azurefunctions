/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeDataProvider, IAzureNode } from 'vscode-azureextensionui';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import { startFunctionApp } from './startFunctionApp';
import { stopFunctionApp } from './stopFunctionApp';

export async function restartFunctionApp(tree: AzureTreeDataProvider, node?: IAzureNode<FunctionAppTreeItem>): Promise<void> {
    await stopFunctionApp(tree, node);
    await startFunctionApp(tree, node);
}
