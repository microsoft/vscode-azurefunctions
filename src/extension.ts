/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { registerAppServiceExtensionVariables } from '@microsoft/vscode-azext-azureappservice';
import { registerAzureUtilsExtensionVariables, type AzureAccountTreeItemBase } from '@microsoft/vscode-azext-azureutils';
import { callWithTelemetryAndErrorHandling, createApiProvider, createAzExtOutputChannel, createExperimentationService, registerErrorHandler, registerEvent, registerOnActionStartHandler, registerReportIssueCommand, registerUIExtensionVariables, type apiUtils, type IActionContext } from '@microsoft/vscode-azext-utils';
import { AzExtResourceType, getAzureResourcesExtensionApi } from '@microsoft/vscode-azureresources-api';
import * as vscode from 'vscode';
import { FunctionAppResolver } from './FunctionAppResolver';
import { FunctionsLocalResourceProvider } from './LocalResourceProvider';
import { createFunctionFromApi } from './commands/api/createFunctionFromApi';
import { downloadAppSettingsFromApi } from './commands/api/downloadAppSettingsFromApi';
import { revealTreeItem } from './commands/api/revealTreeItem';
import { uploadAppSettingsFromApi } from './commands/api/uploadAppSettingsFromApi';
import { copyFunctionUrl } from './commands/copyFunctionUrl';
import { runPostFunctionCreateStepsFromCache } from './commands/createFunction/FunctionCreateStepBase';
import { createFunctionInternal } from './commands/createFunction/createFunction';
import { createFunctionApp, createFunctionAppAdvanced } from './commands/createFunctionApp/createFunctionApp';
import { createNewProjectInternal } from './commands/createNewProject/createNewProject';
import { deleteFunctionApp } from './commands/deleteFunctionApp';
import { deployProductionSlot } from './commands/deploy/deploy';
import { initProjectForVSCode } from './commands/initProjectForVSCode/initProjectForVSCode';
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
import { ext, TemplateSource } from './extensionVariables';
import { registerFuncHostTaskEvents } from './funcCoreTools/funcHostTask';
import { validateFuncCoreToolsInstalled } from './funcCoreTools/validateFuncCoreToolsInstalled';
import { validateFuncCoreToolsIsLatest } from './funcCoreTools/validateFuncCoreToolsIsLatest';
import { getResourceGroupsApi } from './getExtensionApi';
import { CentralTemplateProvider } from './templates/CentralTemplateProvider';
import type { TestApi } from './testApi';
import { ShellContainerClient } from './tree/durableTaskScheduler/ContainerClient';
import { HttpDurableTaskSchedulerClient } from './tree/durableTaskScheduler/DurableTaskSchedulerClient';
import { DurableTaskSchedulerDataBranchProvider } from './tree/durableTaskScheduler/DurableTaskSchedulerDataBranchProvider';
import { DockerDurableTaskSchedulerEmulatorClient } from './tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient';
import { DurableTaskSchedulerWorkspaceDataBranchProvider } from './tree/durableTaskScheduler/DurableTaskSchedulerWorkspaceDataBranchProvider';
import { DurableTaskSchedulerWorkspaceResourceProvider } from './tree/durableTaskScheduler/DurableTaskSchedulerWorkspaceResourceProvider';
import { registerContentProvider } from './utils/textUtils';
import { verifyVSCodeConfigOnActivate } from './vsCodeConfig/verifyVSCodeConfigOnActivate';
import { type AzureFunctionsExtensionApi } from './vscode-azurefunctions.api';
import { listLocalFunctions } from './workspace/listLocalFunctions';
import { listLocalProjects } from './workspace/listLocalProjects';

const emulatorClient = new DockerDurableTaskSchedulerEmulatorClient(new ShellContainerClient());

