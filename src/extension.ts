/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem } from 'vscode-azureappservice';
import { AzureTreeDataProvider, IAzureNode, IAzureParentNode, UserCancelledError } from 'vscode-azureextensionui';
import TelemetryReporter from 'vscode-extension-telemetry';
import { AzureAccount } from './azure-account.api';
import { createChildNode } from './commands/createChildNode';
import { createFunction } from './commands/createFunction';
import { createNewProject } from './commands/createNewProject';
import { deleteNode } from './commands/deleteNode';
import { deploy } from './commands/deploy';
import { editAppSetting } from './commands/editAppSetting';
import { openInPortal } from './commands/openInPortal';
import { renameAppSetting } from './commands/renameAppSetting';
import { restartFunctionApp } from './commands/restartFunctionApp';
import { startFunctionApp } from './commands/startFunctionApp';
import { stopFunctionApp } from './commands/stopFunctionApp';
import { ErrorData } from './ErrorData';
import { localize } from './localize';
import { TemplateData } from './templates/TemplateData';
import { FunctionAppProvider } from './tree/FunctionAppProvider';
import { FunctionAppTreeItem } from './tree/FunctionAppTreeItem';
import { FunctionTreeItem } from './tree/FunctionTreeItem';

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
        initAsyncCommandWithCustomTelemetry(context, outputChannel, 'azureFunctions.createFunction', async (telemetryProperties: { [key: string]: string; }) => await createFunction(telemetryProperties, outputChannel, azureAccount, templateData));
        initAsyncCommandWithCustomTelemetry(context, outputChannel, 'azureFunctions.createNewProject', async (telemetryProperties: { [key: string]: string; }) => await createNewProject(telemetryProperties, outputChannel));
        initAsyncCommand<IAzureParentNode>(context, outputChannel, 'azureFunctions.createFunctionApp', async (node?: IAzureParentNode) => await createChildNode(tree, AzureTreeDataProvider.subscriptionContextValue, node));
        initAsyncCommand<IAzureNode<FunctionAppTreeItem>>(context, outputChannel, 'azureFunctions.startFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await startFunctionApp(tree, node));
        initAsyncCommand<IAzureNode<FunctionAppTreeItem>>(context, outputChannel, 'azureFunctions.stopFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await stopFunctionApp(tree, node));
        initAsyncCommand<IAzureNode<FunctionAppTreeItem>>(context, outputChannel, 'azureFunctions.restartFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await restartFunctionApp(tree, node));
        initAsyncCommand<IAzureParentNode>(context, outputChannel, 'azureFunctions.deleteFunctionApp', async (node?: IAzureParentNode) => await deleteNode(tree, FunctionAppTreeItem.contextValue, node));
        initAsyncCommand<IAzureNode<FunctionAppTreeItem> | vscode.Uri>(context, outputChannel, 'azureFunctions.deploy', async (arg?: IAzureNode<FunctionAppTreeItem> | vscode.Uri) => await deploy(tree, outputChannel, arg));
        initAsyncCommand<IAzureNode>(context, outputChannel, 'azureFunctions.deleteFunction', async (node?: IAzureNode) => await deleteNode(tree, FunctionTreeItem.contextValue, node));
        initAsyncCommand<IAzureParentNode>(context, outputChannel, 'azureFunctions.appSettings.add', async (node: IAzureParentNode) => await createChildNode(tree, AppSettingsTreeItem.contextValue, node));
        initAsyncCommand<IAzureNode<AppSettingTreeItem>>(context, outputChannel, 'azureFunctions.appSettings.edit', async (node: IAzureNode<AppSettingTreeItem>) => await editAppSetting(tree, node));
        initAsyncCommand<IAzureNode<AppSettingTreeItem>>(context, outputChannel, 'azureFunctions.appSettings.rename', async (node: IAzureNode<AppSettingTreeItem>) => await renameAppSetting(tree, node));
        initAsyncCommand<IAzureNode<AppSettingTreeItem>>(context, outputChannel, 'azureFunctions.appSettings.delete', async (node: IAzureNode<AppSettingTreeItem>) => await deleteNode(tree, AppSettingTreeItem.contextValue, node));
    }
}

// tslint:disable-next-line:no-empty
export function deactivate(): void {
}

function initCommand<T>(extensionContext: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, commandId: string, callback: (context?: T) => void): void {
    initAsyncCommand(extensionContext, outputChannel, commandId, async (context?: T) => callback(context));
}

function initAsyncCommand<T>(extensionContext: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, commandId: string, callback: (context?: T) => Promise<void>): void {
    initAsyncCommandWithCustomTelemetry(extensionContext, outputChannel, commandId, async (_telemetryProperties: { [key: string]: string; }, context?: T) => callback(context));
}

function initAsyncCommandWithCustomTelemetry<T>(extensionContext: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, commandId: string, callback: (telemetryProperties: { [key: string]: string; }, context?: T) => Promise<void>): void {
    extensionContext.subscriptions.push(vscode.commands.registerCommand(commandId, async (...args: {}[]) => {
        const start: number = Date.now();
        let errorData: ErrorData | undefined;
        const properties: { [key: string]: string; } = {};
        properties.result = 'Succeeded';

        try {
            if (args.length === 0) {
                await callback(properties);
            } else {
                await callback(properties, <T>args[0]);
            }
        } catch (error) {
            if (error instanceof UserCancelledError) {
                properties.result = 'Canceled';
            } else {
                properties.result = 'Failed';
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
