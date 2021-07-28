/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window } from 'vscode';
import { SiteClient } from 'vscode-azureappservice';
import { IActionContext, parseError } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { FunctionTreeItemBase } from '../tree/FunctionTreeItemBase';
import { RemoteFunctionTreeItem } from '../tree/remoteProject/RemoteFunctionTreeItem';
import { nonNullValue } from '../utils/nonNull';
import { requestUtils } from '../utils/requestUtils';

export async function executeFunction(context: IActionContext, node?: FunctionTreeItemBase): Promise<void> {
    if (!node) {
        const noItemFoundErrorMessage: string = localize('noFunctions', 'No functions found.');
        node = await ext.tree.showTreeItemPicker<FunctionTreeItemBase>(/Function;/i, { ...context, noItemFoundErrorMessage });
    }

    const client: SiteClient | undefined = node instanceof RemoteFunctionTreeItem ? node.parent.parent.root.client : undefined;
    const triggerBindingType: string | undefined = node.triggerBindingType;
    context.telemetry.properties.triggerBindingType = triggerBindingType;

    let functionInput: string | {} = '';
    if (!node.isTimerTrigger) {
        const prompt: string = localize('enterRequestBody', 'Enter request body');
        let value: string | undefined;
        if (triggerBindingType) {
            const version: FuncVersion = await node.parent.parent.getVersion();
            const templateProvider = ext.templateProvider.get(context);
            value = await templateProvider.tryGetSampleData(context, version, triggerBindingType);
            if (value) {
                // Clean up the whitespace to make it more friendly for a one-line input box
                value = value.replace(/[\r\n\t]/g, ' ');
                value = value.replace(/ +/g, ' ');
            }
        }

        const data: string = await context.ui.showInputBox({ prompt, value, stepName: 'requestBody' });

        try {
            functionInput = <{}>JSON.parse(data);
        } catch {
            functionInput = data;
        }
    }

    // access the function's master key on the portal
    let url: string;
    let body: {};
    if (node.isHttpTrigger) {
        url = nonNullValue(await node.triggerUrlTask, 'triggerUrl');
        body = functionInput;
    } else {
        const hostUrl = await node.parent.parent.getHostUrl(context);
        // https://docs.microsoft.com/azure/azure-functions/functions-manually-run-non-http
        url = `${hostUrl}/admin/functions/${node.name}`;
        body = { input: functionInput };
    }

    // loads in the function in the extension
    let responseText: string | null | undefined;
    await node.runWithTemporaryDescription(context, localize('executing', 'Executing...'), async () => {
        const headers: { [name: string]: string | undefined } = {};
        if (client) {
            headers['x-functions-key'] = (await client.listHostKeys()).masterKey;
        }
        try {
            responseText = (await requestUtils.sendRequestWithExtTimeout({ method: 'POST', url, headers, body })).bodyAsText;
        } catch (error) {
            if (!client && parseError(error).errorType === 'ECONNREFUSED') {
                context.errorHandling.suppressReportIssue = true;
                throw new Error(localize('failedToConnect', 'Failed to connect. Make sure your project is [running locally](https://aka.ms/AA76v2d).'));
            } else {
                context.telemetry.maskEntireErrorMessage = true; // since the response is directly related to the code the user authored themselves
                throw error;
            }
        }
    });

    // shows if the function was able to run
    const message: string = responseText ? localize('executedWithResponse', 'Executed function "{0}". Response: "{1}"', node.name, responseText) : localize('executed', 'Executed function "{0}"', node.name);
    void window.showInformationMessage(message);
}
