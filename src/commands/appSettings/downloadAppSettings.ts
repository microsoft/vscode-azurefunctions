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
import { confirmOverwriteSettings } from "./confirmOverwriteSettings";
import { decryptLocalSettings } from "./decryptLocalSettings";
import { encryptLocalSettings } from "./encryptLocalSettings";
import { getLocalSettingsFile } from "./getLocalSettingsFile";

// Valen: Imported in registerCommands
export async function downloadAppSettings(context: IActionContext, node?: AppSettingsTreeItem): Promise<void> {
    // Valen: node is an optional parameter so this checks if it is null to set a value to it.
    if (!node) {
        node = await ext.tree.showTreeItemPicker<AppSettingsTreeItem>(AppSettingsTreeItem.contextValue, context);
    }

    const client: IAppSettingsClient = node.client;
    //  Valen: runWithTemporaryDescription displays a 'Loading...' icon and temporarily changes context's
    // description while `downloadAppSettingsInternal` is being run
    await node.runWithTemporaryDescription(context, localize('downloading', 'Downloading...'), async () => {
        await downloadAppSettingsInternal(context, client); // Valen: definition below
    });
}

export async function downloadAppSettingsInternal(context: IActionContext, client: api.IAppSettingsClient): Promise<void> {
    // Valen: defining variables to start, could be helpful to look at file src\funcConfig\local.settings.js
    const message: string = localize('selectLocalSettings', 'Select the destination file for your downloaded settings.');
    const localSettingsPath: string = await getLocalSettingsFile(context, message);
    const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);

    let localSettings: ILocalSettingsJson = await getLocalSettingsJson(context, localSettingsPath, true /* allowOverwrite */);

    const isEncrypted: boolean | undefined = localSettings.IsEncrypted;
    if (localSettings.IsEncrypted) { // Valen: If local settings are encrypted, decrypt
        await decryptLocalSettings(context, localSettingsUri);
        localSettings = <ILocalSettingsJson>await fse.readJson(localSettingsPath);
    }
    /*
    Valen: local settings object type is:
    export interface ILocalSettingsJson {
        IsEncrypted?: boolean;
        Values?: { [key: string]: string };
        Host?: { [key: string]: string };
        ConnectionStrings?: { [key: string]: string };
    }
    Valen: so the object does account for connection strings
    */
    try {
        if (!localSettings.Values) { // Valen: If values is null, set it to {}
            localSettings.Values = {};
        }

        const remoteSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();

        ext.outputChannel.appendLog(localize('downloadingSettings', 'Downloading settings...'), { resourceName: client.fullName });
        if (remoteSettings.properties) {
            await confirmOverwriteSettings(context, remoteSettings.properties, localSettings.Values, localSettingsFileName);
            // await filterDownloadAppSettings(context, remoteSettings.properties, localSettings.Values, localSettingsFileName);
        }

        await fse.ensureFile(localSettingsPath);
        await fse.writeJson(localSettingsPath, localSettings, { spaces: 2 });

    } finally {
        if (isEncrypted) { // Valen: re encrypt settings if they were originally encrypted
            await encryptLocalSettings(context, localSettingsUri);
        }
    }

    ext.outputChannel.appendLog(localize('downloadedSettings', 'Successfully downloaded settings.'), { resourceName: client.fullName });
    const openFile: string = localize('openFile', 'Open File');
    // don't wait
    void vscode.window.showInformationMessage(localize('downloadedSettingsFrom', 'Successfully downloaded settings from "{0}".', client.fullName), openFile, viewOutput).then(async result => {
        if (result === openFile) { // Valen: asks user if they want to open the file and it will open it in vs code
            const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(localSettingsUri);
            await vscode.window.showTextDocument(doc);
        } else if (result === viewOutput) {
            ext.outputChannel.show(); // Valen: shows output in VSCode terminal
        }
    });
}
