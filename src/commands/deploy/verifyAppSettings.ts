/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage, workerRuntimeKey } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { cliFeedUtils } from '../../utils/cliFeedUtils';
import { getFunctionsWorkerRuntime } from '../../vsCodeConfig/settings';

export async function verifyAppSettings(context: IActionContext, node: SlotTreeItemBase, version: FuncVersion, language: ProjectLanguage): Promise<void> {
    const appSettings: WebSiteManagementModels.StringDictionary = await node.root.client.listApplicationSettings();
    if (appSettings.properties) {
        const updateAppSettings: boolean = await verifyWebContentSettings(node, context, appSettings.properties) || await verifyVersionAndLanguage(version, language, appSettings.properties);
        if (updateAppSettings) {
            await node.root.client.updateApplicationSettings(appSettings);
            // if the user cancels the deployment, the app settings node doesn't reflect the updated settings
            await node.appSettingsTreeItem.refresh();
        }
    }
}

/**
 * NOTE: If we can't recognize the remote settings, just assume it's compatible
 */
export async function verifyVersionAndLanguage(localVersion: FuncVersion, localLanguage: ProjectLanguage, remoteProperties: { [propertyName: string]: string }): Promise<boolean> {
    const rawAzureVersion: string = remoteProperties.FUNCTIONS_EXTENSION_VERSION;
    const azureVersion: FuncVersion | undefined = tryParseFuncVersion(rawAzureVersion);

    const azureWorkerRuntime: string | undefined = remoteProperties[workerRuntimeKey];
    const localWorkerRuntime: string | undefined = getFunctionsWorkerRuntime(localLanguage);

    let shouldPrompt: boolean = !!rawAzureVersion && azureVersion !== localVersion;
    let message: string = localize('incompatibleRuntimeV1', 'The remote version "{0}" is not compatible with your local version "{1}".', rawAzureVersion, localVersion);
    if (localVersion !== FuncVersion.v1 && localWorkerRuntime) {
        shouldPrompt = shouldPrompt || (!!azureWorkerRuntime && azureWorkerRuntime !== localWorkerRuntime);
        message = localize('incompatibleVersionAndRuntime', 'The remote version "{0}" and runtime "{1}" is not compatible with your local version "{2}" and runtime "{3}".', rawAzureVersion, azureWorkerRuntime, localVersion, localWorkerRuntime);
    }

    if (shouldPrompt) {
        const updateRemoteRuntime: vscode.MessageItem = { title: localize('updateRemoteSettings', 'Update remote settings') };
        const learnMoreLink: string = 'https://aka.ms/azFuncRuntime';
        // No need to check result - cancel will throw a UserCancelledError
        await ext.ui.showWarningMessage(message, { modal: true, learnMoreLink }, updateRemoteRuntime);

        const newAppSettings: { [key: string]: string } = await cliFeedUtils.getAppSettings(localVersion);
        if (localVersion !== FuncVersion.v1 && localWorkerRuntime) {
            newAppSettings[workerRuntimeKey] = localWorkerRuntime;
        }

        for (const key of Object.keys(newAppSettings)) {
            const value: string = newAppSettings[key];
            ext.outputChannel.appendLog(localize('updateFunctionRuntime', 'Updating "{0}" to "{1}"...', key, value));
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
async function verifyWebContentSettings(node: SlotTreeItemBase, context: IActionContext, remoteProperties: { [propertyName: string]: string }): Promise<boolean> {
    const isConsumption: boolean = await node.getIsConsumption();
    if (node.root.client.isLinux && isConsumption) {
        const WEBSITE_CONTENTAZUREFILECONNECTIONSTRING: string = 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING';
        const WEBSITE_CONTENTSHARE: string = 'WEBSITE_CONTENTSHARE';
        if (remoteProperties[WEBSITE_CONTENTAZUREFILECONNECTIONSTRING] || remoteProperties[WEBSITE_CONTENTSHARE]) {
            context.telemetry.properties.webContentSettingsRemoved = 'false';
            await ext.ui.showWarningMessage(
                localize('notConfiguredForDeploy', 'The selected app is not configured for deployment through VS Code. Remove app settings "{0}" and "{1}"?', WEBSITE_CONTENTAZUREFILECONNECTIONSTRING, WEBSITE_CONTENTSHARE),
                { modal: true },
                DialogResponses.yes,
                DialogResponses.cancel
            );
            delete remoteProperties[WEBSITE_CONTENTAZUREFILECONNECTIONSTRING];
            delete remoteProperties[WEBSITE_CONTENTSHARE];
            context.telemetry.properties.webContentSettingsRemoved = 'true';
            return true;
        }
    }

    return false;
}
