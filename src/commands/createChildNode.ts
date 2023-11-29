/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtParentTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';

export async function createChildNode(context: IActionContext, expectedContextValue: string | RegExp, node?: AzExtParentTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<AzExtParentTreeItem>({ ...context, suppressCreatePick: true }, {
            filter: functionFilter,
            expectedChildContextValue: expectedContextValue
        });
    }

    await node.createChild(context);
}
