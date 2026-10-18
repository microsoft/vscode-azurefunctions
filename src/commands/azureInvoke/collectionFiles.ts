/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { parseInvocationCollection, serializeInvocationCollection } from '../../tree/azureInvoke/invocationCollection';
import { type Invocation } from '../../webviews/azureInvoke/shared/blobInvocation';

export async function saveCollectionFile(context: IActionContext, invocations: readonly Invocation[], target?: vscode.Uri): Promise<void> {
    if (!invocations.length) {
        throw new Error(localize('azureInvoke.emptyCollection', 'Save an invocation in the editor before saving a collection.'));
    }
    const content = serializeInvocationCollection(invocations);
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const uri = target ?? await vscode.window.showSaveDialog({
        title: localize('azureInvoke.saveCollection', 'Save Azure Invoke Collection'),
        defaultUri: folder && vscode.Uri.joinPath(folder, 'azure-invoke.collection.json'),
        filters: { JSON: ['json'] },
    });
    if (!uri) {
        throw new UserCancelledError('azureInvoke.saveCollection');
    }
    context.valuesToMask.push(uri.fsPath, uri.toString());
    const save = { title: localize('azureInvoke.saveCollectionConfirm', 'Save Collection') };
    await context.ui.showWarningMessage(
        localize('azureInvoke.collectionSecrets', 'This file will contain all saved request data and Blob fixture contents in plain text or reversible Base64, including any function keys or authorization credentials. Keep it private and do not commit it to source control. Unsaved editor changes are not included.'),
        { modal: true, stepName: 'confirmSaveInvocationCollection' },
        save,
    );
    if (target && await AzExtFsExtra.pathExists(uri)) {
        await context.ui.showWarningMessage(
            localize('azureInvoke.overwriteCollection', 'A file already exists at this location. Overwrite it?'),
            { modal: true, stepName: 'overwriteInvocationCollection' },
            { title: localize('azureInvoke.overwrite', 'Overwrite') },
        );
    }
    await AzExtFsExtra.writeFile(uri, content);
}

export async function openCollectionFile(context: IActionContext, source?: vscode.Uri): Promise<Invocation[]> {
    const uri = source ?? (await context.ui.showOpenDialog({
        title: localize('azureInvoke.openCollection', 'Open Azure Invoke Collection'),
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { JSON: ['json'] },
    }))[0];
    context.valuesToMask.push(uri.fsPath, uri.toString());
    return parseInvocationCollection(await AzExtFsExtra.readFile(uri));
}
