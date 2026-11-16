/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { type AzureInvokeTreeDataProvider } from '../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { saveCollectionFile } from './collectionFiles';

export function saveCollectionCommandFactory(provider: AzureInvokeTreeDataProvider) {
    return async (context: IActionContext, target?: unknown): Promise<void> => {
        context.telemetry.maskEntireErrorMessage = true;
        await saveCollectionFile(context, provider.getInvocations(), target instanceof vscode.Uri ? target : undefined);
    };
}
