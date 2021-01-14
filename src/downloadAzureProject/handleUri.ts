/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as querystring from 'querystring';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { setupProjectFolder } from './setupProjectFolder';

export enum HandleUriActions {
    downloadContentAndSetupProject = 'downloadContentAndSetupProject',
    setupProject = 'setupProject',
}

// NOTE: Example call for opening vscode with query parameters -
// vscode://ms-azuretools.vscode-azurefunctions/?resourceId=<appResourceId>&defaultHostName=<appHostName>&devcontainer=<devContainerName>&language=<appLanguage>&action=<'downloadContentAndSetupProject' OR 'setupProject'>
export async function handleUri(uri: vscode.Uri): Promise<void> {
    await callWithTelemetryAndErrorHandling('azureFunctions.handleUri', async (context: IActionContext) => {
        const isLoggedIn: boolean = await ext.azureAccountTreeItem.getIsLoggedIn();
        if (!isLoggedIn) {
            await vscode.commands.executeCommand('azure-account.login');
        }

        const parsedQuery: querystring.ParsedUrlQuery = querystring.parse(uri.query);
        const action: string = getRequiredQueryParameter(parsedQuery, 'action');

        if (action === HandleUriActions.downloadContentAndSetupProject || action === HandleUriActions.setupProject) {
            const filePathUri: vscode.Uri[] = await ext.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
            await setupProjectFolder(uri, filePathUri[0], context);
        }
    });
}

export function getRequiredQueryParameter(parsedQuery: querystring.ParsedUrlQuery, key: string): string {
    const value: string | string[] | undefined = parsedQuery[key];
    if (value && typeof value === 'string') {
        return value;
    } else {
        vscode.window.showErrorMessage(localize('invalidInputsErrorMessage', 'Invalid inputs. Please try again.'));
        throw new Error(localize('missingQueryParam', 'Missing query parameter "{0}".', key));
    }
}
