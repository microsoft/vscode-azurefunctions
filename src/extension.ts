/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { WorkspaceFoldersChangeEvent } from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, registerAppServiceExtensionVariables } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeDataProvider, AzureTreeItem, AzureUserInput, callWithTelemetryAndErrorHandling, IActionContext, registerCommand, registerEvent, registerUIExtensionVariables } from 'vscode-azureextensionui';
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

    try {
        const packageInfo: IPackageInfo = (<(id: string) => IPackageInfo>require)(context.asAbsolutePath('./package.json'));
        ext.reporter = new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
    } catch (error) {
        // swallow exceptions so that telemetry doesn't affect user
    }

    ext.outputChannel = vscode.window.createOutputChannel('Azure Functions');
    context.subscriptions.push(ext.outputChannel);

    callWithTelemetryAndErrorHandling('azureFunctions.activate', async function (this: IActionContext): Promise<void> {
        this.properties.isActivationEvent = 'true';
        ext.ui = new AzureUserInput(context.globalState);

        // tslint:disable-next-line:no-floating-promises
        validateFuncCoreToolsIsLatest();

        ext.tree = new AzureTreeDataProvider(FunctionAppProvider, 'azureFunctions.loadMore');
        context.subscriptions.push(ext.tree);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('azureFunctionsExplorer', ext.tree));

        const validateEventId: string = 'azureFunctions.validateFunctionProjects';
        // tslint:disable-next-line:no-floating-promises
        callWithTelemetryAndErrorHandling(validateEventId, async function (this: IActionContext): Promise<void> {
            await validateFunctionProjects(this, vscode.workspace.workspaceFolders);
        });
        registerEvent(validateEventId, vscode.workspace.onDidChangeWorkspaceFolders, async function (this: IActionContext, event: WorkspaceFoldersChangeEvent): Promise<void> {
            await validateFunctionProjects(this, event.added);
        });

        const templatesTask: Promise<void> = getFunctionTemplates().then((templates: FunctionTemplates) => {
            ext.functionTemplates = templates;
        });

        registerCommand('azureFunctions.selectSubscriptions', () => vscode.commands.executeCommand('azure-account.selectSubscriptions'));
        registerCommand('azureFunctions.refresh', async (node?: AzureTreeItem) => await ext.tree.refresh(node));
        registerCommand('azureFunctions.pickProcess', pickFuncProcess);
        registerCommand('azureFunctions.loadMore', async (node: AzureTreeItem) => await ext.tree.loadMore(node));
        registerCommand('azureFunctions.openInPortal', openInPortal);
        registerCommand('azureFunctions.createFunction', async function (this: IActionContext, functionAppPath?: string, templateId?: string, functionName?: string, functionSettings?: {}): Promise<void> {
            await templatesTask;
            await createFunction(this, functionAppPath, templateId, functionName, functionSettings);
        });
        registerCommand('azureFunctions.createNewProject', async function (this: IActionContext, functionAppPath?: string, language?: string, runtime?: string, openFolder?: boolean | undefined, templateId?: string, functionName?: string, functionSettings?: {}): Promise<void> {
            await templatesTask;
            await createNewProject(this, functionAppPath, language, runtime, openFolder, templateId, functionName, functionSettings);
        });
        registerCommand('azureFunctions.initProjectForVSCode', async function (this: IActionContext): Promise<void> { await initProjectForVSCode(this); });
        registerCommand('azureFunctions.createFunctionApp', createFunctionApp);
        registerCommand('azureFunctions.startFunctionApp', startFunctionApp);
        registerCommand('azureFunctions.stopFunctionApp', stopFunctionApp);
        registerCommand('azureFunctions.restartFunctionApp', restartFunctionApp);
        registerCommand('azureFunctions.deleteFunctionApp', async (node?: AzureParentTreeItem) => await deleteNode(FunctionAppTreeItem.contextValue, node));
        registerCommand('azureFunctions.deploy', deploy);
        registerCommand('azureFunctions.configureDeploymentSource', configureDeploymentSource);
        registerCommand('azureFunctions.copyFunctionUrl', copyFunctionUrl);
        registerCommand('azureFunctions.startStreamingLogs', startStreamingLogs);
        registerCommand('azureFunctions.stopStreamingLogs', stopStreamingLogs);
        registerCommand('azureFunctions.deleteFunction', async (node?: AzureTreeItem) => await deleteNode(FunctionTreeItem.contextValue, node));
        registerCommand('azureFunctions.appSettings.add', async (node?: AzureParentTreeItem) => await createChildNode(AppSettingsTreeItem.contextValue, node));
        registerCommand('azureFunctions.appSettings.download', downloadAppSettings);
        registerCommand('azureFunctions.appSettings.upload', uploadAppSettings);
        registerCommand('azureFunctions.appSettings.edit', editAppSetting);
        registerCommand('azureFunctions.appSettings.rename', renameAppSetting);
        registerCommand('azureFunctions.appSettings.decrypt', decryptLocalSettings);
        registerCommand('azureFunctions.appSettings.encrypt', encryptLocalSettings);
        registerCommand('azureFunctions.appSettings.delete', async (node?: AppSettingTreeItem) => await deleteNode(AppSettingTreeItem.contextValue, node));
        registerCommand('azureFunctions.debugFunctionAppOnAzure', remoteDebugFunctionApp);
        registerCommand('azureFunctions.deleteProxy', async (node?: AzureTreeItem) => await deleteNode(ProxyTreeItem.contextValue, node));
        registerCommand('azureFunctions.installOrUpdateFuncCoreTools', installOrUpdateFuncCoreTools);
        registerCommand('azureFunctions.uninstallFuncCoreTools', uninstallFuncCoreTools);

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
