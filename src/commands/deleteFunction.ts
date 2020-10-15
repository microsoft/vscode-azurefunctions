/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem, IActionContext, ITreeItemPickerContext } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { deleteNode } from './deleteNode';

export async function deleteFunction(context: IActionContext, node?: AzExtTreeItem): Promise<void> {
    (<ITreeItemPickerContext>context).noItemFoundErrorMessage = localize('noFunctionsToDelete', 'No matching functions found or your function app is read-only.');
    await deleteNode(context, /Remote;ReadWrite;Function;/i, node);
}
