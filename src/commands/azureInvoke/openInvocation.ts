/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type AzureInvokeTreeDataProvider } from '../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { type HttpRequestEditors } from '../../webviews/azureInvoke/extension/HttpRequestEditors';

export function openInvocationCommandFactory(provider: AzureInvokeTreeDataProvider, editors: HttpRequestEditors) {
    return (context: IActionContext, request?: { id: string }): void => {
        context.telemetry.maskEntireErrorMessage = true;

        const invocation = request && provider.getRequest(request.id);
        if (!invocation) {
            throw new Error(localize('azureInvoke.requestNotFound', 'This invocation is no longer in the collection.'));
        }

        editors.open(invocation, true);
    };
}
