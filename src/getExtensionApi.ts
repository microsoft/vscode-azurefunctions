/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, apiUtils, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type AzureHostExtensionApi } from "@microsoft/vscode-azext-utils/hostapi";
import { commands } from "vscode";
import { type API as GitAPI, type GitExtension } from './api/git';
import { localize } from "./localize";
import type * as acaApi from "./vscode-azurecontainerapps.api";

export async function getResourceGroupsApi(): Promise<AzureHostExtensionApi> {
    const rgApiProvider = await apiUtils.getExtensionExports<apiUtils.AzureExtensionApiProvider>('ms-azuretools.vscode-azureresourcegroups');
    if (rgApiProvider) {
        return rgApiProvider.getApi<AzureHostExtensionApi>('^0.0.1');
    } else {
        throw new Error(localize('noResourceGroupExt', 'Could not find the Azure Resource Groups extension'));
    }
}

/**
 * @param installMessage Override default message shown if extension is not installed.
 */
export async function getAzureContainerAppsApi(context: IActionContext, installMessage?: string): Promise<acaApi.AzureContainerAppsExtensionApi> {
    const acaExtensionId: string = 'ms-azuretools.vscode-azurecontainerapps';
    const acaExtension: apiUtils.AzureExtensionApiProvider | undefined = await apiUtils.getExtensionExports(acaExtensionId);

    if (acaExtension) {
        return acaExtension.getApi<acaApi.AzureContainerAppsExtensionApi>('^0.0.1');
    }

    await context.ui.showWarningMessage(installMessage ??
        localize('acaInstall', 'You must have the "Azure Container Apps" extension installed to perform this operation.'), { title: 'Install', stepName: 'installContainerApps' });

    void commands.executeCommand('extension.open', acaExtensionId);

    // We still need to throw an error even if the user installs
    throw new UserCancelledError('postInstallContainerApps');
}

export async function getGitApi(): Promise<GitAPI> {
    const gitExtension: GitExtension | undefined = await apiUtils.getExtensionExports('vscode.git');
    if (gitExtension) {
        return gitExtension.getAPI(1);
    }

    throw new Error(localize('noGitExt', 'Could not find the Git extension'));
}
