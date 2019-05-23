/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { getCliFeedAppSettings } from '../../utils/getCliFeedJson';
import { convertStringToRuntime, getFunctionsWorkerRuntime } from '../../vsCodeConfig/settings';

export async function verifyAppSettings(actionContext: IActionContext, node: SlotTreeItemBase, runtime: ProjectRuntime, language: ProjectLanguage): Promise<void> {
    const appSettings: WebSiteManagementModels.StringDictionary = await node.root.client.listApplicationSettings();
    if (appSettings.properties) {
        const updateAppSettings: boolean = await verifyWebContentSettings(node, actionContext, appSettings.properties) || await verifyRuntimeIsCompatible(runtime, language, appSettings.properties);
        if (updateAppSettings) {
            await node.root.client.updateApplicationSettings(appSettings);
            // if the user cancels the deployment, the app settings node doesn't reflect the updated settings
            await node.appSettingsTreeItem.refresh();
        }
    }
}

/**
 * NOTE: If we can't recognize the Azure runtime (aka it's undefined), just assume it's compatible
 */
export async function verifyRuntimeIsCompatible(localFuncRuntime: ProjectRuntime, localLanguage: ProjectLanguage, remoteProperties: { [propertyName: string]: string }): Promise<boolean> {
    const rawAzureFuncRuntime: string = remoteProperties.FUNCTIONS_EXTENSION_VERSION;
    const azureFuncRuntime: ProjectRuntime | undefined = convertStringToRuntime(rawAzureFuncRuntime);

    const azureWorkerRuntime: string | undefined = remoteProperties.FUNCTIONS_WORKER_RUNTIME;
    const localWorkerRuntime: string | undefined = getFunctionsWorkerRuntime(localLanguage);

    let shouldPrompt: boolean = !!rawAzureFuncRuntime && azureFuncRuntime !== localFuncRuntime;
    let message: string = localize('incompatibleRuntimeV1', 'The remote runtime "{0}" is not compatible with your local runtime "{1}".', rawAzureFuncRuntime, localFuncRuntime);
    if (localFuncRuntime === ProjectRuntime.v2 && localWorkerRuntime) {
        shouldPrompt = shouldPrompt || (!!azureWorkerRuntime && azureWorkerRuntime !== localWorkerRuntime);
        message = localize('incompatibleRuntimeV2', 'The remote runtime "{0}" and "{1}" is not compatible with your local runtime "{2}" and "{3}".', rawAzureFuncRuntime, azureWorkerRuntime, localFuncRuntime, localWorkerRuntime);
    }

    if (shouldPrompt) {
        const updateRemoteRuntime: vscode.MessageItem = { title: localize('updateRemoteRuntime', 'Update remote runtime') };
        const learnMoreLink: string = 'https://aka.ms/azFuncRuntime';
        // No need to check result - cancel will throw a UserCancelledError
        await ext.ui.showWarningMessage(message, { modal: true, learnMoreLink }, updateRemoteRuntime);

        const newAppSettings: { [key: string]: string } = await getCliFeedAppSettings(localFuncRuntime);
        if (localFuncRuntime === ProjectRuntime.v2 && localWorkerRuntime) {
            newAppSettings.FUNCTIONS_WORKER_RUNTIME = localWorkerRuntime;
        }

        for (const key of Object.keys(newAppSettings)) {
            const value: string = newAppSettings[key];
            ext.outputChannel.appendLine(localize('updateFunctionRuntime', 'Updating "{0}" to "{1}"...', key, value));
            remoteProperties[key] = value;
        }

        return true;
    } else {
        return false;
    }
}

/**
 * We need this check due to this issue: https://github.com/Microsoft/vscode-azurefunctions/issues/625
 * Only applies to Linux Consumption apps
 */
async function verifyWebContentSettings(node: SlotTreeItemBase, actionContext: IActionContext, remoteProperties: { [propertyName: string]: string }): Promise<boolean> {
    const isConsumption: boolean = await node.getIsConsumption();
    if (node.root.client.isLinux && isConsumption) {
        const WEBSITE_CONTENTAZUREFILECONNECTIONSTRING: string = 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING';
        const WEBSITE_CONTENTSHARE: string = 'WEBSITE_CONTENTSHARE';
        if (remoteProperties[WEBSITE_CONTENTAZUREFILECONNECTIONSTRING] || remoteProperties[WEBSITE_CONTENTSHARE]) {
            actionContext.properties.webContentSettingsRemoved = 'false';
            await ext.ui.showWarningMessage(
                localize('notConfiguredForDeploy', 'The selected app is not configured for deployment through VS Code. Remove app settings "{0}" and "{1}"?', WEBSITE_CONTENTAZUREFILECONNECTIONSTRING, WEBSITE_CONTENTSHARE),
                { modal: true },
                DialogResponses.yes,
                DialogResponses.cancel
            );
            delete remoteProperties[WEBSITE_CONTENTAZUREFILECONNECTIONSTRING];
            delete remoteProperties[WEBSITE_CONTENTSHARE];
            actionContext.properties.webContentSettingsRemoved = 'true';
            return true;
        }
    }

    return false;
}
