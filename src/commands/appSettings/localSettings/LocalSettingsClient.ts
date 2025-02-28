/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { type AppSettingsClientProvider, type IAppSettingsClient } from "@microsoft/vscode-azext-azureappsettings";
import { AzExtFsExtra, callWithTelemetryAndErrorHandling, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { type ILocalSettingsJson } from "../../../funcConfig/local.settings";
import { decryptLocalSettings } from "./decryptLocalSettings";
import { encryptLocalSettings } from "./encryptLocalSettings";
import { getLocalSettingsFileNoPrompt } from "./getLocalSettingsFile";

export class LocalSettingsClientProvider implements AppSettingsClientProvider {
    private _workspaceFolder: vscode.WorkspaceFolder;
    constructor(workspaceFolder: vscode.WorkspaceFolder) {
        this._workspaceFolder = workspaceFolder;
    }

    public async createClient(): Promise<IAppSettingsClient> {
        return new LocalSettingsClient(this._workspaceFolder);
    }
}

export class LocalSettingsClient implements IAppSettingsClient {
    public fullName: string;
    public isLinux: boolean;
    private _workspaceFolder: vscode.WorkspaceFolder

    constructor(workspaceFolder: vscode.WorkspaceFolder) {
        this.isLinux = false;
        this.fullName = 'local';
        this._workspaceFolder = workspaceFolder;
    }

    public async listApplicationSettings(): Promise<StringDictionary> {
        const result = await callWithTelemetryAndErrorHandling<StringDictionary | undefined>('listApplicationSettings', async (context: IActionContext) => {
            const localSettingsPath: string | undefined = await getLocalSettingsFileNoPrompt(context, this._workspaceFolder);
            if (localSettingsPath === undefined) {
                return { properties: {} };
            } else {
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
                return { properties: localSettings.Values };
            }
        });
        return result ?? { properties: {} };
    }

    public async updateApplicationSettings(): Promise<StringDictionary> {
        throw new Error('Method not implemented.');
    }
}
