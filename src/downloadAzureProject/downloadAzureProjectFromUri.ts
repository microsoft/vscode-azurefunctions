/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { GlobalStates } from '../extension';
import { ext } from '../extensionVariables';
import { setupProjectFolder } from './setupProjectFolder';

// NOTE: Example call for opening vscode with query parameters -
// vscode://ms-azuretools.vscode-azurefunctions/?resourceId=<appResourceId>&defaultHostName=<appHostName>&devcontainer=<devContainerName>&language=<appLanguage>&downloadAppContent=<true/false>
export async function downloadAzureProjectFromUri(uri: vscode.Uri): Promise<void> {
    await callWithTelemetryAndErrorHandling('azureFunctions.downloadAzureProjectFromUri', async (_context: IActionContext) => {
        ext.context.globalState.update(GlobalStates.initProjectWithoutConfigVerification, true);
        const isLoggedIn: boolean = await ext.azureAccountTreeItem.getIsLoggedIn();
        if (!isLoggedIn) {
            await vscode.commands.executeCommand('azure-account.login');
        }

        const filePathUri: vscode.Uri[] = await ext.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
        await setupProjectFolder(uri, filePathUri[0]);
    });
}
