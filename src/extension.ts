/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { AzureAccount } from './azure-account.api';
import { AzureFunctionsExplorer } from './AzureFunctionsExplorer';
import { createFunction } from './commands/createFunction';
import { createFunctionApp } from './commands/createFunctionApp';
import { deployZip } from './commands/deployZip';
import { openInPortal } from './commands/openInPortal';
import { restartFunctionApp } from './commands/restartFunctionApp';
import { startFunctionApp } from './commands/startFunctionApp';
import { stopFunctionApp } from './commands/stopFunctionApp';
import { ErrorData } from './ErrorData';
import * as errors from './errors';
import { FunctionAppNode } from './nodes/FunctionAppNode';
import { NodeBase } from './nodes/NodeBase';
import { localize } from './util';

let reporter: TelemetryReporter | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const azureAccountExtension: vscode.Extension<AzureAccount> | undefined = vscode.extensions.getExtension<AzureAccount>('ms-vscode.azure-account');
    if (!azureAccountExtension) {
        vscode.window.showErrorMessage(localize('azFunc.noAccountExtensionError', 'The Azure Account Extension is required for the Azure Functions extension.'));
    } else {
        try {
            const packageInfo: IPackageInfo = (<(id: string) => IPackageInfo>require)(context.asAbsolutePath('./package.json'));
            reporter = new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
        } catch (error) {
            // swallow exceptions so that telemetry doesn't affect user
        }

        const azureAccount: AzureAccount = azureAccountExtension.exports;

        const explorer: AzureFunctionsExplorer = new AzureFunctionsExplorer(azureAccount);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('azureFunctionsExplorer', explorer));

        const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions');
        context.subscriptions.push(outputChannel);

        context.subscriptions.push(azureAccount.onFiltersChanged(() => explorer.refresh()));
        context.subscriptions.push(azureAccount.onStatusChanged(() => explorer.refresh()));

        initCommand(context, 'azureFunctions.refresh', (node?: NodeBase) => explorer.refresh(node));
        initCommand(context, 'azureFunctions.openInPortal', openInPortal);
        initAsyncCommand(context, 'azureFunctions.createFunction', async () => await createFunction(outputChannel));
        initAsyncCommand(context, 'azureFunctions.createFunctionApp', async () => await createFunctionApp(outputChannel));
        initAsyncCommand(context, 'azureFunctions.startFunctionApp', async (node?: FunctionAppNode) => await startFunctionApp(explorer, node));
        initAsyncCommand(context, 'azureFunctions.stopFunctionApp', async (node?: FunctionAppNode) => await stopFunctionApp(explorer, node));
        initAsyncCommand(context, 'azureFunctions.restartFunctionApp', async (node?: FunctionAppNode) => await restartFunctionApp(explorer, node));
        initAsyncCommand(context, 'azureFunctions.deployZip', async (node?: FunctionAppNode) => await deployZip(explorer, outputChannel, node));
    }
}

// tslint:disable-next-line:no-empty
export function deactivate(): void {
}

function initCommand(context: vscode.ExtensionContext, commandId: string, callback: (node?: NodeBase) => void): void {
    initAsyncCommand(context, commandId, async (node?: NodeBase) => callback(node));
}

function initAsyncCommand(context: vscode.ExtensionContext, commandId: string, callback: (node?: NodeBase) => Promise<void>): void {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, async (...args: {}[]) => {
        const start: number = Date.now();
        let result: string = 'Succeeded';
        let errorData: ErrorData | undefined;

        try {
            if (args.length === 0) {
                await callback();
            } else {
                await callback(<NodeBase>args[0]);
            }
        } catch (error) {
            if (error instanceof errors.UserCancelledError) {
                result = 'Canceled';
            } else {
                result = 'Failed';
                errorData = new ErrorData(error);
                vscode.window.showErrorMessage(errorData.message);
            }
        } finally {
            const end: number = Date.now();
            const properties: { [key: string]: string; } = { result: result };
            if (errorData) {
                properties.error = errorData.errorType;
                properties.errorMessage = errorData.message;
            }

            if (reporter) {
                reporter.sendTelemetryEvent(commandId, properties, { duration: (end - start) / 1000 });
            }
        }
    }));
}

interface IPackageInfo {
    name: string;
    version: string;
    aiKey: string;
}
