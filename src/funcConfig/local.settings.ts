/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, DialogResponses, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { decryptLocalSettings } from '../commands/appSettings/localSettings/decryptLocalSettings';
import { encryptLocalSettings } from '../commands/appSettings/localSettings/encryptLocalSettings';
import { azuriteAccountKey, gitignoreFileName, localSettingsFileName, localStorageEmulatorConnectionString, type ConnectionKey } from '../constants';
import { localize } from '../localize';
import { parseJson } from '../utils/parseJson';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

export interface ILocalSettingsJson {
    IsEncrypted?: boolean;
    Values?: { [key: string]: string };
    Host?: { [key: string]: string };
    ConnectionStrings?: { [key: string]: string };
}

/** Preflights plaintext settings without writing so callers can validate before other project changes. */
export async function getLocalSettingsJsonWithDefaults(
    localSettingsPath: string,
    defaults: Readonly<Record<string, string>>,
): Promise<ILocalSettingsJson> {
    const settings: unknown = await AzExtFsExtra.pathExists(localSettingsPath)
        ? parseJson((await AzExtFsExtra.readFile(localSettingsPath)).toString())
        : {};
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error(localize('invalidLocalSettings', 'The local.settings.json file must contain a JSON object.'));
    }
    if ('IsEncrypted' in settings && settings.IsEncrypted === true) {
        throw new Error(localize('encryptedLocalSettingsUpdate', 'Decrypt local.settings.json before adding local app settings.'));
    }
    if ('IsEncrypted' in settings && settings.IsEncrypted !== false) {
        throw new Error(localize('invalidLocalSettingsEncryption', 'The IsEncrypted property in local.settings.json must be a boolean.'));
    }
    const values = 'Values' in settings ? settings.Values : {};
    if (!isLocalSettingsValues(values)) {
        throw new Error(localize('invalidLocalSettingsValues', 'The Values property in local.settings.json must be an object containing string values.'));
    }
    return {
        ...settings,
        IsEncrypted: false,
        Values: {
            ...defaults,
            ...values,
        },
    };
}

function isLocalSettingsValues(value: unknown): value is Record<string, string> {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
        Object.values(value).every(setting => typeof setting === 'string');
}

export async function ensureLocalSettingsIgnored(projectPath: string): Promise<void> {
    for (const fileName of [gitignoreFileName, '.funcignore']) {
        const ignorePath = path.join(projectPath, fileName);
        const contents = await AzExtFsExtra.pathExists(ignorePath)
            ? (await AzExtFsExtra.readFile(ignorePath)).toString()
            : '';
        const lines = contents.split(/\r?\n/).map(line => line.trim());
        const ruleIndex = Math.max(
            lines.lastIndexOf(localSettingsFileName),
            lines.lastIndexOf(`/${localSettingsFileName}`),
        );
        if (ruleIndex < 0 || lines.slice(ruleIndex + 1).some(line => line.startsWith('!'))) {
            const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
            const separator = contents && !contents.endsWith('\n') ? lineEnding : '';
            await AzExtFsExtra.writeFile(ignorePath, `${contents}${separator}${localSettingsFileName}${lineEnding}`);
        }
    }
}

export async function getLocalSettingsConnectionString(context: IActionContext, connectionKey: ConnectionKey, projectPath: string): Promise<[string | undefined, boolean]> {
    // func cli uses environment variable if it's defined on the machine, so no need to prompt
    if (process.env[connectionKey]) {
        return [process.env[connectionKey], isConnectionStringEmulator(process.env[connectionKey])];
    }

    const settings: ILocalSettingsJson = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
    let connectionString = settings.Values && settings.Values[connectionKey];
    if (connectionString === localStorageEmulatorConnectionString) {
        // check for azurite settings and build the connection string if it's an emulator
        connectionString = getLocalSettingsEmulatorConnectionString();
    }
    const isEmulator = isConnectionStringEmulator(connectionString);
    return [connectionString, isEmulator];
}

