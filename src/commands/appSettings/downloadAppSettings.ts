/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringDictionary } from "@azure/arm-appservice";
import { AppSettingsTreeItem, confirmOverwriteSettings, IAppSettingsClient } from "@microsoft/vscode-azext-azureappservice";
import { AzExtFsExtra, IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { functionFilter, localSettingsFileName } from "../../constants";
import { ext } from "../../extensionVariables";
import { getLocalSettingsJson, ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize, viewOutput } from "../../localize";
import * as api from '../../vscode-azurefunctions.api';
import { decryptLocalSettings } from "./decryptLocalSettings";
import { encryptLocalSettings } from "./encryptLocalSettings";
import { getLocalSettingsFile } from "./getLocalSettingsFile";

export async function downloadAppSettings(context: IActionContext, node?: AppSettingsTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<AppSettingsTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(AppSettingsTreeItem.contextValue)
        });
    }

    const client: IAppSettingsClient = await node.clientProvider.createClient(context);
    await node.runWithTemporaryDescription(context, localize('downloading', 'Downloading...'), async () => {
        await downloadAppSettingsInternal(context, client);
    });
}

export async function downloadAppSettingsInternal(context: IActionContext, client: api.IAppSettingsClient): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select the destination file for your downloaded settings.');
    const localSettingsPath: string = await getLocalSettingsFile(context, message);
    const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);

    let localSettings: ILocalSettingsJson = await getLocalSettingsJson(context, localSettingsPath, true /* allowOverwrite */);

    const isEncrypted: boolean | undefined = localSettings.IsEncrypted;
    if (localSettings.IsEncrypted) {
        await decryptLocalSettings(context, localSettingsUri);
        localSettings = await AzExtFsExtra.readJSON<ILocalSettingsJson>(localSettingsPath);
    }

    try {
        if (!localSettings.Values) {
            localSettings.Values = {};
        }

        const remoteSettings: StringDictionary = await client.listApplicationSettings();

        ext.outputChannel.appendLog(localize('downloadingSettings', 'Downloading settings...'), { resourceName: client.fullName });
        if (remoteSettings.properties) {
            await confirmOverwriteSettings(context, remoteSettings.properties, localSettings.Values, localSettingsFileName);
        }

        await AzExtFsExtra.ensureFile(localSettingsPath);
        await AzExtFsExtra.writeJSON(localSettingsPath, localSettings);

    } finally {
        if (isEncrypted) {
            await encryptLocalSettings(context, localSettingsUri);
        }
    }

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
