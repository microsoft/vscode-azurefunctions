/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { confirmOverwriteSettings } from "@microsoft/vscode-azext-azureappservice";
import { AppSettingsTreeItem, type IAppSettingsClient } from "@microsoft/vscode-azext-azureappsettings";
import { AzExtFsExtra, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { ConnectionKey, functionFilter, localEventHubsEmulatorConnectionRegExp, localSettingsFileName, localStorageEmulatorConnectionString } from "../../constants";
import { viewOutput } from "../../constants-nls";
import { ext } from "../../extensionVariables";
import { type ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { isResolvedFunctionApp } from "../../tree/ResolvedFunctionAppResource";
import type * as api from '../../vscode-azurefunctions.api';
import { getEOLMessage, shouldShowEolWarning } from "../createFunctionApp/stacks/getStackPicks";
import { type StacksWizardContext } from "../createFunctionApp/stacks/StacksWizardContext";
import { decryptLocalSettings } from "./localSettings/decryptLocalSettings";
import { encryptLocalSettings } from "./localSettings/encryptLocalSettings";
import { getLocalSettingsFile } from "./localSettings/getLocalSettingsFile";

export async function uploadAppSettings(context: StacksWizardContext, node?: AppSettingsTreeItem, _nodes?: [], workspaceFolder?: vscode.WorkspaceFolder, exclude?: (RegExp | string)[]): Promise<void> {
    context.telemetry.eventVersion = 2;
    if (!node) {
        node = await ext.rgApi.pickAppResource<AppSettingsTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(AppSettingsTreeItem.contextValue)
        });
    }

    const parent = node.parent;
    const client: IAppSettingsClient = await node.clientProvider.createClient(context);
    if (isResolvedFunctionApp(parent)) {
        const eolWarning = await shouldShowEolWarning(context, parent.site.rawSite, client.isLinux, parent.isFlex, client);
        if (eolWarning && (eolWarning.isEOL || eolWarning.willBeEOL)) {
            const message: string = getEOLMessage(eolWarning);
            const continueOn: vscode.MessageItem = { title: localize('continueOn', 'Continue') };
            await context.ui.showWarningMessage(message, { modal: true }, continueOn);
        }
    }
    await node.runWithTemporaryDescription(context, localize('uploading', 'Uploading...'), async () => {
        await uploadAppSettingsInternal(context, client, workspaceFolder, exclude);
    });
}

export async function uploadAppSettingsInternal(context: IActionContext, client: api.IAppSettingsClient, workspaceFolder?: vscode.WorkspaceFolder, exclude?: (RegExp | string)[]): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select the local settings file to upload.');
    const localSettingsPath: string = await getLocalSettingsFile(context, message, workspaceFolder);
    const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);

    let localSettings: ILocalSettingsJson = <ILocalSettingsJson>await AzExtFsExtra.readJSON(localSettingsPath);
    if (localSettings.IsEncrypted) {
        await decryptLocalSettings(context, localSettingsUri);
        try {
            localSettings = await AzExtFsExtra.readJSON<ILocalSettingsJson>(localSettingsPath);
        } finally {
            await encryptLocalSettings(context, localSettingsUri);
        }
    }

    if (localSettings.Values) {
        const remoteSettings: StringDictionary = await client.listApplicationSettings();
        if (!remoteSettings.properties) {
            remoteSettings.properties = {};
        }

        const excludedAppSettings: string[] = [];

        // Local emulator connections should not be uploaded to the cloud - exclude them (https://github.com/microsoft/vscode-azurefunctions/issues/3298)
        if (localSettings.Values[ConnectionKey.Storage] === localStorageEmulatorConnectionString) {
            delete localSettings.Values?.[ConnectionKey.Storage];
            excludedAppSettings.push(ConnectionKey.Storage);
        }
        if (localEventHubsEmulatorConnectionRegExp.test(localSettings.Values[ConnectionKey.EventHubs])) {
            delete localSettings.Values?.[ConnectionKey.EventHubs];
            excludedAppSettings.push(ConnectionKey.EventHubs);
        }

        if (exclude) {
            Object.keys(localSettings.Values).forEach((settingName) => {
                if (exclude.some((exclusion) => typeof exclusion === 'string' ? settingName.toLowerCase() === exclusion.toLowerCase() : settingName.match(new RegExp(exclusion, 'i')))) {
                    delete localSettings.Values?.[settingName];
                    excludedAppSettings.push(settingName);
                }
            });
        }

        const uploadSettings: string = localize('uploadingSettings', 'Uploading settings...');
        ext.outputChannel.appendLog(uploadSettings, { resourceName: client.fullName });
        await confirmOverwriteSettings(context, localSettings.Values, remoteSettings.properties, client.fullName);

        if (excludedAppSettings.length) {
            ext.outputChannel.appendLog(localize('excludedSettings', 'Excluded the following settings:'));
            excludedAppSettings.forEach((key) => ext.outputChannel.appendLine(`- ${key}`));
        }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: localize('uploadingSettingsTo', 'Uploading settings to "{0}"...', client.fullName) }, async () => {
            await client.updateApplicationSettings(remoteSettings);
        });

        ext.outputChannel.appendLog(localize('uploadedSettings', 'Successfully uploaded settings.'), { resourceName: client.fullName });
        // don't wait
        void vscode.window.showInformationMessage(localize('uploadedSettingsTo', 'Successfully uploaded settings to "{0}".', client.fullName), viewOutput).then(result => {
            if (result === viewOutput) {
                ext.outputChannel.show();
            }
        });
    } else {
        throw new Error(localize('noSettings', 'No settings found in "{0}".', localSettingsFileName));
    }
}
