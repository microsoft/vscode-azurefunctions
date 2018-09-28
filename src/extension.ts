/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { WorkspaceFoldersChangeEvent } from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, registerAppServiceExtensionVariables } from 'vscode-azureappservice';
import { AzureTreeDataProvider, AzureUserInput, callWithTelemetryAndErrorHandling, IActionContext, IAzureNode, IAzureParentNode, IAzureUserInput, registerCommand, registerEvent, registerUIExtensionVariables } from 'vscode-azureextensionui';
import TelemetryReporter from 'vscode-extension-telemetry';
import { decryptLocalSettings } from './commands/appSettings/decryptLocalSettings';
import { downloadAppSettings } from './commands/appSettings/downloadAppSettings';
import { encryptLocalSettings } from './commands/appSettings/encryptLocalSettings';
import { uploadAppSettings } from './commands/appSettings/uploadAppSettings';
import { configureDeploymentSource } from './commands/configureDeploymentSource';
import { copyFunctionUrl } from './commands/copyFunctionUrl';
import { createChildNode } from './commands/createChildNode';
import { createFunction } from './commands/createFunction/createFunction';
import { createFunctionApp } from './commands/createFunctionApp';
import { createNewProject } from './commands/createNewProject/createNewProject';
import { initProjectForVSCode } from './commands/createNewProject/initProjectForVSCode';
import { validateFunctionProjects } from './commands/createNewProject/validateFunctionProjects';
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
import { ext } from './extensionVariables';
import { registerFuncHostTaskEvents } from './funcCoreTools/funcHostTask';
import { installOrUpdateFuncCoreTools } from './funcCoreTools/installOrUpdateFuncCoreTools';
import { uninstallFuncCoreTools } from './funcCoreTools/uninstallFuncCoreTools';
import { validateFuncCoreToolsIsLatest } from './funcCoreTools/validateFuncCoreToolsIsLatest';
import { FunctionTemplates, getFunctionTemplates } from './templates/FunctionTemplates';
import { FunctionAppProvider } from './tree/FunctionAppProvider';
import { FunctionAppTreeItem } from './tree/FunctionAppTreeItem';
import { FunctionTreeItem } from './tree/FunctionTreeItem';
import { ProxyTreeItem } from './tree/ProxyTreeItem';

