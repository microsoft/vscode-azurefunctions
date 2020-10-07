/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, parseError } from 'vscode-azureextensionui';
import { localSettingsFileName } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import * as fsUtil from '../utils/fs';
import { parseJson } from '../utils/parseJson';

export interface ILocalSettingsJson {
    IsEncrypted?: boolean;
    Values?: { [key: string]: string };
    ConnectionStrings?: { [key: string]: string };
}

export const azureWebJobsStorageKey: string = 'AzureWebJobsStorage';

export async function getAzureWebJobsStorage(projectPath: string): Promise<string | undefined> {
    // func cli uses environment variable if it's defined on the machine, so no need to prompt
    if (process.env[azureWebJobsStorageKey]) {
        return process.env[azureWebJobsStorageKey];
    }

    const settings: ILocalSettingsJson = await getLocalSettingsJson(path.join(projectPath, localSettingsFileName));
    return settings.Values && settings.Values[azureWebJobsStorageKey];
}

export enum MismatchBehavior {
    /**
     * Asks the user if they want to overwrite
     */
    Prompt,

    /**
     * Overwrites without prompting
     */
    Overwrite,

    /**
     * Returns without changing anything
     */
    DontChange
}

export async function setLocalAppSetting(functionAppPath: string, key: string, value: string, behavior: MismatchBehavior = MismatchBehavior.Prompt): Promise<void> {
    const localSettingsPath: string = path.join(functionAppPath, localSettingsFileName);
    const settings: ILocalSettingsJson = await getLocalSettingsJson(localSettingsPath);

    // tslint:disable-next-line:strict-boolean-expressions
    settings.Values = settings.Values || {};
    if (settings.Values[key] === value) {
        return;
    } else if (settings.Values[key]) {
        if (behavior === MismatchBehavior.Prompt) {
            const message: string = localize('SettingAlreadyExists', 'Local app setting \'{0}\' already exists. Overwrite?', key);
            if (await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.cancel) !== DialogResponses.yes) {
                return;
            }
        } else if (behavior === MismatchBehavior.DontChange) {
            return;
        }
    }

    settings.Values[key] = value;
    await fsUtil.writeFormattedJson(localSettingsPath, settings);
}

export async function getLocalSettingsJson(localSettingsPath: string, allowOverwrite: boolean = false): Promise<ILocalSettingsJson> {
    if (await fse.pathExists(localSettingsPath)) {
        const data: string = (await fse.readFile(localSettingsPath)).toString();
        if (/[^\s]/.test(data)) {
            try {
                return parseJson(data);
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

    return {};
}