function getLocalSettingsEmulatorConnectionString(): string {
    const blobHost = getWorkspaceSetting('blobHost', undefined, 'azurite') || '127.0.0.1';
    const blobPort = getWorkspaceSetting('blobPort', undefined, 'azurite') || '10000';
    const queueHost = getWorkspaceSetting('queueHost', undefined, 'azurite') || '127.0.0.1';
    const queuePort = getWorkspaceSetting('queuePort', undefined, 'azurite') || '10001';
    const tableHost = getWorkspaceSetting('tableHost', undefined, 'azurite') || '127.0.0.1';
    const tablePort = getWorkspaceSetting('tablePort', undefined, 'azurite') || '10002';

    const protocol = getTransferProtocol();
    return `DefaultEndpointsProtocol=${protocol};AccountName=devstoreaccount1;AccountKey=${azuriteAccountKey}/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=${protocol}://${blobHost}:${blobPort}/devstoreaccount1;QueueEndpoint=${protocol}://${queueHost}:${queuePort}/devstoreaccount1;TableEndpoint=${protocol}://${tableHost}:${tablePort}/devstoreaccount1;`;
}

function isConnectionStringEmulator(connectionString: string | undefined): boolean {
    const blobHost: string = getWorkspaceSetting('blobHost', undefined, 'azurite') || '127.0.0.1';
    const queueHost: string = getWorkspaceSetting('queueHost', undefined, 'azurite') || '127.0.0.1';
    const tableHost: string = getWorkspaceSetting('tableHost', undefined, 'azurite') || '127.0.0.1';

    return !!connectionString &&
        (connectionString.includes(blobHost) ||
            connectionString.includes(queueHost) ||
            connectionString.includes(tableHost)
        );
}

function getTransferProtocol(): string {
    return getWorkspaceSetting('cert', undefined, 'azurite') && getWorkspaceSetting('key', undefined, 'azurite') ? 'https' : 'http';
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

export async function setLocalAppSetting(context: IActionContext, functionAppPath: string, key: string, value: string, behavior: MismatchBehavior = MismatchBehavior.Prompt): Promise<void> {
    const localSettingsPath: string = path.join(functionAppPath, localSettingsFileName);
    const settings: ILocalSettingsJson = await getLocalSettingsJson(context, localSettingsPath);

    settings.Values = settings.Values || {};
    if (settings.Values[key] === value) {
        return;
    } else if (settings.Values[key]) {
        if (behavior === MismatchBehavior.Prompt) {
            const message: string = localize('SettingAlreadyExists', 'Local app setting \'{0}\' already exists. Overwrite?', key);
            if (await context.ui.showWarningMessage(message, { modal: true, stepName: 'overwriteLocalSetting' }, DialogResponses.yes) !== DialogResponses.yes) {
                return;
            }
        } else if (behavior === MismatchBehavior.DontChange) {
            return;
        }
    }

    settings.Values[key] = value;
    await AzExtFsExtra.writeJSON(localSettingsPath, settings);
}

export async function getLocalSettingsJson(context: IActionContext, localSettingsPath: string, allowOverwrite: boolean = false): Promise<ILocalSettingsJson> {
    if (await AzExtFsExtra.pathExists(localSettingsPath)) {
        const data: string = (await AzExtFsExtra.readFile(localSettingsPath)).toString();
        if (/[^\s]/.test(data)) {
            try {
                return parseJson(data);
            } catch (error) {
                if (allowOverwrite) {
                    const message: string = localize('failedToParseWithOverwrite', 'Failed to parse "{0}": {1}. Overwrite?', localSettingsFileName, parseError(error).message);
                    const overwriteButton: vscode.MessageItem = { title: localize('overwrite', 'Overwrite') };
                    // Overwrite is the only button and cancel automatically throws, so no need to check result
                    await context.ui.showWarningMessage(message, { modal: true, stepName: 'overwriteLocalSettings' }, overwriteButton);
                } else {
                    const message: string = localize('failedToParse', 'Failed to parse "{0}": {1}.', localSettingsFileName, parseError(error).message);
                    throw new Error(message, { cause: error });
                }
            }
        }
    }

    return {
        IsEncrypted: false // Include this by default otherwise the func cli assumes settings are encrypted and fails to run
    };
}

export async function getLocalSettingsJsonwithEncryption(context: IActionContext, localSettingsPath: string): Promise<ILocalSettingsJson> {
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
