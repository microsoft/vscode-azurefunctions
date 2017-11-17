/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { AzureTreeDataProvider, IAzureNode, IAzureParentNode, UserCancelledError } from 'vscode-azureextensionui';
import TelemetryReporter from 'vscode-extension-telemetry';
import { AzureAccount } from './azure-account.api';
import { createFunction } from './commands/createFunction';
import { createFunctionApp } from './commands/createFunctionApp';
import { createNewProject } from './commands/createNewProject';
import { deleteFunctionApp } from './commands/deleteFunctionApp';
import { deploy } from './commands/deploy';
import { openInPortal } from './commands/openInPortal';
import { restartFunctionApp } from './commands/restartFunctionApp';
import { startFunctionApp } from './commands/startFunctionApp';
import { stopFunctionApp } from './commands/stopFunctionApp';
import { ErrorData } from './ErrorData';
import { localize } from './localize';
import { TemplateData } from './templates/TemplateData';
import { FunctionAppProvider } from './tree/FunctionAppProvider';
import { FunctionAppTreeItem } from './tree/FunctionAppTreeItem';

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

        const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions');
        context.subscriptions.push(outputChannel);

        const tree: AzureTreeDataProvider = new AzureTreeDataProvider(new FunctionAppProvider(context.globalState, outputChannel), 'azureFunctions.loadMore');
        context.subscriptions.push(tree);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('azureFunctionsExplorer', tree));

        const templateData: TemplateData = new TemplateData(context.globalState);

        initCommand<IAzureNode>(context, outputChannel, 'azureFunctions.refresh', (node?: IAzureNode) => tree.refresh(node));
        initAsyncCommand<IAzureNode>(context, outputChannel, 'azureFunctions.loadMore', async (node: IAzureNode) => await tree.loadMore(node));
        initCommand<IAzureNode<FunctionAppTreeItem>>(context, outputChannel, 'azureFunctions.openInPortal', async (node?: IAzureNode<FunctionAppTreeItem>) => await openInPortal(tree, node));
        initAsyncCommand<IAzureNode>(context, outputChannel, 'azureFunctions.createFunction', async () => await createFunction(outputChannel, azureAccount, templateData));
        initAsyncCommand<IAzureNode>(context, outputChannel, 'azureFunctions.createNewProject', async () => await createNewProject(outputChannel));
        initAsyncCommand<IAzureParentNode>(context, outputChannel, 'azureFunctions.createFunctionApp', async (node?: IAzureParentNode) => await createFunctionApp(tree, node));
        initAsyncCommand<IAzureNode<FunctionAppTreeItem>>(context, outputChannel, 'azureFunctions.startFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await startFunctionApp(tree, node));
        initAsyncCommand<IAzureNode<FunctionAppTreeItem>>(context, outputChannel, 'azureFunctions.stopFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await stopFunctionApp(tree, node));
        initAsyncCommand<IAzureNode<FunctionAppTreeItem>>(context, outputChannel, 'azureFunctions.restartFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await restartFunctionApp(tree, node));
        initAsyncCommand<IAzureParentNode>(context, outputChannel, 'azureFunctions.deleteFunctionApp', async (node?: IAzureParentNode) => await deleteFunctionApp(tree, node));
        initAsyncCommand<IAzureNode<FunctionAppTreeItem> | vscode.Uri>(context, outputChannel, 'azureFunctions.deploy', async (arg?: IAzureNode<FunctionAppTreeItem> | vscode.Uri) => await deploy(tree, outputChannel, arg));
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
            if (error instanceof UserCancelledError) {
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
