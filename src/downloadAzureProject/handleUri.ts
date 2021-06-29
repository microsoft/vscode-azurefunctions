/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//Valen: Import Statements
import * as querystring from 'querystring';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { setupProjectFolder } from './setupProjectFolder';

//Valen: Exporting an enum
export enum HandleUriActions {
    downloadContentAndSetupProject = 'downloadContentAndSetupProject',
}

/*
Valen: Understanding check- In order to import modules, they must say export when they
are made and to import them in another file, you write import and are able to use that code
*/

// NOTE: Example call for opening vscode with query parameters -

// Valen: URI are from Rest API, vscode.Uri is a type of object
export async function handleUri(uri: vscode.Uri): Promise<void> { // Valen: async func that returns promise and uses await
    // Valen: unsure about line 43
    await callWithTelemetryAndErrorHandling('azureFunctions.handleUri', async (context: IActionContext) => {
        const enableOpenFromPortal: boolean | undefined = getWorkspaceSetting<boolean>('enableOpenFromPortal');
        // Valen: ^ sets the variable

        if (enableOpenFromPortal) { // check if boolean in package.json is true
            const parsedQuery: querystring.ParsedUrlQuery = querystring.parse(uri.query);
            const action: string = getRequiredQueryParameter(parsedQuery, 'action');
            if (action === HandleUriActions.downloadContentAndSetupProject) {
                // Valen: if the action is downloadContentAndSetupProject,
                // check if they are logged in and if not, prompt login
                const isLoggedIn: boolean = await ext.azureAccountTreeItem.getIsLoggedIn();
                if (!isLoggedIn) {
                    await vscode.commands.executeCommand('azure-account.login');
                }
                // Valen: then here is code that completes the action downloadContentAndSetupProject
                // set file pah uri (an array)
                const filePathUri: vscode.Uri[] = await ext.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
                await setupProjectFolder(uri, filePathUri[0], context); //this function imported from setupProjectFolder.ts

                // Valen: action other than downloadContentAndSetupProject is invalid
            } else {
                throw new RangeError(localize('invalidAction', 'Invalid action "{0}".', action));
            }
            // Valen: if enableOpenFromPortal is false or undefined, throw an exception
        } else {
            throw new Error(localize('featureNotSupported', 'Download content and setup project feature is not supported for this extension version.'));
        }
    });
}

// Valen: we export here so we can import in setupProjectFolder.ts
// two parameters
export function getRequiredQueryParameter(parsedQuery: querystring.ParsedUrlQuery, key: string): string {
    // define value from parsedQuery which is a parameter
    const value: string | string[] | undefined = parsedQuery[key];
    // only return value if it is a string
    if (value && typeof value === 'string') {
        return value;
    } else {
        throw new Error(localize('missingQueryParam', 'Missing query parameter "{0}".', key));
    }
}
