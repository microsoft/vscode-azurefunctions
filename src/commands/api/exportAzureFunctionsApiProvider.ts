/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type AzureAccountTreeItemBase } from '@microsoft/vscode-azext-azureutils';
import { callWithTelemetryAndErrorHandling, createApiProvider, type apiUtils, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type AzureHostExtensionApi } from "@microsoft/vscode-azext-utils/hostapi";
import { AzExtResourceType, prepareAzureResourcesApiRequest, type AzExtCredentialManager, type AzureExtensionApi, type AzureResourcesApiRequestContext, type AzureResourcesExtensionApi, type AzureResourcesHandshakeError } from "@microsoft/vscode-azureresources-api";
import { ext } from "../../extensionVariables";
import { validateFuncCoreToolsInstalled } from "../../funcCoreTools/validateFuncCoreToolsInstalled";
import { FunctionAppResolver } from "../../FunctionAppResolver";
import { FunctionsLocalResourceProvider } from "../../LocalResourceProvider";
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type DurableTaskSchedulerDataBranchProvider } from "../../tree/durableTaskScheduler/DurableTaskSchedulerDataBranchProvider";
import { type DurableTaskSchedulerEmulatorClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient";
import { DurableTaskSchedulerWorkspaceDataBranchProvider } from "../../tree/durableTaskScheduler/DurableTaskSchedulerWorkspaceDataBranchProvider";
import { DurableTaskSchedulerWorkspaceResourceProvider } from "../../tree/durableTaskScheduler/DurableTaskSchedulerWorkspaceResourceProvider";
import { type AzureFunctionsExtensionApi } from "../../vscode-azurefunctions.api";
import { listLocalFunctions } from "../../workspace/listLocalFunctions";
import { listLocalProjects } from "../../workspace/listLocalProjects";
import { startFuncProcessFromApi } from "../pickFuncProcess";
import { createFunctionFromApi } from "./createFunctionFromApi";
import { downloadAppSettingsFromApi } from "./downloadAppSettingsFromApi";
import { revealTreeItem } from "./revealTreeItem";
import { uploadAppSettingsFromApi } from "./uploadAppSettingsFromApi";

export function exportAzureFunctionsApiProvider(
    credentialManager: AzExtCredentialManager<unknown>,
    services: {
        dts: {
            dataBranchProvider: DurableTaskSchedulerDataBranchProvider,
            emulatorClient: DurableTaskSchedulerEmulatorClient,
            schedulerClient: DurableTaskSchedulerClient,
        },
    },
): apiUtils.AzureExtensionApiProvider {

    const context: AzureResourcesApiRequestContext = {
        azureResourcesApiVersions: ['0.0.1', '2.0.0'],
        clientExtensionId: ext.context.extension.id,
        clientCredentialManager: credentialManager,
        onDidReceiveAzureResourcesApis: (azureResourcesApis: (AzureExtensionApi | AzureResourcesExtensionApi | undefined)[]) => {
            const [rgApi, rgApiV2] = azureResourcesApis;
            if (!rgApi || !rgApiV2) {
                throw new Error();
            }

            ext.rgApi = rgApi as AzureHostExtensionApi;
            ext.rgApi.registerApplicationResourceResolver(AzExtResourceType.FunctionApp, new FunctionAppResolver());
            ext.rgApi.registerWorkspaceResourceProvider('func', new FunctionsLocalResourceProvider());
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            ext.azureAccountTreeItem = ext.rgApi.appResourceTree._rootTreeItem as AzureAccountTreeItemBase;

            ext.rgApiV2 = rgApiV2 as AzureResourcesExtensionApi;
            ext.rgApiV2.resources.registerAzureResourceBranchDataProvider('DurableTaskScheduler' as AzExtResourceType, services.dts.dataBranchProvider);
            ext.rgApiV2.resources.registerWorkspaceResourceProvider(new DurableTaskSchedulerWorkspaceResourceProvider());
            ext.rgApiV2.resources.registerWorkspaceResourceBranchDataProvider(
                'DurableTaskSchedulerEmulator',
                new DurableTaskSchedulerWorkspaceDataBranchProvider(services.dts.emulatorClient));
        },
        onHandshakeError: (error: AzureResourcesHandshakeError) => {
            console.log(error);
        },
    };

    const functionAppsApi: AzureFunctionsExtensionApi = {
        apiVersion: '1.10.0',
        revealTreeItem,
        createFunction: createFunctionFromApi,
        downloadAppSettings: downloadAppSettingsFromApi,
        uploadAppSettings: uploadAppSettingsFromApi,
        listLocalProjects: listLocalProjects,
        listLocalFunctions: listLocalFunctions,
        isFuncCoreToolsInstalled: async (message: string) => {
            return !!await callWithTelemetryAndErrorHandling('azureFunctions.api.isFuncCoreToolsInstalled', async (actionContext: IActionContext) => {
                return await validateFuncCoreToolsInstalled(actionContext, message, undefined);
            });
        },
        startFuncProcess: startFuncProcessFromApi,
    };

    const { clientApi, requestResourcesApis } = prepareAzureResourcesApiRequest(context, functionAppsApi);
    requestResourcesApis();
    return createApiProvider([clientApi]);
}
