/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { localize } from '../../../localize';
import { type BlobFixtureFile } from '../shared/blobInvocation';

export async function pickBlobFile(context: IActionContext, signal?: AbortSignal): Promise<BlobFixtureFile> {
    const checkCancellation = (): void => {
        if (signal?.aborted) {
            throw new UserCancelledError('azureInvoke.pickBlobFile');
        }
    };
    checkCancellation();
    const uri = (await context.ui.showOpenDialog({
        title: localize('azureInvoke.chooseBlobFileTitle', 'Choose a file for the Blob fixture'),
        canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
    }))[0];
    checkCancellation();
    context.valuesToMask.push(uri.fsPath, uri.toString());
    const readFailed = (): never => {
        context.telemetry.properties.failureStage = 'blobFixtureRead';
        throw new Error(localize('azureInvoke.blobFileReadFailed', 'Could not read the selected Blob fixture. Choose a readable file and try again.'));
    };
    if ((await vscode.workspace.fs.stat(uri).then(undefined, readFailed)).size > 5 * 1024 * 1024) {
        throw new Error(localize('azureInvoke.blobTooLarge', 'Blob fixtures must not exceed 5 MB of decoded content.'));
    }
    checkCancellation();
    const content = await vscode.workspace.fs.readFile(uri).then(undefined, readFailed);
    checkCancellation();
    if (content.byteLength > 5 * 1024 * 1024) {
        throw new Error(localize('azureInvoke.blobTooLarge', 'Blob fixtures must not exceed 5 MB of decoded content.'));
    }
    return { content: Buffer.from(content).toString('base64'), fileName: path.posix.basename(uri.path) };
}
