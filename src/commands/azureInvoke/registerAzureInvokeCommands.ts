/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerCommand, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { type AzureInvokeTreeDataProvider } from '../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { openCollectionFile, saveCollectionFile } from './collectionFiles';

export function registerAzureInvokeCommands(provider: AzureInvokeTreeDataProvider): void {
    registerCommand('azureFunctions.azureInvoke.saveCollection', async (context: IActionContext, target?: unknown) => {
        context.telemetry.maskEntireErrorMessage = true;
        await saveCollectionFile(context, provider.getInvocations(), target instanceof vscode.Uri ? target : undefined);
    });

    registerCommand('azureFunctions.azureInvoke.openCollection', async (context: IActionContext, source?: unknown) => {
        context.telemetry.maskEntireErrorMessage = true;
        const invocations = await openCollectionFile(context, source instanceof vscode.Uri ? source : undefined);
        if (provider.getInvocations().length) {
            await context.ui.showWarningMessage(
                localize('azureInvoke.replaceCollection', 'Opening a collection replaces the current session collection and closes its request tabs. Unsaved edits and invocations not exported to a collection file will be lost.'),
                { modal: true, stepName: 'confirmOpenInvocationCollection' },
                { title: localize('azureInvoke.openCollectionConfirm', 'Open Collection') },
            );
        }
        provider.replaceRequests(invocations);
    });
}
