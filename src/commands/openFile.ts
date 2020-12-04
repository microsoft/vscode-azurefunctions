/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileTreeItem } from 'vscode-azureappservice';
import { IActionContext } from 'vscode-azureextensionui';

export async function openFile(context: IActionContext, node: FileTreeItem): Promise<void> {
    await node.openReadOnly(context);
}
