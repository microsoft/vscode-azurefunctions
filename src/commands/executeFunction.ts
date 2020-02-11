/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window } from 'vscode';
import { SiteClient } from 'vscode-azureappservice';
import { IActionContext, parseError } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { FunctionTreeItemBase } from '../tree/FunctionTreeItemBase';
import { RemoteFunctionTreeItem } from '../tree/remoteProject/RemoteFunctionTreeItem';
import { requestUtils } from '../utils/requestUtils';

export async function executeFunction(context: IActionContext, node?: FunctionTreeItemBase): Promise<void> {
    if (!node) {
        const noItemFoundErrorMessage: string = localize('noTimerFunctions', 'No timer functions found.');
        node = await ext.tree.showTreeItemPicker<FunctionTreeItemBase>(/Function;Timer;/i, { ...context, noItemFoundErrorMessage });
    }

    const name: string = node.name;
    const client: SiteClient | undefined = node instanceof RemoteFunctionTreeItem ? node.parent.parent.root.client : undefined;
    const hostUrl: string = node.parent.parent.hostUrl;
    await node.runWithTemporaryDescription(localize('executing', 'Executing...'), async () => {
        // https://docs.microsoft.com/azure/azure-functions/functions-manually-run-non-http
        const request: requestUtils.Request = await requestUtils.getDefaultRequest(`${hostUrl}/admin/functions/${name}`, undefined, 'POST');
        if (client) {
            request.headers['x-functions-key'] = (await client.listHostKeys()).masterKey;
        }
        request.headers['Content-Type'] = 'application/json';
        request.body = { input: '' };
        request.json = true;
        try {
            await requestUtils.sendRequest(request);
        } catch (error) {
            if (!client && parseError(error).errorType === 'ECONNREFUSED') {
                context.errorHandling.suppressReportIssue = true;
                throw new Error(localize('failedToConnect', 'Failed to connect. Make sure your project is [running locally](https://aka.ms/AA76v2d).'));
            } else {
                throw error;
            }
        }
    });

    window.showInformationMessage(localize('executed', 'Executed function "{0}"', name));
}
