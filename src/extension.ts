/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { registerAppServiceExtensionVariables } from '@microsoft/vscode-azext-azureappservice';
import { registerAzureUtilsExtensionVariables, type AzureAccountTreeItemBase } from '@microsoft/vscode-azext-azureutils';
import { callWithTelemetryAndErrorHandling, createApiProvider, createAzExtOutputChannel, createExperimentationService, registerErrorHandler, registerEvent, registerReportIssueCommand, registerUIExtensionVariables, type IActionContext, type apiUtils } from '@microsoft/vscode-azext-utils';
import { AzExtResourceType, getAzureResourcesExtensionApi } from '@microsoft/vscode-azureresources-api';
import * as vscode from 'vscode';
import { FunctionAppResolver } from './FunctionAppResolver';
import { FunctionsLocalResourceProvider } from './LocalResourceProvider';
import { createFunctionFromApi } from './commands/api/createFunctionFromApi';
import { downloadAppSettingsFromApi } from './commands/api/downloadAppSettingsFromApi';
import { revealTreeItem } from './commands/api/revealTreeItem';
import { uploadAppSettingsFromApi } from './commands/api/uploadAppSettingsFromApi';
import { runPostFunctionCreateStepsFromCache } from './commands/createFunction/FunctionCreateStepBase';
import { startFuncProcessFromApi } from './commands/pickFuncProcess';
import { registerCommands } from './commands/registerCommands';
import { func } from './constants';
import { BallerinaDebugProvider } from './debug/BallerinaDebugProvider';
import { FuncTaskProvider } from './debug/FuncTaskProvider';
import { JavaDebugProvider } from './debug/JavaDebugProvider';
import { NodeDebugProvider } from './debug/NodeDebugProvider';
import { PowerShellDebugProvider } from './debug/PowerShellDebugProvider';
import { PythonDebugProvider } from './debug/PythonDebugProvider';
import { handleUri } from './downloadAzureProject/handleUri';
import { ext } from './extensionVariables';
import { registerFuncHostTaskEvents } from './funcCoreTools/funcHostTask';
import { validateFuncCoreToolsInstalled } from './funcCoreTools/validateFuncCoreToolsInstalled';
import { validateFuncCoreToolsIsLatest } from './funcCoreTools/validateFuncCoreToolsIsLatest';
import { getResourceGroupsApi } from './getExtensionApi';
import { CentralTemplateProvider } from './templates/CentralTemplateProvider';
import { registerContentProvider } from './utils/textUtils';
import { verifyVSCodeConfigOnActivate } from './vsCodeConfig/verifyVSCodeConfigOnActivate';
import { type AzureFunctionsExtensionApi } from './vscode-azurefunctions.api';
import { listLocalFunctions } from './workspace/listLocalFunctions';
import { listLocalProjects } from './workspace/listLocalProjects';
import { DurableTaskSchedulerDataBranchProvider } from './tree/durableTaskScheduler/DurableTaskSchedulerDataBranchProvider';
import { HttpDurableTaskSchedulerClient } from './tree/durableTaskScheduler/DurableTaskSchedulerClient';

export async function activateInternal(context: vscode.ExtensionContext, perfStats: { loadStartTime: number; loadEndTime: number }, ignoreBundle?: boolean): Promise<apiUtils.AzureExtensionApiProvider> {
    ext.context = context;
    ext.ignoreBundle = ignoreBundle;
    ext.outputChannel = createAzExtOutputChannel('Azure Functions', ext.prefix);
    context.subscriptions.push(ext.outputChannel);

    registerUIExtensionVariables(ext);
    registerAzureUtilsExtensionVariables(ext);
    registerAppServiceExtensionVariables(ext);

    await callWithTelemetryAndErrorHandling('azureFunctions.activate', async (activateContext: IActionContext) => {
        activateContext.telemetry.properties.isActivationEvent = 'true';
        activateContext.telemetry.measurements.mainFileLoad = (perfStats.loadEndTime - perfStats.loadStartTime) / 1000;

        void runPostFunctionCreateStepsFromCache();

        void validateFuncCoreToolsIsLatest();

        const validateEventId: string = 'azureFunctions.validateFunctionProjects';
        void callWithTelemetryAndErrorHandling(validateEventId, async (actionContext: IActionContext) => {
            await verifyVSCodeConfigOnActivate(actionContext, vscode.workspace.workspaceFolders);
        });
        registerEvent(validateEventId, vscode.workspace.onDidChangeWorkspaceFolders, async (actionContext: IActionContext, event: vscode.WorkspaceFoldersChangeEvent) => {
            await verifyVSCodeConfigOnActivate(actionContext, event.added);
        });

        const templateProvider = new CentralTemplateProvider();
        ext.templateProvider.registerExtensionVariable(templateProvider);
        context.subscriptions.push(templateProvider);

        // Suppress "Report an Issue" button for all errors in favor of the command
        registerErrorHandler(c => c.errorHandling.suppressReportIssue = true);
        registerReportIssueCommand('azureFunctions.reportIssue');

        registerCommands();

        registerFuncHostTaskEvents();

        const nodeDebugProvider: NodeDebugProvider = new NodeDebugProvider();
        const pythonDebugProvider: PythonDebugProvider = new PythonDebugProvider();
        const javaDebugProvider: JavaDebugProvider = new JavaDebugProvider();
        const ballerinaDebugProvider: BallerinaDebugProvider = new BallerinaDebugProvider();
        const powershellDebugProvider: PowerShellDebugProvider = new PowerShellDebugProvider();

        // These don't actually overwrite "node", "python", etc. - they just add to it
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('node', nodeDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('python', pythonDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java', javaDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('ballerina', ballerinaDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('PowerShell', powershellDebugProvider));
        context.subscriptions.push(vscode.workspace.registerTaskProvider(func, new FuncTaskProvider(nodeDebugProvider, pythonDebugProvider, javaDebugProvider, ballerinaDebugProvider, powershellDebugProvider)));

        context.subscriptions.push(vscode.window.registerUriHandler({
            handleUri
        }));

        registerContentProvider();

        ext.experimentationService = await createExperimentationService(context);
        ext.rgApi = await getResourceGroupsApi();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        ext.azureAccountTreeItem = ext.rgApi.appResourceTree._rootTreeItem as AzureAccountTreeItemBase;
        ext.rgApi.registerApplicationResourceResolver(AzExtResourceType.FunctionApp, new FunctionAppResolver());
        ext.rgApi.registerWorkspaceResourceProvider('func', new FunctionsLocalResourceProvider());

        const azureResourcesApi = await getAzureResourcesExtensionApi(context, '2.0.0');

        azureResourcesApi.resources.registerAzureResourceBranchDataProvider('DurableTaskScheduler' as AzExtResourceType, new DurableTaskSchedulerDataBranchProvider(new HttpDurableTaskSchedulerClient()));
    });

    return createApiProvider([<AzureFunctionsExtensionApi>{
        revealTreeItem,
        createFunction: createFunctionFromApi,
        downloadAppSettings: downloadAppSettingsFromApi,
        uploadAppSettings: uploadAppSettingsFromApi,
        listLocalProjects: listLocalProjects,
        listLocalFunctions: listLocalFunctions,
        isFuncCoreToolsInstalled: async (message: string) => {
            return await callWithTelemetryAndErrorHandling('azureFunctions.api.isFuncCoreToolsInstalled', async (context: IActionContext) => {
                return await validateFuncCoreToolsInstalled(context, message, undefined);
            });
        },
        startFuncProcess: startFuncProcessFromApi,
        apiVersion: '1.10.0'
    }]);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivateInternal(): void {
}
