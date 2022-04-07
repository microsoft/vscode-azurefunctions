/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { FunctionTreeItemBase } from '../tree/FunctionTreeItemBase';

export async function copyFunctionUrl(context: IActionContext, node?: FunctionTreeItemBase): Promise<void> {
    if (!node) {
        const noItemFoundErrorMessage: string = localize('noHTTPFunctions', 'No HTTP functions found.');
        node = await ext.rgApi.tree.showTreeItemPicker<FunctionTreeItemBase>(/Function;Http;/i, { ...context, noItemFoundErrorMessage });
    }

    const triggerRequest = await node.getTriggerRequest(context);
    if (triggerRequest) {
        await vscode.env.clipboard.writeText(triggerRequest.url);
    } else {
        throw new Error(localize('CopyFailedForNonHttp', 'Function URLs can only be used for HTTP triggers.'));
    }
}
