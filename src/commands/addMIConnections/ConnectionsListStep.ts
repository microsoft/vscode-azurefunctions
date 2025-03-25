/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { isSettingConvertible } from "@microsoft/vscode-azext-azureappsettings";
import { AzureWizardPromptStep, nonNullValue, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import type * as vscode from 'vscode';
import { getLocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
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
        return context.functionapp ? this.getRemoteQuickPicks(context) : this.getLocalQuickPicks(context)
    }

    private async getLocalQuickPicks(context: AddMIConnectionsContext, workspaceFolder?: vscode.WorkspaceFolder): Promise<IAzureQuickPickItem<Connection>[]> {
        const picks: IAzureQuickPickItem<Connection>[] = [];
        const message: string = localize('selectLocalSettings', 'Select the local settings to add identity settings for.');
        const localSettingsPath: string = await getLocalSettingsFile(context, message, workspaceFolder);
        context.localSettingsPath = localSettingsPath;

        const localSettings = await getLocalSettingsJson(context, localSettingsPath);
        if (localSettings.Values) {
            addPicks(localSettings.Values, picks);
        }

        return picks;
    }

    private async getRemoteQuickPicks(context: AddMIConnectionsContext): Promise<IAzureQuickPickItem<Connection>[]> {
        const picks: IAzureQuickPickItem<Connection>[] = [];

        const client = await nonNullValue(context.functionapp?.site.createClient(context));
        const appSettings: StringDictionary = await client.listApplicationSettings();
        if (appSettings.properties) {
            addPicks(appSettings.properties, picks);
        }

        return picks;
    }
}

function addPicks(settings: { [key: string]: string }, picks: IAzureQuickPickItem<Connection>[]): IAzureQuickPickItem<Connection>[] {
    for (const [key, value] of Object.entries(settings)) {
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
    return picks;
}
