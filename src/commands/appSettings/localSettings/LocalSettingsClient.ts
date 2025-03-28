/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { type AppSettingsClientProvider, type IAppSettingsClient } from "@microsoft/vscode-azext-azureappsettings";
import { callWithTelemetryAndErrorHandling, type IActionContext } from "@microsoft/vscode-azext-utils";
import type * as vscode from 'vscode';
import { getLocalSettingsJson, type ILocalSettingsJson } from "../../../funcConfig/local.settings";
import { tryGetLocalSettingsFileNoPrompt } from "./getLocalSettingsFile";

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
            const localSettingsPath: string | undefined = await tryGetLocalSettingsFileNoPrompt(context, this._workspaceFolder);
            if (localSettingsPath === undefined) {
                return { properties: {} };
            } else {
                const localSettings: ILocalSettingsJson = await getLocalSettingsJson(context, localSettingsPath, false);
                return { properties: localSettings.Values };
            }
        });
        return result ?? { properties: {} };
    }

    public async updateApplicationSettings(): Promise<StringDictionary> {
        throw new Error('Method not implemented.');
    }
}
