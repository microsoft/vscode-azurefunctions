/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type SlotTreeItem } from '../tree/SlotTreeItem';
import { pickContainerOrFunctionApp } from '../utils/pickContainerOrFunctionApp';

export async function deleteFunctionApp(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await pickContainerOrFunctionApp({ ...context, suppressCreatePick: true });
    }

    await node.deleteTreeItem(context);
}

