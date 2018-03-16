/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureTreeDataProvider, DialogResponses, IAzureQuickPickItem, IAzureUserInput } from 'vscode-azureextensionui';
import { NoSubscriptionError } from './errors';
import { localize } from './localize';
import { getResourceTypeLabel, ResourceType } from './templates/ConfigSetting';
import * as azUtil from './utils/azure';
import { IResourceResult } from './utils/azure';
import * as fsUtil from './utils/fs';

interface ILocalAppSettings {
    Values?: { [key: string]: string };
}

export class LocalAppSettings {
    private _localAppSettingsPath: string;
    private _ui: IAzureUserInput;
    private _tree: AzureTreeDataProvider;
    private readonly _azureWebJobsStorageKey: string = 'AzureWebJobsStorage';
    private readonly _fileName: string = 'local.settings.json';

    constructor(ui: IAzureUserInput, tree: AzureTreeDataProvider, functionAppPath: string) {
        this._tree = tree;
        this._ui = ui;
        this._localAppSettingsPath = path.join(functionAppPath, this._fileName);
    }

    public async promptForAppSetting(resourceType: ResourceType): Promise<string> {
        const settings: ILocalAppSettings = await this.getSettings();
        const resourceTypeLabel: string = getResourceTypeLabel(resourceType);

        if (settings.Values) {
            const existingSettings: string[] = Object.keys(settings.Values);
            if (existingSettings.length !== 0) {
                let picks: IAzureQuickPickItem<boolean>[] = [{ data: true /* createNewAppSetting */, label: localize('azFunc.newAppSetting', '$(plus) New App Setting'), description: '' }];
                picks = picks.concat(existingSettings.map((s: string) => { return { data: false /* createNewAppSetting */, label: s, description: '' }; }));
                const options: vscode.QuickPickOptions = { placeHolder: localize('azFunc.selectAppSetting', 'Select an App Setting for your \'{0}\'', resourceTypeLabel) };
                const result: IAzureQuickPickItem<boolean> = await this._ui.showQuickPick(picks, options);
                if (!result.data /* createNewAppSetting */) {
                    return result.label;
                }
            }
        }

        let resourceResult: IResourceResult | undefined;
        try {
            switch (resourceType) {
                case ResourceType.DocumentDB:
                    resourceResult = await azUtil.promptForCosmosDBAccount(this._ui, this._tree);
                    break;
                case ResourceType.Storage:
                    resourceResult = await azUtil.promptForStorageAccount(this._ui, this._tree);
                    break;
                default:
            }
        } catch (error) {
            if (error instanceof NoSubscriptionError) {
                // swallow error and prompt for connection string instead
            } else {
                throw error;
            }
        }

        const appSettingSuffix: string = `_${resourceType.toUpperCase()}`;
        let appSettingKey: string;
        let connectionString: string;
        if (resourceResult) {
            appSettingKey = `${resourceResult.name}${appSettingSuffix}`;
            connectionString = resourceResult.connectionString;
        } else {
            const keyOptions: vscode.InputBoxOptions = {
                placeHolder: localize('azFunc.AppSettingKeyPlaceholder', '\'{0}\' App Setting Key', resourceTypeLabel),
                prompt: localize('azFunc.AppSettingKeyPrompt', 'Enter a key for your \'{0}\' connection string', resourceTypeLabel),
                value: `example${appSettingSuffix}`
            };
            appSettingKey = await this._ui.showInputBox(keyOptions);

            const valueOptions: vscode.InputBoxOptions = {
                placeHolder: localize('azFunc.AppSettingValuePlaceholder', '\'{0}\' App Setting Value', resourceTypeLabel),
                prompt: localize('azFunc.AppSettingValuePrompt', 'Enter the connection string for your \'{0}\'', resourceTypeLabel)
            };
            connectionString = await this._ui.showInputBox(valueOptions);
        }

        await this.setAppSetting(this._ui, settings, appSettingKey, connectionString);
        return appSettingKey;
    }

    public async validateAzureWebJobsStorage(ui: IAzureUserInput): Promise<void> {
        const settings: ILocalAppSettings = await this.getSettings();
        if (settings.Values && settings.Values[this._azureWebJobsStorageKey]) {
            return;
        }

        const message: string = localize('azFunc.AzureWebJobsStorageWarning', 'All non-HTTP triggers require AzureWebJobsStorage to be set in \'{0}\' for local debugging.', this._fileName);
        const selectStorageAccount: vscode.MessageItem = { title: localize('azFunc.SelectStorageAccount', 'Select Storage Account') };
        const result: vscode.MessageItem = await ui.showWarningMessage(message, selectStorageAccount, DialogResponses.skipForNow);
        if (result === selectStorageAccount) {
            let connectionString: string;

            try {
                const resourceResult: IResourceResult = await azUtil.promptForStorageAccount(this._ui, this._tree);
                connectionString = resourceResult.connectionString;
            } catch (error) {
                if (error instanceof NoSubscriptionError) {
                    const options: vscode.InputBoxOptions = {
                        placeHolder: localize('azFunc.StoragePlaceholder', '\'{0}\' Connection String', this._azureWebJobsStorageKey),
                        prompt: localize('azFunc.StoragePrompt', 'Enter the connection string for your \'{0}\'', this._azureWebJobsStorageKey)
                    };
                    connectionString = await this._ui.showInputBox(options);
                } else {
                    throw error;
                }
            }

            await this.setAppSetting(ui, settings, this._azureWebJobsStorageKey, connectionString);
        }
    }

    private async setAppSetting(ui: IAzureUserInput, settings: ILocalAppSettings, key: string, value: string): Promise<void> {
        if (!settings.Values) {
            settings.Values = {};
        }

        if (settings.Values[key]) {
            const message: string = localize('azFunc.SettingAlreadyExists', 'Local app setting \'{0}\' already exists. Overwrite?', key);
            if (await ui.showWarningMessage(message, DialogResponses.yes, DialogResponses.cancel) !== DialogResponses.yes) {
                return;
            }
        }

        settings.Values[key] = value;
        await fsUtil.writeFormattedJson(this._localAppSettingsPath, settings);
    }

    private async getSettings(): Promise<ILocalAppSettings> {
        return <ILocalAppSettings>(await fse.readJSON(this._localAppSettingsPath));
    }
}
