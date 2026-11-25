/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { serializeInvocationCollection } from '../../azureInvoke/collectionFile';
import { findCollectionExportCredential } from '../../azureInvoke/findCollectionExportCredential';
import { type HttpInvocation } from '../../azureInvoke/models/httpSchema';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';

export async function saveCollection(context: IActionContext, uri?: unknown): Promise<void> {
    await saveCollectionFile(context, ext.invocationCollection.list(), uri instanceof vscode.Uri ? uri : undefined);
}

/**
 * Exports saved snapshots, prompting only for detected credentials or an explicit overwrite.
 */
export async function saveCollectionFile(context: IActionContext, invocations: readonly HttpInvocation[], target?: vscode.Uri): Promise<void> {
    if (!invocations.length) {
        throw new Error(localize('azureInvoke.emptyCollection', 'Save an invocation in the editor before saving a collection.'));
    }

    const content = serializeInvocationCollection(invocations);
    const credential = findCollectionExportCredential(invocations);
    if (credential) {
        await context.ui.showWarningMessage(
            localize('azureInvoke.collectionCredentialWarning',
                'Possible credentials detected in {0} in invocation {1}. Saving writes these values in plain text, even in disabled fields. Cancel to remove them or replace them with request bindings before committing or sharing the file.',
                credential.location, credential.invocationNumber),
            { modal: true, stepName: 'confirmSaveInvocationCollection' },
            { title: localize('azureInvoke.saveCollectionAnyway', 'Save Anyway') },
        );
    }
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;

    const uri = target ?? await vscode.window.showSaveDialog({
        title: localize('azureInvoke.saveCollectionAs', 'Save Azure Invoke Collection As'),
        defaultUri: folder && vscode.Uri.joinPath(folder, 'azure-invoke.collection.json'),
        filters: { JSON: ['json'] },
    });
    if (!uri) {
        throw new UserCancelledError('azureInvoke.saveCollection');
    }

    context.valuesToMask.push(uri.fsPath, uri.toString());

    // The save dialog handles overwrites itself. An explicit target bypasses that dialog.
    if (target && await AzExtFsExtra.pathExists(uri)) {
        await context.ui.showWarningMessage(
            localize('azureInvoke.overwriteCollection', 'A file already exists at this location. Overwrite it?'),
            { modal: true, stepName: 'overwriteInvocationCollection' },
            { title: localize('azureInvoke.overwrite', 'Overwrite') },
        );
    }
    await AzExtFsExtra.writeFile(uri, content);
}
