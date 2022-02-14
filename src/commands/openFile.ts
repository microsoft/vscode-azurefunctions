/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileTreeItem } from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';

export async function openFile(context: IActionContext, node: FileTreeItem): Promise<void> {
    context.telemetry.eventVersion = 2;
    await node.openReadOnly(context);
}
