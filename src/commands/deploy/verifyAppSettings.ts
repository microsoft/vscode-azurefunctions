/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { extensionVersionKey, ProjectLanguage, workerRuntimeKey } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { getFunctionsWorkerRuntime } from '../../vsCodeConfig/settings';

export async function verifyAppSettings(context: IActionContext, node: SlotTreeItemBase, version: FuncVersion, language: ProjectLanguage): Promise<void> {
    const appSettings: WebSiteManagementModels.StringDictionary = await node.root.client.listApplicationSettings();
    if (appSettings.properties) {
        await verifyVersionAndLanguage(node.root.client.fullName, version, language, appSettings.properties);

        const updateAppSettings: boolean = await verifyWebContentSettings(node, context, appSettings.properties);
        if (updateAppSettings) {
            await node.root.client.updateApplicationSettings(appSettings);
            // if the user cancels the deployment, the app settings node doesn't reflect the updated settings
            await node.appSettingsTreeItem.refresh();
        }
    }
}

export async function verifyVersionAndLanguage(siteName: string, localVersion: FuncVersion, localLanguage: ProjectLanguage, remoteProperties: { [propertyName: string]: string }): Promise<void> {
    const rawAzureVersion: string = remoteProperties[extensionVersionKey];
    const azureVersion: FuncVersion | undefined = tryParseFuncVersion(rawAzureVersion);

    const azureWorkerRuntime: string | undefined = remoteProperties[workerRuntimeKey];
    const localWorkerRuntime: string | undefined = getFunctionsWorkerRuntime(localLanguage);
    if (localVersion !== FuncVersion.v1 && azureWorkerRuntime && localWorkerRuntime && azureWorkerRuntime !== localWorkerRuntime) {
        throw new Error(localize('incompatibleRuntime', 'The remote runtime "{0}" for function app "{1}" does not match your local runtime "{2}".', azureWorkerRuntime, siteName, localWorkerRuntime));
    }

    if (!!rawAzureVersion && azureVersion !== localVersion) {
        const message: string = localize('incompatibleVersion', 'The remote version "{0}" for function app "{1}" does not match your local version "{2}".', rawAzureVersion, siteName, localVersion);
        const deployAnyway: vscode.MessageItem = { title: localize('deployAnyway', 'Deploy Anyway') };
        const learnMoreLink: string = 'https://aka.ms/azFuncRuntime';
        // No need to check result - cancel will throw a UserCancelledError
        await ext.ui.showWarningMessage(message, { modal: true, learnMoreLink }, deployAnyway);
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
