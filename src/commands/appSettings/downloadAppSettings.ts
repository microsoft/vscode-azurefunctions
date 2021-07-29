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
import { getLocalSettingsJson, ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import * as api from '../../vscode-azurefunctions.api';
import { decryptLocalSettings } from "./decryptLocalSettings";
import { encryptLocalSettings } from "./encryptLocalSettings";
import { filterDownloadAppSettings } from "./filterDownloadAppSettings";
import { getLocalSettingsFile } from "./getLocalSettingsFile";

export async function downloadAppSettings(context: IActionContext, node?: AppSettingsTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<AppSettingsTreeItem>(AppSettingsTreeItem.contextValue, context);
    }

    const client: IAppSettingsClient = node.client;
    await node.runWithTemporaryDescription(context, localize('downloading', 'Downloading...'), async () => {
        await downloadAppSettingsInternal(context, client);
    });
}

export async function downloadAppSettingsInternal(context: IActionContext, client: api.IAppSettingsClient, localSettingsPath?: string): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select the destination file for your downloaded settings.');
    let showMessage: boolean = false;
    if (!localSettingsPath) {
        localSettingsPath = await getLocalSettingsFile(context, message);
        showMessage = true;
    }
    const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);

    let localSettings: ILocalSettingsJson = await getLocalSettingsJson(context, localSettingsPath, true /* allowOverwrite */);

    const isEncrypted: boolean | undefined = localSettings.IsEncrypted;
    if (localSettings.IsEncrypted) {
        await decryptLocalSettings(context, localSettingsUri);
        localSettings = <ILocalSettingsJson>await fse.readJson(localSettingsPath);
    }

    try {
        if (!localSettings.Values) {
            localSettings.Values = {};
        }
        if (!localSettings.SettingsToIgnoreOnDeployment) {
            localSettings.SettingsToIgnoreOnDeployment = [];
        }
        const remoteSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();

        ext.outputChannel.appendLog(localize('downloadingSettings', 'Downloading settings...'), { resourceName: client.fullName });
        if (remoteSettings.properties) {
            await filterDownloadAppSettings(context, remoteSettings.properties, localSettings.Values, localSettings.SettingsToIgnoreOnDeployment, localSettingsFileName);
        }

        await fse.ensureFile(localSettingsPath);
        await fse.writeJson(localSettingsPath, localSettings, { spaces: 2 });

    } finally {
        if (isEncrypted) {
            await encryptLocalSettings(context, localSettingsUri);
        }
    }

    if (showMessage) {
        ext.outputChannel.appendLog(localize('downloadedSettings', 'Successfully downloaded settings.'), { resourceName: client.fullName });
        const openFile: string = localize('openFile', 'Open File');
        // don't wait
        void vscode.window.showInformationMessage(localize('downloadedSettingsFrom', 'Successfully downloaded settings from "{0}".', client.fullName), openFile, viewOutput).then(async result => {
            if (result === openFile) {
                const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(localSettingsUri);
                await vscode.window.showTextDocument(doc);
            } else if (result === viewOutput) {
                ext.outputChannel.show();
            }
        });
    }
}
