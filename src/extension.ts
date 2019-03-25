/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, registerAppServiceExtensionVariables } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeDataProvider, AzureTreeItem, AzureUserInput, callWithTelemetryAndErrorHandling, createApiProvider, createTelemetryReporter, IActionContext, registerCommand, registerEvent, registerUIExtensionVariables } from 'vscode-azureextensionui';
// tslint:disable-next-line:no-submodule-imports
import { AzureExtensionApiProvider } from 'vscode-azureextensionui/api';
import { decryptLocalSettings } from './commands/appSettings/decryptLocalSettings';
import { downloadAppSettings } from './commands/appSettings/downloadAppSettings';
import { encryptLocalSettings } from './commands/appSettings/encryptLocalSettings';
import { toggleSlotSetting } from './commands/appSettings/toggleSlotSetting';
import { uploadAppSettings } from './commands/appSettings/uploadAppSettings';
import { configureDeploymentSource } from './commands/configureDeploymentSource';
import { copyFunctionUrl } from './commands/copyFunctionUrl';
import { createChildNode } from './commands/createChildNode';
import { createFunction } from './commands/createFunction/createFunction';
import { runPostFunctionCreateStepsFromCache } from './commands/createFunction/FunctionCreateStepBase';
import { createFunctionApp } from './commands/createFunctionApp';
import { createNewProject } from './commands/createNewProject/createNewProject';
import { deleteNode } from './commands/deleteNode';
import { deploy } from './commands/deploy';
import { connectToGitHub } from './commands/deployments/connectToGitHub';
import { disconnectRepo } from './commands/deployments/disconnectRepo';
import { redeployDeployment } from './commands/deployments/redeployDeployment';
import { viewCommitInGitHub } from './commands/deployments/viewCommitInGitHub';
import { viewDeploymentLogs } from './commands/deployments/viewDeploymentLogs';
import { editAppSetting } from './commands/editAppSetting';
import { initProjectForVSCode } from './commands/initProjectForVSCode/initProjectForVSCode';
import { verifyVSCodeConfigOnActivate } from './commands/initProjectForVSCode/verifyVSCodeConfig';
import { startStreamingLogs } from './commands/logstream/startStreamingLogs';
import { stopStreamingLogs } from './commands/logstream/stopStreamingLogs';
import { openInPortal } from './commands/openInPortal';
import { pickFuncProcess } from './commands/pickFuncProcess';
import { remoteDebugFunctionApp } from './commands/remoteDebugFunctionApp';
import { renameAppSetting } from './commands/renameAppSetting';
import { restartFunctionApp } from './commands/restartFunctionApp';
import { startFunctionApp } from './commands/startFunctionApp';
import { stopFunctionApp } from './commands/stopFunctionApp';
import { swapSlot } from './commands/swapSlot';
import { func, ProjectLanguage } from './constants';
import { FuncTaskProvider } from './debug/FuncTaskProvider';
import { JavaDebugProvider } from './debug/JavaDebugProvider';
import { NodeDebugProvider } from './debug/NodeDebugProvider';
import { PowerShellDebugProvider } from './debug/PowerShellDebugProvider';
import { PythonDebugProvider } from './debug/PythonDebugProvider';
import { ext } from './extensionVariables';
import { registerFuncHostTaskEvents } from './funcCoreTools/funcHostTask';
import { installOrUpdateFuncCoreTools } from './funcCoreTools/installOrUpdateFuncCoreTools';
import { uninstallFuncCoreTools } from './funcCoreTools/uninstallFuncCoreTools';
import { validateFuncCoreToolsIsLatest } from './funcCoreTools/validateFuncCoreToolsIsLatest';
import { getTemplateProvider } from './templates/TemplateProvider';
import { FunctionAppProvider } from './tree/FunctionAppProvider';
import { FunctionTreeItem } from './tree/FunctionTreeItem';
import { ProductionSlotTreeItem } from './tree/ProductionSlotTreeItem';
import { ProxyTreeItem } from './tree/ProxyTreeItem';
import { SlotsTreeItem } from './tree/SlotsTreeItem';

