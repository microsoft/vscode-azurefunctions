/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, registerAppServiceExtensionVariables } from 'vscode-azureappservice';
import { AzExtParentTreeItem, AzExtTreeDataProvider, AzExtTreeItem, AzureTreeItem, AzureUserInput, callWithTelemetryAndErrorHandling, createApiProvider, createTelemetryReporter, IActionContext, registerCommand, registerEvent, registerUIExtensionVariables } from 'vscode-azureextensionui';
// tslint:disable-next-line:no-submodule-imports
import { AzureExtensionApiProvider } from 'vscode-azureextensionui/api';
import { addBinding } from './commands/addBinding/addBinding';
import { decryptLocalSettings } from './commands/appSettings/decryptLocalSettings';
import { downloadAppSettings } from './commands/appSettings/downloadAppSettings';
import { encryptLocalSettings } from './commands/appSettings/encryptLocalSettings';
import { setAzureWebJobsStorage } from './commands/appSettings/setAzureWebJobsStorage';
import { toggleSlotSetting } from './commands/appSettings/toggleSlotSetting';
import { uploadAppSettings } from './commands/appSettings/uploadAppSettings';
import { configureDeploymentSource } from './commands/configureDeploymentSource';
import { copyFunctionUrl } from './commands/copyFunctionUrl';
import { createChildNode } from './commands/createChildNode';
import { createFunction } from './commands/createFunction/createFunction';
import { runPostFunctionCreateStepsFromCache } from './commands/createFunction/FunctionCreateStepBase';
import { createFunctionApp } from './commands/createFunctionApp';
import { createNewProject } from './commands/createNewProject/createNewProject';
import { createSlot } from './commands/createSlot';
import { deleteNode } from './commands/deleteNode';
import { deploy } from './commands/deploy/deploy';
import { connectToGitHub } from './commands/deployments/connectToGitHub';
import { disconnectRepo } from './commands/deployments/disconnectRepo';
import { redeployDeployment } from './commands/deployments/redeployDeployment';
import { viewCommitInGitHub } from './commands/deployments/viewCommitInGitHub';
import { viewDeploymentLogs } from './commands/deployments/viewDeploymentLogs';
import { editAppSetting } from './commands/editAppSetting';
import { executeFunction } from './commands/executeFunction';
import { initProjectForVSCode } from './commands/initProjectForVSCode/initProjectForVSCode';
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
import { func } from './constants';
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
import { AzureAccountTreeItemWithProjects } from './tree/AzureAccountTreeItemWithProjects';
import { ProductionSlotTreeItem } from './tree/ProductionSlotTreeItem';
import { ProxyTreeItem } from './tree/ProxyTreeItem';
import { verifyVSCodeConfigOnActivate } from './vsCodeConfig/verifyVSCodeConfigOnActivate';

