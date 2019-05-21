/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from "azure-arm-website";
import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import { AppSettingsTreeItem, SiteClient } from "vscode-azureappservice";
import { IActionContext } from "vscode-azureextensionui";
import { localSettingsFileName } from "../../constants";
import { ext } from "../../extensionVariables";
import { getLocalSettingsJson, ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { confirmOverwriteSettings } from "./confirmOverwriteSettings";
import { decryptLocalSettings } from "./decryptLocalSettings";
import { encryptLocalSettings } from "./encryptLocalSettings";
import { getLocalSettingsFile } from "./getLocalSettingsFile";

export async function downloadAppSettings(context: IActionContext, node?: AppSettingsTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<AppSettingsTreeItem>(AppSettingsTreeItem.contextValue, context);
    }

    const client: SiteClient = node.root.client;

    const message: string = localize('selectLocalSettings', 'Select the destination file for your downloaded settings.');
    const localSettingsPath: string = await getLocalSettingsFile(message);
    const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);

    await node.runWithTemporaryDescription(localize('downloading', 'Downloading...'), async () => {
        ext.outputChannel.show(true);
        ext.outputChannel.appendLine(localize('downloadStart', 'Downloading settings from "{0}"...', client.fullName));
        let localSettings: ILocalSettingsJson = await getLocalSettingsJson(localSettingsPath, true /* allowOverwrite */);

        const isEncrypted: boolean | undefined = localSettings.IsEncrypted;
        if (localSettings.IsEncrypted) {
            await decryptLocalSettings(context, localSettingsUri);
            localSettings = <ILocalSettingsJson>await fse.readJson(localSettingsPath);
        }

        try {
            if (!localSettings.Values) {
                localSettings.Values = {};
            }

            const remoteSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();
            if (remoteSettings.properties) {
                await confirmOverwriteSettings(remoteSettings.properties, localSettings.Values, localSettingsFileName);
            }

            await fse.ensureFile(localSettingsPath);
            await fse.writeJson(localSettingsPath, localSettings, { spaces: 2 });
        } finally {
            if (isEncrypted) {
                await encryptLocalSettings(context, localSettingsUri);
            }
        }
    });

    const downloadedMessage: string = localize('downloadedSettings', `Successfully downloaded settings from "{0}".`, client.fullName);
    const openFile: string = localize('openFile', 'Open File');
    // don't wait
    vscode.window.showInformationMessage(downloadedMessage, openFile).then(async (result: string | undefined) => {
        if (result === openFile) {
            const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(localSettingsUri);
            await vscode.window.showTextDocument(doc);
        }
    });
}
