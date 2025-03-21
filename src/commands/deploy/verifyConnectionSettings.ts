/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { isSettingConvertible } from '@microsoft/vscode-azext-azureappsettings';
import { AzExtFsExtra, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localEventHubsEmulatorConnectionRegExp, localStorageEmulatorConnectionString } from "../../constants";
import { type ILocalSettingsJson } from "../../funcConfig/local.settings";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { getLocalSettingsFileNoPrompt } from "../appSettings/localSettings/getLocalSettingsFile";

type ConnectionSetting = { name: string, value: string, type: 'ConnectionString' | 'ManagedIdentity' | 'Emulator' };

export async function verifyConnectionSettings(context: IActionContext, appSettings: StringDictionary, node: SlotTreeItem): Promise<void> {
    const localSettingsPath = await getLocalSettingsFileNoPrompt(context, projectPath);
    const localSettings: ILocalSettingsJson = await AzExtFsExtra.readJSON(localSettingsPath);
    const localConnectionSettings = await getConnectionSettings(context, localSettings.Values);
    const remoteConnectionSettings = await getConnectionSettings(context, appSettings.properties);

    // we should check to see if the user has an emulator connection in the local settings
    if (localConnectionSettings.some(setting => setting.type === 'Emulator')) {
        if (!remoteConnectionSettings.some(setting => setting.type === 'ConnectionString' || setting.type === 'ManagedIdentity')) {
            // if they have anything in remote, ignore the emulator setting
            return;
        }
        // if they have nothing in remote, prompt them to connect to a service

    }

    if (localConnectionSettings.some(setting => setting.type === 'ManagedIdentity')) {
        if (!node.site.rawSite.identity ||
            node.site.rawSite.identity.type === 'None') {
            // if they have anything in remote, ignore the managed identity setting
            return;
        }
        // if they have nothing in remote, prompt them to connect a managed identitye
    }

    if (localConnectionSettings.some(setting => setting.type === 'ConnectionString') || remoteConnectionSettings.some(setting => setting.type === 'ConnectionString')) {
        // warn user against insecure connection strings
    }

    // if they connection strings, warn them about insecure connections but don't try to convert them
}

function checkForConnectionSettings(property: { [propertyName: string]: string }): ConnectionSetting | undefined {
    if (isSettingConvertible(property.propertyName, property.value)) {
        // if the setting is convertible, we can assume it's a connection string
        return {
            name: property.propertyName,
            value: property.value,
            type: 'ConnectionString'
        };
    }

    return undefined;
}
function checkForManagedIdentitySettings(property: { [propertyName: string]: string }): ConnectionSetting | undefined {

    if (property.propertyName.includes('__accountName') || property.propertyName.includes('__blobServiceUri') ||
        property.propertyName.includes('__queueServiceUri') || property.propertyName.includes('__tableServiceUri') ||
        property.propertyName.includes('__accountEndpoint') || property.propertyName.includes('__fullyQualifiedNamespace')) {
        return {
            name: property.propertyName,
            value: property.value,
            type: 'ManagedIdentity'
        };
    }

    return undefined;
}

function checkForEmulatorSettings(property: { [propertyName: string]: string }): ConnectionSetting | undefined {
    if (property.value.includes(localStorageEmulatorConnectionString) ||
        localEventHubsEmulatorConnectionRegExp.test(property.value)) {
        return {
            name: property.propertyName,
            value: property.value,
            type: 'Emulator'
        };
    }

    return undefined;
}

async function getConnectionSettings(properties: StringDictionary): Promise<ConnectionSetting[]> {
    const settings: ConnectionSetting[] = [];
    for (const [key, value] of Object.entries(properties)) {
        const property = { propertyName: key, value: value };
        const connectionSetting = checkForManagedIdentitySettings(property) ?? checkForConnectionSettings(property) ?? checkForEmulatorSettings(property);
        if (connectionSetting) {
            settings.push(connectionSetting);
        }
    }

    return settings;
}
