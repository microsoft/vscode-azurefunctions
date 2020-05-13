/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressLocation, window } from 'vscode';
import { AzExtTreeItem, DialogResponses, ITreeItemWizardContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { ProxyTreeItem } from '../tree/ProxyTreeItem';

export async function deleteProxy(context: ITreeItemWizardContext, arg1?: AzExtTreeItem): Promise<void> {
    context.noItemFoundErrorMessage = localize('noFuntionsToDelete', 'No matching proxies found or your function app is read-only.');
    context.suppressCreatePick = true;
    const node: ProxyTreeItem = await ext.tree.showTreeItemWizard(ProxyTreeItem.contextValue, context, arg1);

    const message: string = localize('ConfirmDelete', 'Are you sure you want to delete proxy "{0}"?', node.name);
    await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.deleteResponse);
    await node.withDeleteProgress(async () => {
        const deleting: string = localize('DeletingProxy', 'Deleting proxy "{0}"...', node.name);
        const deleteSucceeded: string = localize('DeleteProxySucceeded', 'Successfully deleted proxy "{0}".', node.name);
        await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async (): Promise<void> => {
            ext.outputChannel.appendLog(deleting);
            await node.parent.deleteProxy(node.name);
            window.showInformationMessage(deleteSucceeded);
            ext.outputChannel.appendLog(deleteSucceeded);
        });
    });
}
