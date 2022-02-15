/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, IActionContext } from '@microsoft/vscode-azext-utils';
import * as querystring from 'querystring';
import * as vscode from 'vscode';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { setupProjectFolder } from './setupProjectFolder';

export enum HandleUriActions {
    downloadContentAndSetupProject = 'downloadContentAndSetupProject',
}

// NOTE: Example call for opening vscode with query parameters -
// vscode://ms-azuretools.vscode-azurefunctions/?resourceId=<appResourceId>&defaultHostName=<appHostName>&devcontainer=<devContainerName>&language=<appLanguage>&action=<'downloadContentAndSetupProject'>
export async function handleUri(uri: vscode.Uri): Promise<void> {
    await callWithTelemetryAndErrorHandling('azureFunctions.handleUri', async (context: IActionContext) => {
        const enableOpenFromPortal: boolean | undefined = getWorkspaceSetting<boolean>('enableOpenFromPortal');

        if (enableOpenFromPortal) {
            const parsedQuery: querystring.ParsedUrlQuery = querystring.parse(uri.query);
            const action: string = getRequiredQueryParameter(parsedQuery, 'action');

            if (action === HandleUriActions.downloadContentAndSetupProject) {
                const isLoggedIn: boolean = await ext.azureAccountTreeItem.getIsLoggedIn();
                if (!isLoggedIn) {
                    await vscode.commands.executeCommand('azure-account.login');
                }

                const filePathUri: vscode.Uri[] = await context.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
                await setupProjectFolder(uri, filePathUri[0], context);
            } else {
                throw new RangeError(localize('invalidAction', 'Invalid action "{0}".', action));
            }
        } else {
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
