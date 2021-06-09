/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as querystring from 'querystring';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { setupProjectFolder } from './setupProjectFolder';

// export a type of variable called enum
export enum HandleUriActions {
    downloadContentAndSetupProject = 'downloadContentAndSetupProject',
}

// NOTE: Example call for opening vscode with query parameters -
// vscode://ms-azuretools.vscode-azurefunctions/?resourceId=<appResourceId>&defaultHostName=<appHostName>&devcontainer=<devContainerName>&language=<appLanguage>&action=<'downloadContentAndSetupProject'>
export async function handleUri(uri: vscode.Uri): Promise<void> {
    await callWithTelemetryAndErrorHandling('azureFunctions.handleUri', async (context: IActionContext) => {
        const enableOpenFromPortal: boolean | undefined = getWorkspaceSetting<boolean>('enableOpenFromPortal');

        if (enableOpenFromPortal) {
            // check if Portal has the option enabled/true to open into VS Code
            const parsedQuery: querystring.ParsedUrlQuery = querystring.parse(uri.query); // parses URI
            const action: string = getRequiredQueryParameter(parsedQuery, 'action'); //check if its valid URI via function below

            if (action === HandleUriActions.downloadContentAndSetupProject) {
                // ensures user is logged in to the portal
                const isLoggedIn: boolean = await ext.azureAccountTreeItem.getIsLoggedIn(); //get condition from Azure Account settings if the user is currently logged in
                if (!isLoggedIn) {
                    await vscode.commands.executeCommand('azure-account.login'); //pop up to login
                }

                // open file dialog - maybe opening a MSI file from the portal?
                // download contents
                const filePathUri: vscode.Uri[] = await ext.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
                await setupProjectFolder(uri, filePathUri[0], context); // calls setupProjectFolder.ts
                const filePathUri: vscode.Uri[] = await context.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
                await setupProjectFolder(uri, filePathUri[0], context);
            } else {
                throw new RangeError(localize('invalidAction', 'Invalid action "{0}".', action));
            }
        } else {
            // cannot open from portal
            throw new Error(localize('featureNotSupported', 'Download content and setup project feature is not supported for this extension version.'));
        }
    });
}

export function getRequiredQueryParameter(parsedQuery: querystring.ParsedUrlQuery, key: string): string {
    const value: string | string[] | undefined = parsedQuery[key];
    if (value && typeof value === 'string') {
        return value;
    } else {
        throw new Error(localize('missingQueryParam', 'Missing query parameter "{0}".', key));
    }
}
