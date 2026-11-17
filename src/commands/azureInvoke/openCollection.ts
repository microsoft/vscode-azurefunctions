/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { parseInvocationCollection } from '../../azureInvoke/collectionFile';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type HttpInvocation } from '../../webviews/azureInvoke/shared/httpRequest';

export async function openCollection(context: IActionContext, uri?: unknown): Promise<void> {
    if (ext.invocationCollection.list().length || ext.invocationEditorManager.size) {
        await context.ui.showWarningMessage(
            localize('azureInvoke.replaceCollection', 'Opening a collection replaces the current session collection and closes its request tabs. Unsaved edits and invocations not exported to a collection file will be lost.'),
            { modal: true, stepName: 'confirmOpenInvocationCollection' },
            { title: localize('azureInvoke.openCollectionConfirm', 'Open Collection') },
        );
    }

    // View toolbar actions pass view context rather than a file.
    const collection = await openCollectionFile(context, uri instanceof vscode.Uri ? uri : undefined);
    ext.invocationEditorManager.closeAll();
    ext.chainInvocationRunner.clear();
    ext.invocationCollection.replace(collection);
}

export async function openCollectionFile(context: IActionContext, source?: vscode.Uri): Promise<HttpInvocation[]> {
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
