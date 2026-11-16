/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { type AzureInvokeTreeDataProvider } from '../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { type HttpRequestEditors } from '../../webviews/azureInvoke/extension/HttpRequestEditors';
import { openCollectionFile } from './collectionFiles';

export function openCollectionCommandFactory(provider: AzureInvokeTreeDataProvider, editors: HttpRequestEditors) {
    return async (context: IActionContext, source?: unknown): Promise<void> => {
        context.telemetry.maskEntireErrorMessage = true;

        const invocations = await openCollectionFile(context, source instanceof vscode.Uri ? source : undefined);
        if (provider.getInvocations().length || editors.size) {
            await context.ui.showWarningMessage(
                localize('azureInvoke.replaceCollection', 'Opening a collection replaces the current session collection and closes its request tabs. Unsaved edits and invocations not exported to a collection file will be lost.'),
                { modal: true, stepName: 'confirmOpenInvocationCollection' },
                { title: localize('azureInvoke.openCollectionConfirm', 'Open Collection') },
            );
        }

        editors.closeAll();
        provider.replaceRequests(invocations);
    };
}
