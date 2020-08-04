/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import * as vscode from 'vscode';
import { SiteClient } from 'vscode-azureappservice';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { contentConnectionStringKey, contentShareKey, extensionVersionKey, ProjectLanguage, runFromPackageKey, workerRuntimeKey } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { getFunctionsWorkerRuntime } from '../../vsCodeConfig/settings';

export async function verifyAppSettings(context: IActionContext, node: SlotTreeItemBase, version: FuncVersion, language: ProjectLanguage): Promise<void> {
    const appSettings: WebSiteManagementModels.StringDictionary = await node.root.client.listApplicationSettings();
    if (appSettings.properties) {
        await verifyVersionAndLanguage(context, node.root.client.fullName, version, language, appSettings.properties);

        let updateAppSettings: boolean = false;
        if (node.root.client.isLinux) {
            const isConsumption: boolean = await node.getIsConsumption();
            if (isConsumption) {
                updateAppSettings = await verifyWebContentSettings(context, appSettings.properties);
            }
        } else {
            updateAppSettings = await verifyRunFromPackage(context, node.root.client, appSettings.properties);
        }

        if (updateAppSettings) {
            await node.root.client.updateApplicationSettings(appSettings);
            // if the user cancels the deployment, the app settings node doesn't reflect the updated settings
            await node.appSettingsTreeItem.refresh();
        }
    }
}

export async function verifyVersionAndLanguage(context: IActionContext, siteName: string, localVersion: FuncVersion, localLanguage: ProjectLanguage, remoteProperties: { [propertyName: string]: string }): Promise<void> {
    const rawAzureVersion: string = remoteProperties[extensionVersionKey];
    context.telemetry.properties.remoteVersion = rawAzureVersion;
    const azureVersion: FuncVersion | undefined = tryParseFuncVersion(rawAzureVersion);

    const azureWorkerRuntime: string | undefined = remoteProperties[workerRuntimeKey];
    context.telemetry.properties.remoteRuntime = azureWorkerRuntime;
    const localWorkerRuntime: string | undefined = getFunctionsWorkerRuntime(localLanguage);
    if (localVersion !== FuncVersion.v1 && azureWorkerRuntime && localWorkerRuntime && azureWorkerRuntime !== localWorkerRuntime) {
        throw new Error(localize('incompatibleRuntime', 'The remote runtime "{0}" for function app "{1}" does not match your local runtime "{2}".', azureWorkerRuntime, siteName, localWorkerRuntime));
    }

    if (!!rawAzureVersion && azureVersion !== localVersion) {
        const message: string = localize('incompatibleVersion', 'The remote version "{0}" for function app "{1}" does not match your local version "{2}".', rawAzureVersion, siteName, localVersion);
        const deployAnyway: vscode.MessageItem = { title: localize('deployAnyway', 'Deploy Anyway') };
        const learnMoreLink: string = 'https://aka.ms/azFuncRuntime';
        context.telemetry.properties.cancelStep = 'incompatibleVersion';
        // No need to check result - cancel will throw a UserCancelledError
        await ext.ui.showWarningMessage(message, { modal: true, learnMoreLink }, deployAnyway);
        context.telemetry.properties.cancelStep = undefined;
    }
}

/**
 * Automatically set to 1 on windows plans because it has significant perf improvements
 * https://github.com/microsoft/vscode-azurefunctions/issues/1465
 */
async function verifyRunFromPackage(context: IActionContext, client: SiteClient, remoteProperties: { [propertyName: string]: string }): Promise<boolean> {
    const shouldAddSetting: boolean = !remoteProperties[runFromPackageKey];
    if (shouldAddSetting) {
        remoteProperties[runFromPackageKey] = '1';
        ext.outputChannel.appendLog(localize('addedRunFromPackage', 'Added app setting "{0}" to improve performance of function app. Learn more here: https://aka.ms/AA8vxc0', runFromPackageKey), { resourceName: client.fullName });
    }

    context.telemetry.properties.addedRunFromPackage = String(shouldAddSetting);
    return shouldAddSetting;
}

/**
 * We need this check due to this issue: https://github.com/Microsoft/vscode-azurefunctions/issues/625
 * Only applies to Linux Consumption apps
 */
async function verifyWebContentSettings(context: IActionContext, remoteProperties: { [propertyName: string]: string }): Promise<boolean> {
    const shouldRemoveSettings: boolean = !!(remoteProperties[contentConnectionStringKey] || remoteProperties[contentShareKey]);
    if (shouldRemoveSettings) {
        const message: string = localize('notConfiguredForDeploy', 'The selected app is not configured for deployment through VS Code. Remove app settings "{0}" and "{1}"?', contentConnectionStringKey, contentShareKey);
        await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes);
        delete remoteProperties[contentConnectionStringKey];
        delete remoteProperties[contentShareKey];
    }

    context.telemetry.properties.webContentSettingsRemoved = String(shouldRemoveSettings);
    return shouldRemoveSettings;
}
