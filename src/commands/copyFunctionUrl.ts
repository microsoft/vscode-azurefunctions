/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITreeItemWizardContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { FunctionTreeItemBase } from '../tree/FunctionTreeItemBase';

export async function copyFunctionUrl(context: ITreeItemWizardContext, node?: FunctionTreeItemBase): Promise<void> {
    context.noItemFoundErrorMessage = localize('noHTTPFunctions', 'No HTTP functions found.');
    node = await ext.tree.showTreeItemWizard<FunctionTreeItemBase>(/Function;Http;/i, context, node);

    if (node.triggerUrl) {
        await vscode.env.clipboard.writeText(node.triggerUrl);
    } else {
        throw new Error(localize('CopyFailedForNonHttp', 'Function URLs can only be used for HTTP triggers.'));
    }
}
