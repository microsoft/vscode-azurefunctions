/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands } from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, registerSiteCommand } from 'vscode-azureappservice';
import { AzExtParentTreeItem, AzExtTreeItem, AzureTreeItem, IActionContext, registerCommand } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { installOrUpdateFuncCoreTools } from '../funcCoreTools/installOrUpdateFuncCoreTools';
import { uninstallFuncCoreTools } from '../funcCoreTools/uninstallFuncCoreTools';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { ProxyTreeItem } from '../tree/ProxyTreeItem';
import { SlotTreeItem } from '../tree/SlotTreeItem';
import { addBinding } from './addBinding/addBinding';
import { decryptLocalSettings } from './appSettings/decryptLocalSettings';
import { downloadAppSettings } from './appSettings/downloadAppSettings';
import { encryptLocalSettings } from './appSettings/encryptLocalSettings';
import { setAzureWebJobsStorage } from './appSettings/setAzureWebJobsStorage';
import { toggleSlotSetting } from './appSettings/toggleSlotSetting';
import { uploadAppSettings } from './appSettings/uploadAppSettings';
import { browseWebsite } from './browseWebsite'; // import menu item 1
//VALEN EDIT
import { cloneLocally } from './cloneProjectLocally';
import { configureDeploymentSource } from './configureDeploymentSource'; // import menu item 2
import { copyFunctionUrl } from './copyFunctionUrl';
import { createChildNode } from './createChildNode';
import { createFunctionFromCommand } from './createFunction/createFunction';
import { createFunctionApp, createFunctionAppAdvanced } from './createFunctionApp/createFunctionApp';
import { createNewProjectFromCommand } from './createNewProject/createNewProject';
import { createSlot } from './createSlot';
import { deleteFunction } from './deleteFunction';
import { deleteNode } from './deleteNode';
import { deployProductionSlot, deploySlot } from './deploy/deploy'; // import menu item 2
import { connectToGitHub } from './deployments/connectToGitHub';
import { disconnectRepo } from './deployments/disconnectRepo';
import { redeployDeployment } from './deployments/redeployDeployment';
import { viewCommitInGitHub } from './deployments/viewCommitInGitHub';
import { viewDeploymentLogs } from './deployments/viewDeploymentLogs';
import { editAppSetting } from './editAppSetting';
import { executeFunction } from './executeFunction';
import { initProjectForVSCode } from './initProjectForVSCode/initProjectForVSCode';
import { startStreamingLogs } from './logstream/startStreamingLogs'; // import menu item 4
import { stopStreamingLogs } from './logstream/stopStreamingLogs'; // import menu item 4
import { openFile } from './openFile';
import { openInPortal } from './openInPortal'; // import menu item 1
import { pickFuncProcess } from './pickFuncProcess';
import { startRemoteDebug } from './remoteDebug/startRemoteDebug';
import { remoteDebugJavaFunctionApp } from './remoteDebugJava/remoteDebugJavaFunctionApp';
import { renameAppSetting } from './renameAppSetting';
import { restartFunctionApp } from './restartFunctionApp'; // import menu item 3
import { startFunctionApp } from './startFunctionApp'; // import menu item 3
import { stopFunctionApp } from './stopFunctionApp'; // import menu item 3
import { swapSlot } from './swapSlot';
//VALEN EDIT:
import { disableFunction, enableFunction } from './updateDisabledState';
import { viewProperties } from './viewProperties'; // import menu item 5