export async function activateInternal(context: vscode.ExtensionContext, perfStats: { loadStartTime: number; loadEndTime: number }): Promise<apiUtils.AzureExtensionApiProvider> {
    console.log('**********************************************');
    console.log('Activating Azure Functions extension...');
    ext.context = context;
    ext.outputChannel = createAzExtOutputChannel('Azure Functions', ext.prefix);
    ext.emulatorClient = emulatorClient;
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
        console.log('Registered CentralTemplateProvider in extension variables.');
        context.subscriptions.push(templateProvider);

        // Suppress "Report an Issue" button for all errors in favor of the command
        registerErrorHandler(c => c.errorHandling.suppressReportIssue = true);
        registerReportIssueCommand('azureFunctions.reportIssue');

        const schedulerClient = new HttpDurableTaskSchedulerClient();
        const dataBranchProvider = new DurableTaskSchedulerDataBranchProvider(schedulerClient);

        registerCommands({
            dts: {
                dataBranchProvider,
                emulatorClient,
                schedulerClient
            }
        });

        registerFuncHostTaskEvents();

        const nodeDebugProvider: NodeDebugProvider = new NodeDebugProvider();
        const pythonDebugProvider: PythonDebugProvider = new PythonDebugProvider();
        const javaDebugProvider: JavaDebugProvider = new JavaDebugProvider();
        const ballerinaDebugProvider: BallerinaDebugProvider = new BallerinaDebugProvider();
        const powershellDebugProvider: PowerShellDebugProvider = new PowerShellDebugProvider();

        // These don't actually overwrite "node", "python", etc. - they just add to it
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('node', nodeDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('python', pythonDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('debugpy', pythonDebugProvider));
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

        ext.rgApiV2 = azureResourcesApi;

        azureResourcesApi.resources.registerAzureResourceBranchDataProvider('DurableTaskScheduler' as AzExtResourceType, dataBranchProvider);

        azureResourcesApi.resources.registerWorkspaceResourceProvider(new DurableTaskSchedulerWorkspaceResourceProvider());
        azureResourcesApi.resources.registerWorkspaceResourceBranchDataProvider(
            'DurableTaskSchedulerEmulator',
            new DurableTaskSchedulerWorkspaceDataBranchProvider(emulatorClient));
    });

    const apis: (AzureFunctionsExtensionApi | TestApi)[] = [
        <AzureFunctionsExtensionApi>{
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
        }
    ];

    // Add test API when running tests
    // This allows tests to access and override internal extension state without changing the public API.
    if (process.env.VSCODE_RUNNING_TESTS) {
        // Cache of template providers keyed by source, for use across test runs
        const testTemplateProviders = new Map<string, CentralTemplateProvider>();

        apis.push(<TestApi>{
            apiVersion: '99.0.0',
            extensionVariables: {
                getOutputChannel: () => ext.outputChannel,
                getContext: () => ext.context,
                getRgApi: () => ext.rgApi,
                getIgnoreBundle: () => ext.ignoreBundle
            },
            testing: {
                setIgnoreBundle: (ignoreBundle) => {
                    ext.ignoreBundle = ignoreBundle;
                },
                registerOnActionStartHandler,
            },
            commands: {
                createFunctionApp,
                createFunctionAppAdvanced,
                deleteFunctionApp,
                deployProductionSlot,
                copyFunctionUrl,
                createNewProjectInternal,
                createFunctionInternal,
                initProjectForVSCode,
                registerTemplateSource: (context, source) => {
                    let cached = testTemplateProviders.get(source);
                    if (!cached) {
                        cached = new CentralTemplateProvider(source as TemplateSource);
                        testTemplateProviders.set(source, cached);
                    }
                    ext.templateProvider.registerActionVariable(cached, context);
                },
                getFunctionTemplates: async (context, projectPath, language, languageModel, version, templateFilter, projectTemplateKey, source) => {
                    let provider: CentralTemplateProvider;
                    if (source) {
                        let cached = testTemplateProviders.get(source);
                        if (!cached) {
                            cached = new CentralTemplateProvider(source as TemplateSource);
                            testTemplateProviders.set(source, cached);
                        }
                        provider = cached;
                        ext.templateProvider.registerActionVariable(provider, context);
                    } else {
                        provider = ext.templateProvider.get(context);
                    }
                    return provider.getFunctionTemplates(context, projectPath, language, languageModel, version, templateFilter, projectTemplateKey);
                }
            }
        });
    }

    return createApiProvider(apis);
}

export async function deactivateInternal(): Promise<void> {
    await emulatorClient.disposeAsync();
}
