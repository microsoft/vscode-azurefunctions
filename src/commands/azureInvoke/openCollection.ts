/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { openCollectionFile } from './collectionFiles';

export async function openCollection(context: IActionContext, uri?: unknown): Promise<void> {
    // View toolbar actions pass view context rather than a file.
    const collection = await openCollectionFile(context, uri instanceof vscode.Uri ? uri : undefined);
    if (ext.invocationCollection.list().length || ext.invocationEditorManager.size) {
        await context.ui.showWarningMessage(
            localize('azureInvoke.replaceCollection', 'Opening a collection replaces the current session collection and closes its request tabs. Unsaved edits and invocations not exported to a collection file will be lost.'),
            { modal: true, stepName: 'confirmOpenInvocationCollection' },
            { title: localize('azureInvoke.openCollectionConfirm', 'Open Collection') },
        );
    }

    ext.invocationEditorManager.closeAll();
    ext.chainInvocationRunner.clear();
    ext.invocationCollection.replace(collection);
}
