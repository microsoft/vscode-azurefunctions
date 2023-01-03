/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function deleteFunctionApp(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<SlotTreeItem>({ ...context, suppressCreatePick: true }, {
            filter: functionFilter,
        });
    }

    await node.deleteTreeItem(context);
}

