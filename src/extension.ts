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
import { createNewProject } from './commands/createNewProject';
import { deployZip } from './commands/deployZip';
import { openInPortal } from './commands/openInPortal';
import { restartFunctionApp } from './commands/restartFunctionApp';
import { startFunctionApp } from './commands/startFunctionApp';
import { stopFunctionApp } from './commands/stopFunctionApp';
import { ErrorData } from './ErrorData';
import * as errors from './errors';
import { localize } from './localize';
import { FunctionAppNode } from './nodes/FunctionAppNode';
import { NodeBase } from './nodes/NodeBase';
import { SubscriptionNode } from "./nodes/SubscriptionNode";
import { TemplateData } from './templates/TemplateData';

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

        const templateData: TemplateData = new TemplateData(context.globalState);

        initCommand<NodeBase>(context, outputChannel, 'azureFunctions.refresh', (node?: NodeBase) => explorer.refresh(node));
        initCommand<NodeBase>(context, outputChannel, 'azureFunctions.openInPortal', async (node?: NodeBase) => await openInPortal(explorer, node));
        initAsyncCommand<NodeBase>(context, outputChannel, 'azureFunctions.createFunction', async () => await createFunction(outputChannel, azureAccount, templateData));
        initAsyncCommand<NodeBase>(context, outputChannel, 'azureFunctions.createNewProject', async () => await createNewProject(outputChannel));
        initAsyncCommand<SubscriptionNode>(context, outputChannel, 'azureFunctions.createFunctionApp', async (node?: SubscriptionNode) => await createFunctionApp(context, outputChannel, explorer, node));
        initAsyncCommand<NodeBase>(context, outputChannel, 'azureFunctions.startFunctionApp', async (node?: FunctionAppNode) => await startFunctionApp(explorer, node));
        initAsyncCommand<NodeBase>(context, outputChannel, 'azureFunctions.stopFunctionApp', async (node?: FunctionAppNode) => await stopFunctionApp(explorer, node));
        initAsyncCommand<NodeBase>(context, outputChannel, 'azureFunctions.restartFunctionApp', async (node?: FunctionAppNode) => await restartFunctionApp(explorer, node));
        initAsyncCommand<FunctionAppNode | vscode.Uri>(context, outputChannel, 'azureFunctions.deployZip', async (arg?: FunctionAppNode | vscode.Uri) => await deployZip(explorer, outputChannel, arg));
    }
}

// tslint:disable-next-line:no-empty
export function deactivate(): void {
}

function initCommand<T>(extensionContext: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, commandId: string, callback: (context?: T) => void): void {
    initAsyncCommand(extensionContext, outputChannel, commandId, async (context?: T) => callback(context));
}

function initAsyncCommand<T>(extensionContext: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, commandId: string, callback: (context?: T) => Promise<void>): void {
    extensionContext.subscriptions.push(vscode.commands.registerCommand(commandId, async (...args: {}[]) => {
        const start: number = Date.now();
        let result: string = 'Succeeded';
        let errorData: ErrorData | undefined;

        try {
            if (args.length === 0) {
                await callback();
            } else {
                await callback(<T>args[0]);
            }
        } catch (error) {
            if (error instanceof errors.UserCancelledError) {
                result = 'Canceled';
            } else {
                result = 'Failed';
                errorData = new ErrorData(error);
                // Always append the error to the output channel, but only 'show' the output channel for multiline errors
                outputChannel.appendLine(localize('azFunc.Error', 'Error: {0}', errorData.message));
                if (errorData.message.includes('\n')) {
                    outputChannel.show();
                    vscode.window.showErrorMessage(localize('azFunc.multilineError', 'An error has occured in the Azure Functions extension. Check output window for more details.'));
                } else {
                    vscode.window.showErrorMessage(errorData.message);
                }
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
