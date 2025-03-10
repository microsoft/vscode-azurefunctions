/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { convertibleSetting } from "@microsoft/vscode-azext-azureappsettings";
import { AzExtFsExtra, AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { type ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { decryptLocalSettings } from "../appSettings/localSettings/decryptLocalSettings";
import { encryptLocalSettings } from "../appSettings/localSettings/encryptLocalSettings";
import { getLocalSettingsFile } from "../appSettings/localSettings/getLocalSettingsFile";
import { type IConvertConnectionsContext } from "./IConvertConnectionsContext";

export interface Connection {
    name: string;
    value: string;
}

export class SelectConnectionsStep extends AzureWizardPromptStep<IConvertConnectionsContext> {
    public async prompt(context: IConvertConnectionsContext): Promise<void> {
        let picks: IAzureQuickPickItem<Connection>[];
        if (context.local) {
            picks = await this.getLocalQuickPics(context);
        } else {
            picks = await this.getRemoteQuickPics(context);
        }

        if (picks.length === 0) {
            const noItemFoundMessage: string = localize('noConnectionsFound', 'No connections found in local settings');
            (await context.ui.showQuickPick(picks, {
                placeHolder: localize('selectConnections', 'Select the connections you want to convert'),
                suppressPersistence: true,
                noPicksMessage: noItemFoundMessage
            }));
        } else {
            context.connections = (await context.ui.showQuickPick(picks, {
                placeHolder: localize('selectConnections', 'Select the connections you want to convert'),
                suppressPersistence: true,
                canPickMany: true,
            })).map(item => item.data);
        }
    }

    public shouldPrompt(context: IConvertConnectionsContext): boolean {
        return !context.connections || context.connections.length === 0;
    }

    private async getLocalQuickPics(context: IConvertConnectionsContext, workspaceFolder?: vscode.WorkspaceFolder): Promise<IAzureQuickPickItem<Connection>[]> {
        const picks: IAzureQuickPickItem<Connection>[] = [];
        const message: string = localize('selectLocalSettings', 'Select the local settings to convert.');
        const localSettingsPath: string = await getLocalSettingsFile(context, message, workspaceFolder);
        const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);
        context.localSettingsPath = localSettingsPath;

        if (await AzExtFsExtra.pathExists(localSettingsPath)) {
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
                for (const [key, value] of Object.entries(localSettings.Values)) {
                    if (!convertibleSetting(key, value)) {
                        continue;
                    }

                    picks.push({
                        label: key,
                        data: {
                            name: key,
                            value: value
                        }
                    });
                }
            }
        }

        return picks;
    }

    private async getRemoteQuickPics(context: IConvertConnectionsContext): Promise<IAzureQuickPickItem<Connection>[]> {
        const picks: IAzureQuickPickItem<Connection>[] = [];

        if (context.functionapp) {
            const client = await context.functionapp?.site.createClient(context);
            const appSettings: StringDictionary = await client.listApplicationSettings();
            if (appSettings.properties) {
                for (const [key, value] of Object.entries(appSettings.properties)) {
                    if (!convertibleSetting(key, value)) {
                        continue;
                    }

                    picks.push({
                        label: key,
                        data: {
                            name: key,
                            value: value
                        }
                    });
                }
            }
        }

        return picks;
    }
}
