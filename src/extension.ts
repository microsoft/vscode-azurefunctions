/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem } from 'vscode-azureappservice';
import { AzureActionHandler, AzureTreeDataProvider, IAzureNode, IAzureParentNode, TelemetryMeasurements, TelemetryProperties } from 'vscode-azureextensionui';
import TelemetryReporter from 'vscode-extension-telemetry';
import { AzureAccount } from './azure-account.api';
import { configureDeploymentSource } from './commands/configureDeploymentSource';
import { copyFunctionUrl } from './commands/copyFunctionUrl';
import { createChildNode } from './commands/createChildNode';
import { createFunction } from './commands/createFunction/createFunction';
import { createFunctionApp } from './commands/createFunctionApp';
import { createNewProject } from './commands/createNewProject/createNewProject';
import { deleteNode } from './commands/deleteNode';
import { deploy } from './commands/deploy';
import { editAppSetting } from './commands/editAppSetting';
import { ILogStreamTreeItem } from './commands/logstream/ILogStreamTreeItem';
import { startStreamingLogs } from './commands/logstream/startStreamingLogs';
import { stopStreamingLogs } from './commands/logstream/stopStreamingLogs';
import { openInPortal } from './commands/openInPortal';
import { pickFuncProcess } from './commands/pickFuncProcess';
import { remoteDebugFunctionApp } from './commands/remoteDebugFunctionApp';
import { renameAppSetting } from './commands/renameAppSetting';
import { restartFunctionApp } from './commands/restartFunctionApp';
import { startFunctionApp } from './commands/startFunctionApp';
import { stopFunctionApp } from './commands/stopFunctionApp';
import { localize } from './localize';
import { TemplateData } from './templates/TemplateData';
import { FunctionAppProvider } from './tree/FunctionAppProvider';
import { FunctionAppTreeItem } from './tree/FunctionAppTreeItem';
import { FunctionTreeItem } from './tree/FunctionTreeItem';
import { dotnetUtils } from './utils/dotnetUtils';
import { functionRuntimeUtils } from './utils/functionRuntimeUtils';
import { VSCodeUI } from './VSCodeUI';

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

        // tslint:disable-next-line:no-floating-promises
        functionRuntimeUtils.validateFunctionRuntime(outputChannel);

        const tree: AzureTreeDataProvider = new AzureTreeDataProvider(new FunctionAppProvider(context.globalState, outputChannel), 'azureFunctions.loadMore');
        context.subscriptions.push(tree);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('azureFunctionsExplorer', tree));

        const templateData: TemplateData = new TemplateData(context.globalState);

        const actionHandler: AzureActionHandler = new AzureActionHandler(context, outputChannel, reporter);
        actionHandler.registerCommand('azureFunctions.refresh', async (node?: IAzureNode) => await tree.refresh(node));
        actionHandler.registerCommand('azureFunctions.pickProcess', async () => await pickFuncProcess());
        actionHandler.registerCommand('azureFunctions.loadMore', async (node: IAzureNode) => await tree.loadMore(node));
        actionHandler.registerCommand('azureFunctions.openInPortal', async (node?: IAzureNode<FunctionAppTreeItem>) => await openInPortal(tree, node));
        actionHandler.registerCommandWithCustomTelemetry('azureFunctions.createFunction', async (properties: TelemetryProperties, _measurements: TelemetryMeasurements, functionAppPath?: string, templateId?: string, functionName?: string, ...functionSettings: string[]) => {
            await createFunction(properties, outputChannel, azureAccount, templateData, new VSCodeUI(), functionAppPath, templateId, functionName, ...functionSettings);
        });
        actionHandler.registerCommandWithCustomTelemetry('azureFunctions.createNewProject', async (properties: TelemetryProperties, _measurements: TelemetryMeasurements, functionAppPath?: string, language?: string, openFolder?: boolean | undefined) => await createNewProject(properties, outputChannel, functionAppPath, language, openFolder));
        actionHandler.registerCommand('azureFunctions.createFunctionApp', async (arg?: IAzureParentNode | string) => await createFunctionApp(tree, arg));
        actionHandler.registerCommand('azureFunctions.startFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await startFunctionApp(tree, node));
        actionHandler.registerCommand('azureFunctions.stopFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await stopFunctionApp(tree, node));
        actionHandler.registerCommand('azureFunctions.restartFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await restartFunctionApp(tree, node));
        actionHandler.registerCommand('azureFunctions.deleteFunctionApp', async (node?: IAzureParentNode) => await deleteNode(tree, FunctionAppTreeItem.contextValue, node));
        actionHandler.registerCommandWithCustomTelemetry('azureFunctions.deploy', async (properties: TelemetryProperties, _measurements: TelemetryMeasurements, deployPath: vscode.Uri | string, functionAppId?: string) => await deploy(properties, tree, outputChannel, deployPath, functionAppId));
        actionHandler.registerCommandWithCustomTelemetry('azureFunctions.configureDeploymentSource', async (properties: TelemetryProperties, _measurements: TelemetryMeasurements, node?: IAzureNode<FunctionAppTreeItem>) => await configureDeploymentSource(properties, tree, outputChannel, node));
        actionHandler.registerCommand('azureFunctions.copyFunctionUrl', async (node?: IAzureNode<FunctionTreeItem>) => await copyFunctionUrl(tree, node));
        actionHandler.registerCommand('azureFunctions.startStreamingLogs', async (node?: IAzureNode<ILogStreamTreeItem>) => await startStreamingLogs(context, actionHandler, tree, node));
        actionHandler.registerCommand('azureFunctions.stopStreamingLogs', async (node?: IAzureNode<ILogStreamTreeItem>) => await stopStreamingLogs(tree, node));
        actionHandler.registerCommand('azureFunctions.deleteFunction', async (node?: IAzureNode) => await deleteNode(tree, FunctionTreeItem.contextValue, node));
        actionHandler.registerCommand('azureFunctions.appSettings.add', async (node: IAzureParentNode) => await createChildNode(tree, AppSettingsTreeItem.contextValue, node));
        actionHandler.registerCommand('azureFunctions.appSettings.edit', async (node: IAzureNode<AppSettingTreeItem>) => await editAppSetting(tree, node));
        actionHandler.registerCommand('azureFunctions.appSettings.rename', async (node: IAzureNode<AppSettingTreeItem>) => await renameAppSetting(tree, node));
        actionHandler.registerCommand('azureFunctions.appSettings.delete', async (node: IAzureNode<AppSettingTreeItem>) => await deleteNode(tree, AppSettingTreeItem.contextValue, node));
        actionHandler.registerCommand('azureFunctions.installDotnetTemplates', async () => await dotnetUtils.installDotnetTemplates(outputChannel));
        actionHandler.registerCommand('azureFunctions.uninstallDotnetTemplates', async () => await dotnetUtils.uninstallDotnetTemplates(outputChannel));
        actionHandler.registerCommand('azureFunctions.debugFunctionAppOnAzure', async (node?: IAzureNode<FunctionAppTreeItem>) => await remoteDebugFunctionApp(outputChannel, tree, node));
    }
}

// tslint:disable-next-line:no-empty
export function deactivate(): void {
}

interface IPackageInfo {
    name: string;
    version: string;
    aiKey: string;
}