export function activate(context: vscode.ExtensionContext): void {
    registerUIExtensionVariables(ext);
    registerAppServiceExtensionVariables(ext);
    ext.context = context;

    let reporter: TelemetryReporter | undefined;
    try {
        const packageInfo: IPackageInfo = (<(id: string) => IPackageInfo>require)(context.asAbsolutePath('./package.json'));
        reporter = new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
        ext.reporter = reporter;
    } catch (error) {
        // swallow exceptions so that telemetry doesn't affect user
    }

    const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions');
    ext.outputChannel = outputChannel;
    context.subscriptions.push(outputChannel);

    callWithTelemetryAndErrorHandling('azureFunctions.activate', async function (this: IActionContext): Promise<void> {
        this.properties.isActivationEvent = 'true';
        const ui: IAzureUserInput = new AzureUserInput(context.globalState);
        ext.ui = ui;

        // tslint:disable-next-line:no-floating-promises
        validateFuncCoreToolsIsLatest();

        const tree: AzureTreeDataProvider = new AzureTreeDataProvider(new FunctionAppProvider(), 'azureFunctions.loadMore');
        ext.tree = tree;
        context.subscriptions.push(tree);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('azureFunctionsExplorer', tree));

        const validateEventId: string = 'azureFunctions.validateFunctionProjects';
        // tslint:disable-next-line:no-floating-promises
        callWithTelemetryAndErrorHandling(validateEventId, async function (this: IActionContext): Promise<void> {
            await validateFunctionProjects(this, ui, outputChannel, vscode.workspace.workspaceFolders);
        });
        registerEvent(validateEventId, vscode.workspace.onDidChangeWorkspaceFolders, async function (this: IActionContext, event: WorkspaceFoldersChangeEvent): Promise<void> {
            await validateFunctionProjects(this, ui, outputChannel, event.added);
        });

        const templatesTask: Promise<void> = getFunctionTemplates().then((templates: FunctionTemplates) => {
            ext.functionTemplates = templates;
        });

        registerCommand('azureFunctions.selectSubscriptions', () => vscode.commands.executeCommand('azure-account.selectSubscriptions'));
        registerCommand('azureFunctions.refresh', async (node?: IAzureNode) => await tree.refresh(node));
        registerCommand('azureFunctions.pickProcess', async function (this: IActionContext): Promise<string | undefined> { return await pickFuncProcess(this); });
        registerCommand('azureFunctions.loadMore', async (node: IAzureNode) => await tree.loadMore(node));
        registerCommand('azureFunctions.openInPortal', async (node?: IAzureNode<FunctionAppTreeItem>) => await openInPortal(tree, node));
        registerCommand('azureFunctions.createFunction', async function (this: IActionContext, functionAppPath?: string, templateId?: string, functionName?: string, functionSettings?: {}): Promise<void> {
            await templatesTask;
            await createFunction(this, functionAppPath, templateId, functionName, functionSettings);
        });
        registerCommand('azureFunctions.createNewProject', async function (this: IActionContext, functionAppPath?: string, language?: string, runtime?: string, openFolder?: boolean | undefined, templateId?: string, functionName?: string, functionSettings?: {}): Promise<void> {
            await templatesTask;
            await createNewProject(this, functionAppPath, language, runtime, openFolder, templateId, functionName, functionSettings);
        });
        registerCommand('azureFunctions.initProjectForVSCode', async function (this: IActionContext): Promise<void> { await initProjectForVSCode(this, ui, outputChannel); });
        registerCommand('azureFunctions.createFunctionApp', async function (this: IActionContext, subscription?: IAzureParentNode | string, resourceGroup?: string): Promise<string> { return await createFunctionApp(this, tree, subscription, resourceGroup); });
        registerCommand('azureFunctions.startFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await startFunctionApp(tree, node));
        registerCommand('azureFunctions.stopFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await stopFunctionApp(tree, node));
        registerCommand('azureFunctions.restartFunctionApp', async (node?: IAzureNode<FunctionAppTreeItem>) => await restartFunctionApp(tree, node));
        registerCommand('azureFunctions.deleteFunctionApp', async (node?: IAzureParentNode) => await deleteNode(tree, FunctionAppTreeItem.contextValue, node));
        registerCommand('azureFunctions.deploy', async function (this: IActionContext, deployPath: vscode.Uri | string, functionAppId?: string): Promise<void> { await deploy(ui, this, tree, outputChannel, deployPath, functionAppId); });
        registerCommand('azureFunctions.configureDeploymentSource', async function (this: IActionContext, node?: IAzureNode<FunctionAppTreeItem>): Promise<void> { await configureDeploymentSource(this.properties, tree, node); });
        registerCommand('azureFunctions.copyFunctionUrl', async (node?: IAzureNode<FunctionTreeItem>) => await copyFunctionUrl(tree, node));
        registerCommand('azureFunctions.startStreamingLogs', async (node?: IAzureNode<ILogStreamTreeItem>) => await startStreamingLogs(node));
        registerCommand('azureFunctions.stopStreamingLogs', async (node?: IAzureNode<ILogStreamTreeItem>) => await stopStreamingLogs(tree, node));
        registerCommand('azureFunctions.deleteFunction', async (node?: IAzureNode) => await deleteNode(tree, FunctionTreeItem.contextValue, node));
        registerCommand('azureFunctions.appSettings.add', async (node?: IAzureParentNode) => await createChildNode(tree, AppSettingsTreeItem.contextValue, node));
        registerCommand('azureFunctions.appSettings.download', async (node?: IAzureNode<AppSettingsTreeItem>) => await downloadAppSettings(node));
        registerCommand('azureFunctions.appSettings.upload', async (node?: IAzureNode<AppSettingsTreeItem>) => await uploadAppSettings(node));
        registerCommand('azureFunctions.appSettings.edit', async (node?: IAzureNode<AppSettingTreeItem>) => await editAppSetting(tree, node));
        registerCommand('azureFunctions.appSettings.rename', async (node?: IAzureNode<AppSettingTreeItem>) => await renameAppSetting(tree, node));
        registerCommand('azureFunctions.appSettings.decrypt', async (uri?: vscode.Uri) => await decryptLocalSettings(uri));
        registerCommand('azureFunctions.appSettings.encrypt', async (uri?: vscode.Uri) => await encryptLocalSettings(uri));
        registerCommand('azureFunctions.appSettings.delete', async (node?: IAzureNode<AppSettingTreeItem>) => await deleteNode(tree, AppSettingTreeItem.contextValue, node));
        registerCommand('azureFunctions.debugFunctionAppOnAzure', async (node?: IAzureNode<FunctionAppTreeItem>) => await remoteDebugFunctionApp(outputChannel, ui, tree, node));
        registerCommand('azureFunctions.deleteProxy', async (node?: IAzureNode) => await deleteNode(tree, ProxyTreeItem.contextValue, node));
        registerCommand('azureFunctions.installOrUpdateFuncCoreTools', async () => await installOrUpdateFuncCoreTools());
        registerCommand('azureFunctions.uninstallFuncCoreTools', async () => await uninstallFuncCoreTools());

        registerFuncHostTaskEvents();
    });
}

// tslint:disable-next-line:no-empty
export function deactivate(): void {
}

interface IPackageInfo {
    name: string;
    version: string;
    aiKey: string;
}
