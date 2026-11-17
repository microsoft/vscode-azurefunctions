/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { saveCollectionFile } from './collectionFiles';

export async function saveCollection(context: IActionContext, uri?: unknown): Promise<void> {
    context.telemetry.maskEntireErrorMessage = true;
    // View toolbar actions pass view context rather than a file.
    await saveCollectionFile(context, ext.invocationCollection.list(), uri instanceof vscode.Uri ? uri : undefined);
}
