/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpMethods } from 'ms-rest';
import { window } from 'vscode';
import { SiteClient } from 'vscode-azureappservice';
import { IActionContext, parseError } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { FunctionTreeItemBase } from '../tree/FunctionTreeItemBase';
import { RemoteFunctionTreeItem } from '../tree/remoteProject/RemoteFunctionTreeItem';
import { nonNullProp } from '../utils/nonNull';
import { requestUtils } from '../utils/requestUtils';

export async function executeFunction(context: IActionContext, node?: FunctionTreeItemBase): Promise<void> {
    if (!node) {
        const noItemFoundErrorMessage: string = localize('noFunctions', 'No functions found.');
        node = await ext.tree.showTreeItemPicker<FunctionTreeItemBase>(/Function;/i, { ...context, noItemFoundErrorMessage });
    }

    const client: SiteClient | undefined = node instanceof RemoteFunctionTreeItem ? node.parent.parent.root.client : undefined;
    const triggerBindingType: string | undefined = node.config.triggerBinding?.type;
    context.telemetry.properties.triggerBindingType = triggerBindingType;

    let functionInput: string | {} = '';
    if (!node.config.isTimerTrigger) {
        const prompt: string = localize('enterRequestBody', 'Enter request body');
        let value: string | undefined;
        if (triggerBindingType) {
            const version: FuncVersion = await node.parent.parent.getVersion();
            value = await ext.templateProvider.tryGetSampleData(context, version, triggerBindingType);
            if (value) {
                // Clean up the whitespace to make it more friendly for a one-line input box
                value = value.replace(/[\r\n\t]/g, ' ');
                value = value.replace(/ +/g, ' ');
            }
        }

        const data: string = await ext.ui.showInputBox({ prompt, value });
        try {
            functionInput = <{}>JSON.parse(data);
        } catch {
            functionInput = data;
        }
    }

    let url: string;
    let method: HttpMethods;
    let body: {};
    if (node.config.isHttpTrigger) {
        url = nonNullProp(node, 'triggerUrl');
        method = 'GET';
        body = functionInput;
    } else {
        // https://docs.microsoft.com/azure/azure-functions/functions-manually-run-non-http
        url = `${node.parent.parent.hostUrl}/admin/functions/${node.name}`;
        method = 'POST';
        body = { input: functionInput };
    }

    let response: string | undefined;
    await node.runWithTemporaryDescription(localize('executing', 'Executing...'), async () => {
        const request: requestUtils.Request = await requestUtils.getDefaultRequestWithTimeout(url, undefined, method);
        if (client) {
            request.headers['x-functions-key'] = (await client.listHostKeys()).masterKey;
        }
        request.headers['Content-Type'] = 'application/json';
        request.body = body;
        request.json = true;
        try {
            response = await requestUtils.sendRequest(request);
        } catch (error) {
            if (!client && parseError(error).errorType === 'ECONNREFUSED') {
                context.errorHandling.suppressReportIssue = true;
                throw new Error(localize('failedToConnect', 'Failed to connect. Make sure your project is [running locally](https://aka.ms/AA76v2d).'));
            } else {
                throw error;
            }
        }
    });

    const message: string = response ? localize('executedWithResponse', 'Executed function "{0}". Response: "{1}"', node.name, response) : localize('executed', 'Executed function "{0}"', node.name);
    window.showInformationMessage(message);
}
