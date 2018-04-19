/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringDictionary } from "azure-arm-website/lib/models";
import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import { AppSettingsTreeItem, SiteClient } from "vscode-azureappservice";
import { IAzureNode } from "vscode-azureextensionui";
import { localSettingsFileName } from "../../constants";
import { ext } from "../../extensionVariables";
import { getLocalSettings } from "../../LocalAppSettings";
import { localize } from "../../localize";
import { FunctionAppTreeItem } from "../../tree/FunctionAppTreeItem";
import * as workspaceUtil from '../../utils/workspace';
import { confirmOverwriteSettings } from "./confirmOverwriteSettings";
import { decryptLocalSettings } from "./decryptLocalSettings";
import { encryptLocalSettings } from "./encryptLocalSettings";
import { ILocalAppSettings } from "./ILocalAppSettings";

export async function downloadAppSettings(node?: IAzureNode): Promise<void> {
    if (!node) {
        node = await ext.tree.showNodePicker(AppSettingsTreeItem.contextValue);
    }

    // tslint:disable-next-line:no-non-null-assertion
    const client: SiteClient = (<FunctionAppTreeItem>node.parent!.treeItem).client;

    const message: string = localize('selectLocalSettings', 'Select the destination file for your downloaded settings.');
    const localSettingsPath: string = await workspaceUtil.selectWorkspaceFile(ext.ui, message, () => localSettingsFileName);
    const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);

    await node.runWithTemporaryDescription(localize('downloading', 'Downloading...'), async () => {
        ext.outputChannel.show(true);
        ext.outputChannel.appendLine(localize('downloadStart', 'Downloading settings from "{0}"...', client.fullName));
        let localSettings: ILocalAppSettings = await getLocalSettings(localSettingsPath);

        const isEncrypted: boolean | undefined = localSettings.IsEncrypted;
        if (localSettings.IsEncrypted) {
            await decryptLocalSettings(localSettingsUri);
            localSettings = <ILocalAppSettings>await fse.readJson(localSettingsPath);
        }

        try {
            if (!localSettings.Values) {
                localSettings.Values = {};
            }

            const remoteSettings: StringDictionary = await client.listApplicationSettings();
            if (remoteSettings.properties) {
                await confirmOverwriteSettings(remoteSettings.properties, localSettings.Values, localSettingsFileName);
            }

            await fse.ensureFile(localSettingsPath);
            await fse.writeJson(localSettingsPath, localSettings, { spaces: 2 });
        } finally {
            if (isEncrypted) {
                await encryptLocalSettings(localSettingsUri);
            }
        }
    });
}
