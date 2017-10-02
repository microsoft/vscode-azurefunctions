/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { AzureAccount } from './azure-account.api';
import { AzureFunctionsExplorer } from './AzureFunctionsExplorer';
import * as commands from './commands';
import * as errors from './errors';
import { FunctionAppNode, INode } from './nodes';
import { Reporter } from './telemetry';
import * as util from './util';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(new Reporter(context));

    const azureAccountExtension: vscode.Extension<AzureAccount> | undefined = vscode.extensions.getExtension<AzureAccount>('ms-vscode.azure-account');
    if (!azureAccountExtension || !azureAccountExtension.exports) {
        vscode.window.showErrorMessage('The Azure Account Extension is required for the Azure Functions extension.');
    } else {
        const azureAccount: AzureAccount = azureAccountExtension.exports;

        context.subscriptions.push(azureAccount.onFiltersChanged(() => explorer.refresh()));
        context.subscriptions.push(azureAccount.onStatusChanged(() => explorer.refresh()));

        const explorer: AzureFunctionsExplorer = new AzureFunctionsExplorer(azureAccount);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('azureFunctionsExplorer', explorer));

        const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions');
        context.subscriptions.push(outputChannel);

        initCommand(context, 'azureFunctions.refresh', (node?: INode) => explorer.refresh(node));
        initCommand(context, 'azureFunctions.openInPortal', (node?: INode) => commands.openInPortal(node));
        initAsyncCommand(context, 'azureFunctions.createFunction', () => commands.createFunction(outputChannel));
        initAsyncCommand(context, 'azureFunctions.createFunctionApp', () => commands.createFunctionApp(outputChannel));
        initAsyncCommand(context, 'azureFunctions.startFunctionApp', (node?: FunctionAppNode) => commands.startFunctionApp(outputChannel, node));
        initAsyncCommand(context, 'azureFunctions.stopFunctionApp', (node?: FunctionAppNode) => commands.stopFunctionApp(outputChannel, node));
        initAsyncCommand(context, 'azureFunctions.restartFunctionApp', (node?: FunctionAppNode) => commands.restartFunctionApp(outputChannel, node));
    }
}

// tslint:disable-next-line:no-empty
export function deactivate(): void {
}

function initCommand(context: vscode.ExtensionContext, commandId: string, callback: (node?: INode) => void): void {
    initAsyncCommand(context, commandId, (node?: INode) => Promise.resolve(callback(node)));
}

function initAsyncCommand(context: vscode.ExtensionContext, commandId: string, callback: (node?: INode) => Promise<void>): void {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, async (...args: {}[]) => {
        const start: number = Date.now();
        let result: string = 'Succeeded';
        let errorData: string | undefined;

        try {
            args.length === 0 ? await callback() : await callback(<INode>args[0]);
        } catch (error) {
            if (error instanceof errors.UserCancelledError) {
                result = 'Canceled';
                // Swallow the error so that it's not displayed to the user
            } else {
                result = 'Failed';
                errorData = util.errorToString(error);
                throw error;
            }
        } finally {
            const end: number = Date.now();
            const properties: { [key: string]: string; } = { result: result };
            if (errorData) {
                properties.error = errorData;
            }
            util.sendTelemetry(commandId, properties, { duration: (end - start) / 1000 });
        }
    }));
}