export function registerCommands(): void {
    // Valen: Register command takes a string and a callback and debounce if you want delay between clicks
    registerCommand('azureFunctions.addBinding', addBinding);
    registerCommand('azureFunctions.appSettings.add', async (context: IActionContext, node?: AzExtParentTreeItem) => await createChildNode(context, AppSettingsTreeItem.contextValue, node));
    registerCommand('azureFunctions.appSettings.decrypt', decryptLocalSettings);
    registerCommand('azureFunctions.appSettings.delete', async (context: IActionContext, node?: AzExtTreeItem) => await deleteNode(context, AppSettingTreeItem.contextValue, node));
    registerCommand('azureFunctions.appSettings.download', downloadAppSettings); // APP SETTINGS DOWNLOAD FLOW
    registerCommand('azureFunctions.appSettings.edit', editAppSetting);
    registerCommand('azureFunctions.appSettings.encrypt', encryptLocalSettings);
    registerCommand('azureFunctions.appSettings.rename', renameAppSetting);
    registerCommand('azureFunctions.appSettings.toggleSlotSetting', toggleSlotSetting);
    registerCommand('azureFunctions.appSettings.upload', uploadAppSettings);
    registerCommand('azureFunctions.browseWebsite', browseWebsite); // menu item 1
    registerCommand('azureFunctions.configureDeploymentSource', configureDeploymentSource); // menu item 2
    registerCommand('azureFunctions.connectToGitHub', connectToGitHub);
    registerCommand('azureFunctions.copyFunctionUrl', copyFunctionUrl);
    registerCommand('azureFunctions.createFunction', createFunctionFromCommand);
    registerCommand('azureFunctions.createFunctionApp', createFunctionApp);
    registerCommand('azureFunctions.createFunctionAppAdvanced', createFunctionAppAdvanced);
    registerCommand('azureFunctions.createNewProject', createNewProjectFromCommand);
    registerCommand('azureFunctions.createSlot', createSlot);
    registerCommand('azureFunctions.deleteFunction', deleteFunction);
    registerCommand('azureFunctions.deleteFunctionApp', async (context: IActionContext, node?: AzExtTreeItem) => await deleteNode(context, ProductionSlotTreeItem.contextValue, node)); // menu item 3
    registerCommand('azureFunctions.deleteProxy', async (context: IActionContext, node?: AzExtTreeItem) => await deleteNode(context, ProxyTreeItem.contextValue, node));
    registerCommand('azureFunctions.deleteSlot', async (context: IActionContext, node?: AzExtTreeItem) => await deleteNode(context, SlotTreeItem.contextValue, node));
    registerCommand('azureFunctions.disableFunction', disableFunction);
    registerSiteCommand('azureFunctions.deploy', deployProductionSlot); // menu item 2
    registerSiteCommand('azureFunctions.deploySlot', deploySlot);
    registerCommand('azureFunctions.disconnectRepo', disconnectRepo);
    registerCommand('azureFunctions.enableFunction', enableFunction);
    registerCommand('azureFunctions.executeFunction', executeFunction);
    registerCommand('azureFunctions.initProjectForVSCode', initProjectForVSCode);
    registerCommand('azureFunctions.installOrUpdateFuncCoreTools', installOrUpdateFuncCoreTools);
    registerCommand('azureFunctions.loadMore', async (context: IActionContext, node: AzureTreeItem) => await ext.tree.loadMore(node, context));
    registerCommand('azureFunctions.openFile', openFile);
    registerCommand('azureFunctions.openInPortal', openInPortal); // menu item 1
    registerCommand('azureFunctions.pickProcess', pickFuncProcess);
    registerSiteCommand('azureFunctions.redeploy', redeployDeployment);
    registerCommand('azureFunctions.refresh', async (context: IActionContext, node?: AzureTreeItem) => await ext.tree.refresh(context, node)); // menu item 5
    registerCommand('azureFunctions.restartFunctionApp', restartFunctionApp); // menu item 3
    registerCommand('azureFunctions.selectSubscriptions', () => commands.executeCommand('azure-account.selectSubscriptions'));
    registerCommand('azureFunctions.setAzureWebJobsStorage', setAzureWebJobsStorage);
    registerCommand('azureFunctions.startFunctionApp', startFunctionApp); // menu item 3
    registerCommand('azureFunctions.startJavaRemoteDebug', remoteDebugJavaFunctionApp);
    registerCommand('azureFunctions.startRemoteDebug', startRemoteDebug);
    registerCommand('azureFunctions.startStreamingLogs', startStreamingLogs); // menu item 4
    registerCommand('azureFunctions.stopFunctionApp', stopFunctionApp); // menu item 3
    registerCommand('azureFunctions.stopStreamingLogs', stopStreamingLogs); // menu item 4
    registerCommand('azureFunctions.swapSlot', swapSlot);
    registerCommand('azureFunctions.toggleAppSettingVisibility', async (context: IActionContext, node: AppSettingTreeItem) => { await node.toggleValueVisibility(context); }, 250);
    registerCommand('azureFunctions.uninstallFuncCoreTools', uninstallFuncCoreTools);
    registerCommand('azureFunctions.viewCommitInGitHub', viewCommitInGitHub);
    registerSiteCommand('azureFunctions.viewDeploymentLogs', viewDeploymentLogs);
    registerCommand('azureFunctions.viewProperties', viewProperties); // menu item 5
    registerCommand('azureFunctions.showOutputChannel', () => { ext.outputChannel.show(); });
    registerCommand('azureFunctions.cloneLocally', cloneLocally);

}
