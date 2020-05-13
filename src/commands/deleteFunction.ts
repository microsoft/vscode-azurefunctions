/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressLocation, window } from 'vscode';
import { AzExtTreeItem, DialogResponses, ITreeItemActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { AppSource } from '../tree/contextValues';
import { RemoteFunctionTreeItem } from '../tree/remoteProject/RemoteFunctionTreeItem';

export async function deleteFunction(context: ITreeItemActionContext, arg1?: AzExtTreeItem): Promise<void> {
    context.noItemFoundErrorMessage = localize('noFuntionsToDelete', 'No matching functions found or your function app is read-only.');
    context.suppressCreatePick = true;
    const node: RemoteFunctionTreeItem = await ext.tree.showTreeItemWizard({ id: 'function', source: AppSource.remote, isReadOnly: 'false' }, context, arg1);

    await node.withDeleteProgress(async () => {
        const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function "{0}"?', node.name);
        await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.deleteResponse, DialogResponses.cancel);

        const deleting: string = localize('DeletingFunction', 'Deleting function "{0}"...', node.name);
        const deleteSucceeded: string = localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', node.name);
        await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async (): Promise<void> => {
            ext.outputChannel.appendLog(deleting);
            await node.client.deleteFunction(node.name);
            window.showInformationMessage(deleteSucceeded);
            ext.outputChannel.appendLog(deleteSucceeded);
        });
    });
}
