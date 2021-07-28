/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from "@azure/arm-appservice";
import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import { AppSettingsTreeItem, IAppSettingsClient } from "vscode-azureappservice";
import { IActionContext } from "vscode-azureextensionui";
import { localSettingsFileName, viewOutput } from "../../constants";
import { ext } from "../../extensionVariables";
import { ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import * as api from '../../vscode-azurefunctions.api';
import { decryptLocalSettings } from "./decryptLocalSettings";
import { encryptLocalSettings } from "./encryptLocalSettings";
import { filterUploadAppSettings } from "./filterUploadAppSettings";
import { getLocalSettingsFile } from "./getLocalSettingsFile";

export async function uploadAppSettings(context: IActionContext, node?: AppSettingsTreeItem, workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<AppSettingsTreeItem>(AppSettingsTreeItem.contextValue, context);
    }

    const client: IAppSettingsClient = node.client;
    await node.runWithTemporaryDescription(context, localize('uploading', 'Uploading...'), async () => {
        await uploadAppSettingsInternal(context, client, workspaceFolder);
    });
}

export async function uploadAppSettingsInternal(context: IActionContext, client: api.IAppSettingsClient, workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select the local settings file to upload.');
    const localSettingsPath: string = await getLocalSettingsFile(context, message, workspaceFolder);
    const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);

    let localSettings: ILocalSettingsJson = <ILocalSettingsJson>await fse.readJson(localSettingsPath);
    if (localSettings.IsEncrypted) {
        await decryptLocalSettings(context, localSettingsUri);
        try {
            localSettings = <ILocalSettingsJson>await fse.readJson(localSettingsPath);
        } finally {
            await encryptLocalSettings(context, localSettingsUri);
        }
    }

    if (localSettings.Values) {
        const remoteSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();
        if (!remoteSettings.properties) {
            remoteSettings.properties = {};
        }
        if (!localSettings.SettingsToIgnoreOnDeployment) {
            localSettings.SettingsToIgnoreOnDeployment = [];
        }

        const uploadSettings: string = localize('uploadingSettings', 'Uploading settings...');
        ext.outputChannel.appendLog(uploadSettings, { resourceName: client.fullName });
        await filterUploadAppSettings(context, localSettings.Values, remoteSettings.properties, localSettings.SettingsToIgnoreOnDeployment, client.fullName);

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
