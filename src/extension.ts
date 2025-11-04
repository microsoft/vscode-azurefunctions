/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { registerAppServiceExtensionVariables } from '@microsoft/vscode-azext-azureappservice';
import { registerAzureUtilsExtensionVariables } from '@microsoft/vscode-azext-azureutils';
import { callWithTelemetryAndErrorHandling, createApiProvider, createAzExtOutputChannel, createExperimentationService, registerErrorHandler, registerEvent, registerReportIssueCommand, registerUIExtensionVariables, type IActionContext, type apiUtils } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { createAzureFunctionsApiProvider } from './commands/api/createAzureFunctionsApiProvider';
import { runPostFunctionCreateStepsFromCache } from './commands/createFunction/FunctionCreateStepBase';
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
import { validateFuncCoreToolsIsLatest } from './funcCoreTools/validateFuncCoreToolsIsLatest';
import { CentralTemplateProvider } from './templates/CentralTemplateProvider';
import { ShellContainerClient } from './tree/durableTaskScheduler/ContainerClient';
import { HttpDurableTaskSchedulerClient } from './tree/durableTaskScheduler/DurableTaskSchedulerClient';
import { DurableTaskSchedulerDataBranchProvider } from './tree/durableTaskScheduler/DurableTaskSchedulerDataBranchProvider';
import { DockerDurableTaskSchedulerEmulatorClient } from './tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient';
import { registerContentProvider } from './utils/textUtils';
import { verifyVSCodeConfigOnActivate } from './vsCodeConfig/verifyVSCodeConfigOnActivate';

const emulatorClient = new DockerDurableTaskSchedulerEmulatorClient(new ShellContainerClient());

export async function activateInternal(context: vscode.ExtensionContext, perfStats: { loadStartTime: number; loadEndTime: number }, ignoreBundle?: boolean): Promise<apiUtils.AzureExtensionApiProvider> {
    ext.context = context;
    ext.ignoreBundle = ignoreBundle;
    ext.outputChannel = createAzExtOutputChannel('Azure Functions', ext.prefix);
    context.subscriptions.push(ext.outputChannel);

    registerUIExtensionVariables(ext);
    registerAzureUtilsExtensionVariables(ext);
    registerAppServiceExtensionVariables(ext);

    return await callWithTelemetryAndErrorHandling('azureFunctions.activate', async (activateContext: IActionContext) => {
        activateContext.errorHandling.rethrow = true;
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

        const schedulerClient = new HttpDurableTaskSchedulerClient();
        const dataBranchProvider = new DurableTaskSchedulerDataBranchProvider(schedulerClient);

        const dts = {
            dataBranchProvider,
            emulatorClient,
            schedulerClient
        };
        registerCommands({ dts });

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

        return createAzureFunctionsApiProvider({ dts });

    }) ?? createApiProvider([]);
}

export async function deactivateInternal(): Promise<void> {
    await emulatorClient.disposeAsync();
}
