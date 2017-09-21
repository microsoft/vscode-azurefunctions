/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as util from "./util";
import * as commands from './commands';

import { AzureAccount } from './azure-account.api';
import { AzureFunctionsExplorer } from './explorer';
import { INode } from './nodes'
import { Reporter } from './telemetry';
import { FunctionsCli } from './functions-cli'

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new Reporter(context));

    const azureAccount = vscode.extensions.getExtension<AzureAccount>('ms-vscode.azure-account')!.exports;
    if (azureAccount) {
        context.subscriptions.push(azureAccount.onFiltersChanged(() => explorer.refresh()));
        context.subscriptions.push(azureAccount.onStatusChanged(() => explorer.refresh()));

        const explorer = new AzureFunctionsExplorer(azureAccount);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('azureFunctionsExplorer', explorer));

        const terminal: vscode.Terminal = vscode.window.createTerminal('Azure Functions');
        context.subscriptions.push(terminal);
        const functionsCli = new FunctionsCli(terminal);

        initCommand(context, 'azureFunctions.refresh', (node?: INode) => explorer.refresh(node));
        initCommand(context, 'azureFunctions.openInPortal', (node?: INode) => commands.openInPortal(node));
        initCommand(context, 'azureFunctions.createFunction', (node?: INode) => commands.createFunction(functionsCli));
        initCommand(context, 'azureFunctions.initFunctionApp', (node?: INode) => commands.initFunctionApp(functionsCli));
    } else {
        vscode.window.showErrorMessage("The Azure Account Extension is required for the Azure Functions extension.");
    }
}

export function deactivate() {
}

function initCommand(context: vscode.ExtensionContext, commandId: string, callback: (...args: any[]) => any) {
    initAsyncCommand(context, commandId, (...args: any[]) => Promise.resolve(callback(...args)));
}

function initAsyncCommand(context: vscode.ExtensionContext, commandId: string, callback: (...args: any[]) => Promise<any>) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, async (...args: any[]) => {
        const start = Date.now();
        let result = 'Succeeded';
        let errorData: string | undefined;

        try {
            await callback(...args);
        } catch (error) {
            if (error instanceof util.UserCancelledError) {
                result = 'Canceled';
                // Swallow the error so that it's not displayed to the user
            } else {
                result = 'Failed';
                errorData = util.errorToString(error);
                throw error;
            }
        } finally {
            const end = Date.now();
            const properties: { [key: string]: string; } = { result: result };
            if (errorData) {
                properties.error = errorData;
            }
            util.sendTelemetry(commandId, properties, { duration: (end - start) / 1000 });
        }
    }));
}