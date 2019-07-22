/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import request = require('request-promise');
import { window } from 'vscode';
import { SiteClient } from 'vscode-azureappservice';
import { appendExtensionUserAgent, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { FunctionTreeItemBase } from '../tree/FunctionTreeItemBase';
import { RemoteFunctionTreeItem } from '../tree/remoteProject/RemoteFunctionTreeItem';

export async function executeFunction(context: IActionContext, node?: FunctionTreeItemBase): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<FunctionTreeItemBase>(/Function;Timer;/i, context);
    }

    const name: string = node.name;
    const client: SiteClient | undefined = node instanceof RemoteFunctionTreeItem ? node.parent.parent.root.client : undefined;
    const hostUrl: string = node.parent.parent.hostUrl;
    await node.runWithTemporaryDescription(localize('executing', 'Executing...'), async () => {
        const adminKey: string | undefined = client && await client.getFunctionsAdminToken();
        // https://docs.microsoft.com/azure/azure-functions/functions-manually-run-non-http
        await <Thenable<string>>request({
            method: 'POST',
            url: `${hostUrl}/admin/functions/${name}`,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': appendExtensionUserAgent(),
                Authorization: adminKey ? `Bearer ${adminKey}` : undefined
            },
            body: JSON.stringify({ input: '' })
        }).promise();
    });

    window.showInformationMessage(localize('executed', 'Executed function "{0}"', name));
}
