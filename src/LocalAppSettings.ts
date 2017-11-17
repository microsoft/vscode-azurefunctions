/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { AzureAccount } from './azure-account.api';
import { DialogResponses } from './DialogResponses';
import { NoSubscriptionError } from './errors';
import { IUserInterface, PickWithData } from "./IUserInterface";
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
    private _ui: IUserInterface;
    private _azureAccount: AzureAccount;
    private readonly _azureWebJobsStorageKey: string = 'AzureWebJobsStorage';
    private readonly _fileName: string = 'local.settings.json';

    constructor(ui: IUserInterface, azureAccount: AzureAccount, functionAppPath: string) {
        this._azureAccount = azureAccount;
        this._ui = ui;
        this._localAppSettingsPath = path.join(functionAppPath, this._fileName);
    }

    public async promptForAppSetting(resourceType: ResourceType): Promise<string> {
        const settings: ILocalAppSettings = await this.getSettings();
        const resourceTypeLabel: string = getResourceTypeLabel(resourceType);

        if (settings.Values) {
            const existingSettings: string[] = Object.keys(settings.Values);
            if (existingSettings.length !== 0) {
                let picks: PickWithData<boolean>[] = [new PickWithData(true /* createNewAppSetting */, localize('azFunc.newAppSetting', '$(plus) New App Setting'))];
                picks = picks.concat(existingSettings.map((s: string) => new PickWithData(false /* createNewAppSetting */, s)));
                const placeHolder: string = localize('azFunc.selectAppSetting', 'Select an App Setting for your \'{0}\'', resourceTypeLabel);
                const result: PickWithData<boolean> = await this._ui.showQuickPick(picks, placeHolder);
                if (!result.data /* createNewAppSetting */) {
                    return result.label;
                }
            }
        }

        let resourceResult: IResourceResult | undefined;
        try {
            switch (resourceType) {
                case ResourceType.DocumentDB:
                    resourceResult = await azUtil.promptForCosmosDBAccount(this._ui, this._azureAccount);
                    break;
                case ResourceType.Storage:
                    resourceResult = await azUtil.promptForStorageAccount(this._ui, this._azureAccount);
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
            const keyPlaceHolder: string = localize('azFunc.AppSettingKeyPlaceholder', '\'{0}\' App Setting Key', resourceTypeLabel);
            const keyPrompt: string = localize('azFunc.AppSettingKeyPrompt', 'Enter a key for your \'{0}\' connection string', resourceTypeLabel);
            appSettingKey = await this._ui.showInputBox(keyPlaceHolder, keyPrompt, true /* ignoreFocusOut */, undefined /* validateInput */, `example${appSettingSuffix}`);

            const valuePlaceHolder: string = localize('azFunc.AppSettingValuePlaceholder', '\'{0}\' App Setting Value', resourceTypeLabel);
            const valuePrompt: string = localize('azFunc.AppSettingValuePrompt', 'Enter the connection string for your \'{0}\'', resourceTypeLabel);
            connectionString = await this._ui.showInputBox(valuePlaceHolder, valuePrompt, true /* ignoreFocusOut */);
        }

        await this.setAppSetting(settings, appSettingKey, connectionString);
        return appSettingKey;
    }

    public async validateAzureWebJobsStorage(): Promise<void> {
        const settings: ILocalAppSettings = await this.getSettings();
        if (settings.Values && settings.Values[this._azureWebJobsStorageKey]) {
            return;
        }

        const message: string = localize('azFunc.AzureWebJobsStorageWarning', 'All non-HTTP triggers require AzureWebJobsStorage to be set in \'{0}\' for local debugging.', this._fileName);
        const selectStorageAccount: string = localize('azFunc.SelectStorageAccount', 'Select Storage Account');
        const skipForNow: string = localize('azFunc.SkipForNow', 'Skip for now');
        const result: string | undefined = await vscode.window.showWarningMessage(message, selectStorageAccount, skipForNow);
        if (result === undefined) {
            throw new UserCancelledError();
        } else if (result === selectStorageAccount) {
            let connectionString: string;

            try {
                const resourceResult: IResourceResult = await azUtil.promptForStorageAccount(this._ui, this._azureAccount);
                connectionString = resourceResult.connectionString;
            } catch (error) {
                if (error instanceof NoSubscriptionError) {
                    const placeHolder: string = localize('azFunc.StoragePlaceholder', '\'{0}\' Connection String', this._azureWebJobsStorageKey);
                    const prompt: string = localize('azFunc.StoragePrompt', 'Enter the connection string for your \'{0}\'', this._azureWebJobsStorageKey);
                    connectionString = await this._ui.showInputBox(placeHolder, prompt, true /* ignoreFocusOut */);
                } else {
                    throw error;
                }
            }

            await this.setAppSetting(settings, this._azureWebJobsStorageKey, connectionString);
        }
    }

    private async setAppSetting(settings: ILocalAppSettings, key: string, value: string): Promise<void> {
        if (!settings.Values) {
            settings.Values = {};
        }

        if (settings.Values[key]) {
            const message: string = localize('azFunc.SettingAlreadyExists', 'Local app setting \'{0}\' already exists. Overwrite?', key);
            if (await vscode.window.showWarningMessage(message, DialogResponses.yes) !== DialogResponses.yes) {
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
