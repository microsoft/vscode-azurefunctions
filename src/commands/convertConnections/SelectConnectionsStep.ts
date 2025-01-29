/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

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
    role?: string;
}

export class SelectConnectionsStep extends AzureWizardPromptStep<IConvertConnectionsContext> {
    public async prompt(context: IConvertConnectionsContext): Promise<void> {
        const noItemFoundMessage: string = localize('noRolesFound', 'No connections found in local settings');
        context.connections = (await context.ui.showQuickPick(this.getQuickPics(context), {
            placeHolder: localize('selectConnections', 'Select the connections you want to convert'),
            suppressPersistence: true,
            canPickMany: true,
            noPicksMessage: noItemFoundMessage //way to make this error out instead of just a message?
        })).map(item => item.data);
    }

    public shouldPrompt(context: IConvertConnectionsContext): boolean {
        return !context.connections || context.connections.length === 0;
    }

    private async getQuickPics(context: IConvertConnectionsContext, workspaceFolder?: vscode.WorkspaceFolder): Promise<IAzureQuickPickItem<Connection>[]> {
        const picks: IAzureQuickPickItem<Connection>[] = [];
        const message: string = localize('selectLocalSettings', 'Select the local settings file to convert.');
        const localSettingsPath: string = await getLocalSettingsFile(context, message, workspaceFolder);
        const localSettingsUri: vscode.Uri = vscode.Uri.file(localSettingsPath);

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
                // ToDo: any other keys we should ignore?
                if (key.includes('FUNCTIONS_WORKER_RUNTIME')) {
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
