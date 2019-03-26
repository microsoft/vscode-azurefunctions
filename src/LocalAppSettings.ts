/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext, parseError, StorageAccountKind, StorageAccountPerformance, StorageAccountReplication } from 'vscode-azureextensionui';
import { localSettingsFileName } from './constants';
import { ext } from './extensionVariables';
import { localize } from './localize';
import * as azUtil from './utils/azure';
import * as fsUtil from './utils/fs';

export interface ILocalAppSettings {
    IsEncrypted?: boolean;
    Values?: { [key: string]: string };
    ConnectionStrings?: { [key: string]: string };
}

export const azureWebJobsStorageKey: string = 'AzureWebJobsStorage';

export async function validateAzureWebJobsStorage(actionContext: IActionContext, localSettingsPath: string): Promise<void> {
    // func cli uses environment variable if it's defined on the machine, so no need to prompt
    if (process.env[azureWebJobsStorageKey]) {
        return;
    }

    const settings: ILocalAppSettings = await getLocalAppSettings(localSettingsPath);
    if (settings.Values && settings.Values[azureWebJobsStorageKey]) {
        return;
    }

    const message: string = localize('azFunc.AzureWebJobsStorageWarning', 'All non-HTTP triggers require AzureWebJobsStorage to be set in \'{0}\' for local debugging.', localSettingsFileName);
    const selectStorageAccount: vscode.MessageItem = { title: localize('azFunc.SelectStorageAccount', 'Select Storage Account') };
    const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, selectStorageAccount, DialogResponses.skipForNow);
    if (result === selectStorageAccount) {
        const resourceResult: azUtil.IResourceResult = await azUtil.promptForStorageAccount(
            actionContext,
            {
                kind: [
                    StorageAccountKind.BlobStorage
                ],
                performance: [
                    StorageAccountPerformance.Premium
                ],
                replication: [
                    StorageAccountReplication.ZRS
                ],
                learnMoreLink: 'https://aka.ms/Cfqnrc'
            }
        );

        // tslint:disable-next-line:strict-boolean-expressions
        settings.Values = settings.Values || {};
        settings.Values[azureWebJobsStorageKey] = resourceResult.connectionString;
        await fsUtil.writeFormattedJson(localSettingsPath, settings);
    }
}
export async function setLocalAppSetting(functionAppPath: string, key: string, value: string): Promise<void> {
    const localSettingsPath: string = path.join(functionAppPath, localSettingsFileName);
    const settings: ILocalAppSettings = await getLocalAppSettings(localSettingsPath);

    // tslint:disable-next-line:strict-boolean-expressions
    settings.Values = settings.Values || {};
    if (settings.Values[key] === value) {
        return;
    } else if (settings.Values[key]) {
        const message: string = localize('azFunc.SettingAlreadyExists', 'Local app setting \'{0}\' already exists. Overwrite?', key);
        if (await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.cancel) !== DialogResponses.yes) {
            return;
        }
    }

    settings.Values[key] = value;
    await fsUtil.writeFormattedJson(localSettingsPath, settings);
}

export async function getLocalAppSettings(localSettingsPath: string, allowOverwrite: boolean = false): Promise<ILocalAppSettings> {
    if (await fse.pathExists(localSettingsPath)) {
        const data: string = (await fse.readFile(localSettingsPath)).toString();
        if (/[^\s]/.test(data)) {
            try {
                return <ILocalAppSettings>JSON.parse(data);
            } catch (error) {
                if (allowOverwrite) {
                    const message: string = localize('failedToParseWithOverwrite', 'Failed to parse "{0}": {1}. Overwrite?', localSettingsFileName, parseError(error).message);
                    const overwriteButton: vscode.MessageItem = { title: localize('overwrite', 'Overwrite') };
                    // Overwrite is the only button and cancel automatically throws, so no need to check result
                    await ext.ui.showWarningMessage(message, { modal: true }, overwriteButton, DialogResponses.cancel);
                } else {
                    const message: string = localize('failedToParse', 'Failed to parse "{0}": {1}.', localSettingsFileName, parseError(error).message);
                    throw new Error(message);
                }
            }
        }
    }

    return {
        IsEncrypted: false,
        Values: {}
    };
}
