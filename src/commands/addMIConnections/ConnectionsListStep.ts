/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { isSettingConvertible } from "@microsoft/vscode-azext-azureappsettings";
import { AzExtFsExtra, AzureWizardPromptStep, nonNullValue, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { type ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { decryptLocalSettings } from "../appSettings/localSettings/decryptLocalSettings";
import { encryptLocalSettings } from "../appSettings/localSettings/encryptLocalSettings";
import { getLocalSettingsFile } from "../appSettings/localSettings/getLocalSettingsFile";
import { type AddMIConnectionsContext } from "./AddMIConnectionsContext";

export interface Connection {
    name: string;
    value: string;
}

export class ConnectionsListStep extends AzureWizardPromptStep<AddMIConnectionsContext> {
    public async prompt(context: AddMIConnectionsContext): Promise<void> {
        const picks = await this.getPicks(context);

        if (picks.length === 0) {
            const noItemFoundMessage: string = localize('noConnectionsFound', 'No connections found in local settings');
            (await context.ui.showQuickPick(picks, {
                placeHolder: localize('selectConnections', 'Select the connections you want to add managed identity support for'),
                suppressPersistence: true,
                noPicksMessage: noItemFoundMessage
            }));
        } else {
            context.connections = (await context.ui.showQuickPick(picks, {
                placeHolder: localize('selectConnections', 'Select the connections you want to add managed identity support for'),
                suppressPersistence: true,
                canPickMany: true,
            })).map(item => item.data);
        }
    }

    public shouldPrompt(context: AddMIConnectionsContext): boolean {
        return !context.connections || context.connections.length === 0;
    }

    private async getPicks(context: AddMIConnectionsContext): Promise<IAzureQuickPickItem<Connection>[]> {
        if (context.functionapp) {
            return this.getRemoteQuickPicks(context);
        } else {
            return this.getLocalQuickPicks(context);
        }
    }

    private async getLocalQuickPicks(context: AddMIConnectionsContext, workspaceFolder?: vscode.WorkspaceFolder): Promise<IAzureQuickPickItem<Connection>[]> {
        const picks: IAzureQuickPickItem<Connection>[] = [];
        const message: string = localize('selectLocalSettings', 'Select the local settings to add identity settings for.');
        const localSettingsPath: string = await getLocalSettingsFile(context, message, workspaceFolder);
        context.localSettingsPath = localSettingsPath;

        if (await AzExtFsExtra.pathExists(localSettingsPath)) {
            const localSettings = await getLocalSettingsJson(context, localSettingsPath);
            if (localSettings.Values) {
                for (const [key, value] of Object.entries(localSettings.Values)) {
                    if (!isSettingConvertible(key, value)) {
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

    private async getRemoteQuickPicks(context: AddMIConnectionsContext): Promise<IAzureQuickPickItem<Connection>[]> {
        const picks: IAzureQuickPickItem<Connection>[] = [];

        const client = await nonNullValue(context.functionapp?.site.createClient(context));
        const appSettings: StringDictionary = await client.listApplicationSettings();
        if (appSettings.properties) {
            for (const [key, value] of Object.entries(appSettings.properties)) {
                if (!isSettingConvertible(key, value)) {
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

        return picks;
    }
}

export async function getLocalSettingsJson(context: AddMIConnectionsContext, localSettingsPath: string): Promise<ILocalSettingsJson> {
    let localSettings: ILocalSettingsJson = <ILocalSettingsJson>await AzExtFsExtra.readJSON(localSettingsPath);
    const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);
    if (localSettings.IsEncrypted) {
        await decryptLocalSettings(context, localSettingsUri);
        try {
            localSettings = await AzExtFsExtra.readJSON<ILocalSettingsJson>(localSettingsPath);
        } finally {
            await encryptLocalSettings(context, localSettingsUri);
        }
    }

    return localSettings;
}
