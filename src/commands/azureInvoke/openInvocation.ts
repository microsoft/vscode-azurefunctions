/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type InvocationItem } from '../../tree/azureInvoke/InvocationItem';

export function openInvocation(context: IActionContext, node?: InvocationItem): void {
    context.telemetry.maskEntireErrorMessage = true;

    const invocation = node && ext.invocationCollection.get(node.id);
    if (!invocation) {
        throw new Error(localize('azureInvoke.requestNotFound', 'This invocation is no longer in the collection.'));
    }

    ext.invocationEditorManager.open(invocation, true);
}
