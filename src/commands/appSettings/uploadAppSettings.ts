/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringDictionary } from "azure-arm-website/lib/models";
import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import { AppSettingsTreeItem, SiteClient } from "vscode-azureappservice";
import { localSettingsFileName } from "../../constants";
import { ext } from "../../extensionVariables";
import { ILocalAppSettings } from "../../LocalAppSettings";
import { localize } from "../../localize";
import * as workspaceUtil from '../../utils/workspace';
import { confirmOverwriteSettings } from "./confirmOverwriteSettings";
import { decryptLocalSettings } from "./decryptLocalSettings";
import { encryptLocalSettings } from "./encryptLocalSettings";

export async function uploadAppSettings(node?: AppSettingsTreeItem): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select the local settings file to upload.');
    const localSettingsPath: string = await workspaceUtil.selectWorkspaceFile(ext.ui, message, () => localSettingsFileName);
    const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);

    if (!node) {
        node = <AppSettingsTreeItem>await ext.tree.showTreeItemPicker(AppSettingsTreeItem.contextValue);
    }

    const client: SiteClient = node.root.client;

    await node.runWithTemporaryDescription(localize('uploading', 'Uploading...'), async () => {
        ext.outputChannel.show(true);
        ext.outputChannel.appendLine(localize('uploadStart', 'Uploading settings to "{0}"...', client.fullName));
        let localSettings: ILocalAppSettings = <ILocalAppSettings>await fse.readJson(localSettingsPath);
        if (localSettings.IsEncrypted) {
            await decryptLocalSettings(localSettingsUri);
            try {
                localSettings = <ILocalAppSettings>await fse.readJson(localSettingsPath);
            } finally {
                await encryptLocalSettings(localSettingsUri);
            }
        }

        if (localSettings.Values) {
            const remoteSettings: StringDictionary = await client.listApplicationSettings();
            if (!remoteSettings.properties) {
                remoteSettings.properties = {};
            }

            await confirmOverwriteSettings(localSettings.Values, remoteSettings.properties, client.fullName);

            await client.updateApplicationSettings(remoteSettings);
        } else {
            throw new Error(localize('noSettings', 'No settings found in "{0}".', localSettingsFileName));
        }
    });
}