export async function activateInternal(context: vscode.ExtensionContext, perfStats: { loadStartTime: number; loadEndTime: number }): Promise<AzureExtensionApiProvider> {
    ext.context = context;
    ext.reporter = createTelemetryReporter(context);
    ext.outputChannel = vscode.window.createOutputChannel('Azure Functions');
    context.subscriptions.push(ext.outputChannel);
    ext.ui = new AzureUserInput(context.globalState);

    registerUIExtensionVariables(ext);
    registerAppServiceExtensionVariables(ext);

    await callWithTelemetryAndErrorHandling('azureFunctions.activate', async function (this: IActionContext): Promise<void> {
        this.properties.isActivationEvent = 'true';
        this.measurements.mainFileLoad = (perfStats.loadEndTime - perfStats.loadStartTime) / 1000;

        runPostFunctionCreateStepsFromCache();

        // tslint:disable-next-line:no-floating-promises
        validateFuncCoreToolsIsLatest();

        ext.tree = new AzureTreeDataProvider(FunctionAppProvider, 'azureFunctions.loadMore');
        context.subscriptions.push(ext.tree);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('azureFunctionsExplorer', ext.tree));

        const validateEventId: string = 'azureFunctions.validateFunctionProjects';
        // tslint:disable-next-line:no-floating-promises
        callWithTelemetryAndErrorHandling(validateEventId, async function (this: IActionContext): Promise<void> {
            await verifyVSCodeConfigOnActivate(this, vscode.workspace.workspaceFolders);
        });
        registerEvent(validateEventId, vscode.workspace.onDidChangeWorkspaceFolders, async function (this: IActionContext, event: vscode.WorkspaceFoldersChangeEvent): Promise<void> {
            await verifyVSCodeConfigOnActivate(this, event.added);
        });

        ext.templateProviderTask = getTemplateProvider();

        registerCommand('azureFunctions.selectSubscriptions', () => vscode.commands.executeCommand('azure-account.selectSubscriptions'));
        registerCommand('azureFunctions.refresh', async (node?: AzureTreeItem) => await ext.tree.refresh(node));
        registerCommand('azureFunctions.pickProcess', pickFuncProcess);
        registerCommand('azureFunctions.loadMore', async (node: AzureTreeItem) => await ext.tree.loadMore(node));
        registerCommand('azureFunctions.openInPortal', openInPortal);
        registerCommand('azureFunctions.createFunction', async function (this: IActionContext, functionAppPath?: string, templateId?: string, functionName?: string, functionSettings?: {}): Promise<void> {
            await createFunction(this, functionAppPath, templateId, functionName, functionSettings);
        });
        registerCommand('azureFunctions.createNewProject', async function (this: IActionContext, functionAppPath?: string, language?: ProjectLanguage, runtime?: string, openFolder?: boolean | undefined, templateId?: string, functionName?: string, functionSettings?: {}): Promise<void> {
            await createNewProject(this, functionAppPath, language, runtime, openFolder, templateId, functionName, functionSettings);
        });
        registerCommand('azureFunctions.initProjectForVSCode', async function (this: IActionContext): Promise<void> { await initProjectForVSCode(this); });
        registerCommand('azureFunctions.createFunctionApp', createFunctionApp);
        registerCommand('azureFunctions.startFunctionApp', startFunctionApp);
        registerCommand('azureFunctions.stopFunctionApp', stopFunctionApp);
        registerCommand('azureFunctions.restartFunctionApp', restartFunctionApp);
        registerCommand('azureFunctions.deleteFunctionApp', async (node?: AzureParentTreeItem) => await deleteNode(ProductionSlotTreeItem.contextValue, node));
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
        registerCommand('azureFunctions.appSettings.toggleSlotSetting', toggleSlotSetting);
        registerCommand('azureFunctions.debugFunctionAppOnAzure', remoteDebugFunctionApp);
        registerCommand('azureFunctions.deleteProxy', async (node?: AzureTreeItem) => await deleteNode(ProxyTreeItem.contextValue, node));
        registerCommand('azureFunctions.installOrUpdateFuncCoreTools', installOrUpdateFuncCoreTools);
        registerCommand('azureFunctions.uninstallFuncCoreTools', uninstallFuncCoreTools);
        registerCommand('azureFunctions.redeploy', redeployDeployment);
        registerCommand('azureFunctions.viewDeploymentLogs', viewDeploymentLogs);
        registerCommand('azureFunctions.viewCommitInGitHub', viewCommitInGitHub);
        registerCommand('azureFunctions.connectToGitHub', connectToGitHub);
        registerCommand('azureFunctions.disconnectRepo', disconnectRepo);
        registerCommand('azureFunctions.swapSlot', swapSlot);
        registerCommand('azureFunctions.createSlot', async (node?: AzureParentTreeItem) => await createChildNode(SlotsTreeItem.contextValue, node));
        registerCommand('azureFunctions.toggleAppSettingVisibility', async (node: AppSettingTreeItem) => { await node.toggleValueVisibility(); }, 250);
        registerFuncHostTaskEvents();

        const nodeDebugProvider: NodeDebugProvider = new NodeDebugProvider();
        const pythonDebugProvider: PythonDebugProvider = new PythonDebugProvider();
        const javaDebugProvider: JavaDebugProvider = new JavaDebugProvider();
        const powershellDebugProvider: PowerShellDebugProvider = new PowerShellDebugProvider();

        // These don't actually overwrite "node", "python", etc. - they just add to it
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('node', nodeDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('python', pythonDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java', javaDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('PowerShell', powershellDebugProvider));
        context.subscriptions.push(vscode.workspace.registerTaskProvider(func, new FuncTaskProvider(nodeDebugProvider, pythonDebugProvider, javaDebugProvider, powershellDebugProvider)));
    });

    return createApiProvider([]);
}

// tslint:disable-next-line:no-empty
export function deactivateInternal(): void {
}
