/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext, IAzureQuickPickItem, StorageAccountKind, StorageAccountPerformance, StorageAccountReplication } from 'vscode-azureextensionui';
import { localSettingsFileName } from './constants';
import { NoSubscriptionError } from './errors';
import { ext } from './extensionVariables';
import { localize } from './localize';
import { getResourceTypeLabel, ResourceType } from './templates/IFunctionSetting';
import * as azUtil from './utils/azure';
import { IResourceResult } from './utils/azure';
import * as fsUtil from './utils/fs';

export interface ILocalAppSettings {
    IsEncrypted?: boolean;
    Values?: { [key: string]: string };
    ConnectionStrings?: { [key: string]: string };
}

export const azureWebJobsStorageKey: string = 'AzureWebJobsStorage';

export async function promptForAppSetting(actionContext: IActionContext, localSettingsPath: string, resourceType: ResourceType): Promise<string> {
    const settings: ILocalAppSettings = await getLocalSettings(localSettingsPath);
    const resourceTypeLabel: string = getResourceTypeLabel(resourceType);

    if (settings.Values) {
        const existingSettings: string[] = Object.keys(settings.Values);
        if (existingSettings.length !== 0) {
            let picks: IAzureQuickPickItem<boolean>[] = [{ data: true /* createNewAppSetting */, label: localize('azFunc.newAppSetting', '$(plus) New App Setting'), description: '' }];
            picks = picks.concat(existingSettings.map((s: string) => { return { data: false /* createNewAppSetting */, label: s, description: '' }; }));
            const options: vscode.QuickPickOptions = { placeHolder: localize('azFunc.selectAppSetting', 'Select an App Setting for your \'{0}\'', resourceTypeLabel) };
            const result: IAzureQuickPickItem<boolean> = await ext.ui.showQuickPick(picks, options);
            if (!result.data /* createNewAppSetting */) {
                return result.label;
            }
        }
    }

    let resourceResult: IResourceResult | undefined;
    try {
        switch (resourceType) {
            case ResourceType.DocumentDB:
                resourceResult = await azUtil.promptForCosmosDBAccount();
                break;
            case ResourceType.Storage:
                resourceResult = await azUtil.promptForStorageAccount(
                    actionContext,
                    {
                        kind: [
                            StorageAccountKind.BlobStorage
                        ],
                        learnMoreLink: 'https://aka.ms/T5o0nf'
                    }
                );
                break;
            case ResourceType.ServiceBus:
                resourceResult = await azUtil.promptForServiceBus();
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
        appSettingKey = await ext.ui.showInputBox(keyOptions);

        const valueOptions: vscode.InputBoxOptions = {
            placeHolder: localize('azFunc.AppSettingValuePlaceholder', '\'{0}\' App Setting Value', resourceTypeLabel),
            prompt: localize('azFunc.AppSettingValuePrompt', 'Enter the connection string for your \'{0}\'', resourceTypeLabel)
        };
        connectionString = await ext.ui.showInputBox(valueOptions);
    }

    await setAppSetting(settings, localSettingsPath, appSettingKey, connectionString);
    return appSettingKey;
}

export async function validateAzureWebJobsStorage(actionContext: IActionContext, localSettingsPath: string): Promise<void> {
    const settings: ILocalAppSettings = await getLocalSettings(localSettingsPath);
    if (settings.Values && settings.Values[azureWebJobsStorageKey]) {
        return;
    }

    const message: string = localize('azFunc.AzureWebJobsStorageWarning', 'All non-HTTP triggers require AzureWebJobsStorage to be set in \'{0}\' for local debugging.', localSettingsFileName);
    const selectStorageAccount: vscode.MessageItem = { title: localize('azFunc.SelectStorageAccount', 'Select Storage Account') };
    const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, selectStorageAccount, DialogResponses.skipForNow);
    if (result === selectStorageAccount) {
        let connectionString: string;

        try {
            const resourceResult: IResourceResult = await azUtil.promptForStorageAccount(
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
            connectionString = resourceResult.connectionString;
        } catch (error) {
            if (error instanceof NoSubscriptionError) {
                const options: vscode.InputBoxOptions = {
                    placeHolder: localize('azFunc.StoragePlaceholder', '\'{0}\' Connection String', azureWebJobsStorageKey),
                    prompt: localize('azFunc.StoragePrompt', 'Enter the connection string for your \'{0}\'', azureWebJobsStorageKey)
                };
                connectionString = await ext.ui.showInputBox(options);
            } else {
                throw error;
            }
        }

        await setAppSetting(settings, localSettingsPath, azureWebJobsStorageKey, connectionString);
    }
}

async function setAppSetting(settings: ILocalAppSettings, localSettingsPath: string, key: string, value: string): Promise<void> {
    if (!settings.Values) {
        settings.Values = {};
    }

    if (settings.Values[key]) {
        const message: string = localize('azFunc.SettingAlreadyExists', 'Local app setting \'{0}\' already exists. Overwrite?', key);
        if (await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.cancel) !== DialogResponses.yes) {
            return;
        }
    }

    settings.Values[key] = value;
    await fsUtil.writeFormattedJson(localSettingsPath, settings);
}

export async function getLocalSettings(localSettingsPath: string): Promise<ILocalAppSettings> {
    if (await fse.pathExists(localSettingsPath)) {
        const data: string = (await fse.readFile(localSettingsPath)).toString();
        if (/[^\s]/.test(data)) {
            return <ILocalAppSettings>JSON.parse(data);
        }
    }

    return {
        IsEncrypted: false,
        Values: {}
    };
}
