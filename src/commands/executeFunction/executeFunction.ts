/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHttpHeaders } from '@azure/core-rest-pipeline';
import { type SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import fetch from 'cross-fetch';
import { window } from 'vscode';
import { type FuncVersion } from '../../FuncVersion';
import { functionFilter } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { FunctionTreeItemBase } from '../../tree/FunctionTreeItemBase';
import { type FuncHostRequest } from '../../tree/IProjectTreeItem';
import { RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';
import { nonNullValue } from '../../utils/nonNull';
import { requestUtils } from '../../utils/requestUtils';
import { type IFunction } from '../../workspace/LocalFunction';
import { executeEventGridFunction } from './eventGrid/executeEventGridFunction';

export async function executeFunction(context: IActionContext, node?: FunctionTreeItemBase | IFunction): Promise<void> {
    context.telemetry.eventVersion = 2;
    if (!node) {
        const noItemFoundErrorMessage: string = localize('noFunctions', 'No functions found.');
        node = await ext.rgApi.pickAppResource<FunctionTreeItemBase>(
            { ...context, noItemFoundErrorMessage },
            {
                filter: functionFilter,
                expectedChildContextValue: /Function;/i,
            },
        );
    }

    try {
        ext.isExecutingFunction = true;
        ext.currentExecutingFunctionNode = node;

        const func = node instanceof FunctionTreeItemBase ? node.function : node;

        const triggerBindingType: string | undefined = node.triggerBindingType;
        context.telemetry.properties.triggerBindingType = triggerBindingType;

        let functionInput: string | {} = '';
        if (triggerBindingType === 'eventGridTrigger') {
            return await executeEventGridFunction(context, node);
        } else if (!func.isTimerTrigger) {
            const prompt: string = localize('enterRequestBody', 'Enter request body');
            let value: string | undefined;
            if (triggerBindingType) {
                const version: FuncVersion = await node.project.getVersion(context);
                const templateProvider = ext.templateProvider.get(context);
                value = await templateProvider.tryGetSampleData(context, version, triggerBindingType);
                if (value) {
                    // Clean up the whitespace to make it more friendly for a one-line input box
                    value = value.replace(/[\r\n\t]/g, ' ');
                    value = value.replace(/ +/g, ' ');
                }
            }

            const data: string = await context.ui.showInputBox({
                prompt,
                value,
                stepName: 'requestBody',
            });
            try {
                functionInput = <{}>JSON.parse(data);
            } catch {
                functionInput = data;
            }
        }

        await executeFunctionWithInput(context, functionInput, node);

    } finally {
        ext.isExecutingFunction = false;
        ext.currentExecutingFunctionNode = undefined;
    }
}

export async function executeFunctionWithInput(context: IActionContext, functionInput: string | {}, node: FunctionTreeItemBase | IFunction) {
    const func = node instanceof FunctionTreeItemBase ? node.function : node;

    let triggerRequest: FuncHostRequest;
    let body: {};
    if (func.isHttpTrigger) {
        triggerRequest = nonNullValue(await func.getTriggerRequest(context), 'triggerRequest');
        body = functionInput;
    } else {
        triggerRequest = await func.project.getHostRequest(context);
        // https://docs.microsoft.com/azure/azure-functions/functions-manually-run-non-http
        triggerRequest.url = `${triggerRequest.url}/admin/functions/${func.name}`;
        body = { input: functionInput };
    }

    let responseText: string | null | undefined;
    const execute = async () => {
        const headers = createHttpHeaders({
            'Content-Type': 'application/json',
        });
        let client: SiteClient | undefined;
        if (node instanceof RemoteFunctionTreeItem) {
            await node.parent.parent.initSite(context);
            client = await node.parent.parent.site.createClient(context);
        }

        if (client) {
            headers.set('x-functions-key', (await client.listHostKeys()).masterKey ?? '');
        }
        try {
            responseText = (
                await requestUtils.sendRequestWithExtTimeout(context, {
                    method: 'POST',
                    ...triggerRequest,
                    headers,
                    body: JSON.stringify(body),
                })
            ).bodyAsText;
        } catch (error) {
            const errorType = parseError(error).errorType;
            if (!client && errorType === 'ECONNREFUSED') {
                context.errorHandling.suppressReportIssue = true;
                throw new Error(localize('failedToConnect', 'Failed to connect. Make sure your project is [running locally](https://aka.ms/AA76v2d).'));
            } else if (errorType === '400') {
                const response = await fetch(triggerRequest.url, {
                    method: 'POST',
                    body: JSON.stringify({
                        // stringify JSON object to match the format in the portal
                        input: JSON.stringify(functionInput),
                    }),
                    headers: headers.toJSON(),
                });
                responseText = await response.text();
            } else {
                context.telemetry.maskEntireErrorMessage = true; // since the response is directly related to the code the user authored themselves
                throw error;
            }
        }
    };

    if (node instanceof FunctionTreeItemBase) {
        await node.runWithTemporaryDescription(context, localize('executing', 'Executing...'), async () => {
            await execute();
        });
    } else {
        await execute();
    }

    const message: string = responseText ? localize('executedWithResponse', 'Executed function "{0}". Response: "{1}"', func.name, responseText) : localize('executed', 'Executed function "{0}"', func.name);
    void window.showInformationMessage(message);

    ext.isExecutingFunction = false;
    ext.currentExecutingFunctionNode = undefined;
}