export async function activateInternal(context: vscode.ExtensionContext, perfStats: { loadStartTime: number; loadEndTime: number }): Promise<AzureExtensionApiProvider> {
    ext.context = context;
    ext.reporter = createTelemetryReporter(context);
    ext.outputChannel = vscode.window.createOutputChannel('Azure Functions');
    context.subscriptions.push(ext.outputChannel);
    ext.ui = new AzureUserInput(context.globalState);

    registerUIExtensionVariables(ext);
    registerAppServiceExtensionVariables(ext);

    await callWithTelemetryAndErrorHandling('azureFunctions.activate', async (activateContext: IActionContext) => {
        activateContext.telemetry.properties.isActivationEvent = 'true';
        activateContext.telemetry.measurements.mainFileLoad = (perfStats.loadEndTime - perfStats.loadStartTime) / 1000;

        runPostFunctionCreateStepsFromCache();

        // tslint:disable-next-line:no-floating-promises
        validateFuncCoreToolsIsLatest();

        ext.azureAccountTreeItem = new AzureAccountTreeItemWithProjects();
        context.subscriptions.push(ext.azureAccountTreeItem);
        ext.tree = new AzExtTreeDataProvider(ext.azureAccountTreeItem, 'azureFunctions.loadMore');
        context.subscriptions.push(vscode.window.createTreeView('azFuncTree', { treeDataProvider: ext.tree, showCollapseAll: true }));

        const validateEventId: string = 'azureFunctions.validateFunctionProjects';
        // tslint:disable-next-line:no-floating-promises
        callWithTelemetryAndErrorHandling(validateEventId, async (actionContext: IActionContext) => {
            await verifyVSCodeConfigOnActivate(actionContext, vscode.workspace.workspaceFolders);
        });
        registerEvent(validateEventId, vscode.workspace.onDidChangeWorkspaceFolders, async (actionContext: IActionContext, event: vscode.WorkspaceFoldersChangeEvent) => {
            await verifyVSCodeConfigOnActivate(actionContext, event.added);
        });

        ext.templateProviderTask = getTemplateProvider();

        registerCommand('azureFunctions.selectSubscriptions', () => vscode.commands.executeCommand('azure-account.selectSubscriptions'));
        registerCommand('azureFunctions.refresh', async (_actionContext: IActionContext, node?: AzureTreeItem) => await ext.tree.refresh(node));
        registerCommand('azureFunctions.pickProcess', pickFuncProcess);
        registerCommand('azureFunctions.loadMore', async (actionContext: IActionContext, node: AzureTreeItem) => await ext.tree.loadMore(node, actionContext));
        registerCommand('azureFunctions.openInPortal', openInPortal);
        registerCommand('azureFunctions.createFunction', createFunction);
        registerCommand('azureFunctions.createNewProject', createNewProject);
        registerCommand('azureFunctions.initProjectForVSCode', initProjectForVSCode);
        registerCommand('azureFunctions.createFunctionApp', createFunctionApp);
        registerCommand('azureFunctions.startFunctionApp', startFunctionApp);
        registerCommand('azureFunctions.stopFunctionApp', stopFunctionApp);
        registerCommand('azureFunctions.restartFunctionApp', restartFunctionApp);
        registerCommand('azureFunctions.deleteFunctionApp', async (actionContext: IActionContext, node?: AzExtTreeItem) => await deleteNode(actionContext, ProductionSlotTreeItem.contextValue, node));
        registerCommand('azureFunctions.deploy', deploy);
        registerCommand('azureFunctions.configureDeploymentSource', configureDeploymentSource);
        registerCommand('azureFunctions.copyFunctionUrl', copyFunctionUrl);
        registerCommand('azureFunctions.executeFunction', executeFunction);
        registerCommand('azureFunctions.startStreamingLogs', startStreamingLogs);
        registerCommand('azureFunctions.stopStreamingLogs', stopStreamingLogs);
        registerCommand('azureFunctions.deleteFunction', async (actionContext: IActionContext, node?: AzExtTreeItem) => await deleteNode(actionContext, /^azFuncFunction(Http|Timer|)$/i, node));
        registerCommand('azureFunctions.appSettings.add', async (actionContext: IActionContext, node?: AzExtParentTreeItem) => await createChildNode(actionContext, AppSettingsTreeItem.contextValue, node));
        registerCommand('azureFunctions.appSettings.download', downloadAppSettings);
        registerCommand('azureFunctions.appSettings.upload', uploadAppSettings);
        registerCommand('azureFunctions.appSettings.edit', editAppSetting);
        registerCommand('azureFunctions.appSettings.rename', renameAppSetting);
        registerCommand('azureFunctions.appSettings.decrypt', decryptLocalSettings);
        registerCommand('azureFunctions.appSettings.encrypt', encryptLocalSettings);
        registerCommand('azureFunctions.appSettings.delete', async (actionContext: IActionContext, node?: AzExtTreeItem) => await deleteNode(actionContext, AppSettingTreeItem.contextValue, node));
        registerCommand('azureFunctions.appSettings.toggleSlotSetting', toggleSlotSetting);
        registerCommand('azureFunctions.debugFunctionAppOnAzure', remoteDebugFunctionApp);
        registerCommand('azureFunctions.deleteProxy', async (actionContext: IActionContext, node?: AzExtTreeItem) => await deleteNode(actionContext, ProxyTreeItem.contextValue, node));
        registerCommand('azureFunctions.installOrUpdateFuncCoreTools', installOrUpdateFuncCoreTools);
        registerCommand('azureFunctions.uninstallFuncCoreTools', uninstallFuncCoreTools);
        registerCommand('azureFunctions.redeploy', redeployDeployment);
        registerCommand('azureFunctions.viewDeploymentLogs', viewDeploymentLogs);
        registerCommand('azureFunctions.viewCommitInGitHub', viewCommitInGitHub);
        registerCommand('azureFunctions.connectToGitHub', connectToGitHub);
        registerCommand('azureFunctions.disconnectRepo', disconnectRepo);
        registerCommand('azureFunctions.swapSlot', swapSlot);
        registerCommand('azureFunctions.addBinding', addBinding);
        registerCommand('azureFunctions.setAzureWebJobsStorage', setAzureWebJobsStorage);
        registerCommand('azureFunctions.createSlot', createSlot);
        registerCommand('azureFunctions.toggleAppSettingVisibility', async (_actionContext: IActionContext, node: AppSettingTreeItem) => { await node.toggleValueVisibility(); }, 250);
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
