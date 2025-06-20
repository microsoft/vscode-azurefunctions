/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { isSettingConnectionString } from '@microsoft/vscode-azext-azureappsettings';
import { AzExtFsExtra, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localEventHubsEmulatorConnectionRegExp, localStorageEmulatorConnectionString } from "../../constants";
import { type ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { tryGetLocalSettingsFileNoPrompt } from "../appSettings/localSettings/getLocalSettingsFile";

type ConnectionSetting = { name: string, value: string, type: 'ConnectionString' | 'ManagedIdentity' | 'Emulator' };

export async function getWarningsForConnectionSettings(context: IActionContext,
    options: {
        appSettings: StringDictionary,
        node: SlotTreeItem,
        projectPath: string | undefined
    }): Promise<string | undefined> {
    try {
        const localSettingsPath = await tryGetLocalSettingsFileNoPrompt(context, options.projectPath);
        let localSettings: ILocalSettingsJson;
        try {
            localSettings = localSettingsPath ? await AzExtFsExtra.readJSON(localSettingsPath) : { Values: {} };
        } catch (err) {
            // if we can't read the local settings, just assume it's empty
            localSettings = { Values: {} };
        }

        const localConnectionSettings = await getConnectionSettings(localSettings.Values ?? {});
        const remoteConnectionSettings = await getConnectionSettings(options.appSettings?.properties ?? {});
        await options.node.initSite(context);

        if (localConnectionSettings.some(setting => setting.type === 'ManagedIdentity')) {
            if (!options.node.site.rawSite.identity ||
                options.node.site.rawSite.identity.type === 'None') {
                // if they have nothing in remote, warn them to connect a managed identity
                return localize('configureManagedIdentityWarning',
                    'Your app is not connected to a managed identity. To ensure access, please configure a managed identity. Without it, your application may encounter authorization issues.');
            }
        }

        if (localConnectionSettings.some(setting => setting.type === 'ConnectionString') || remoteConnectionSettings.some(setting => setting.type === 'ConnectionString')) {
            // if they have connection strings, warn them about insecure connections but don't try to convert them
            return localize('connectionStringWarning',
                'Your app may be using connection strings for authentication. This may expose sensitive credentials and lead to security vulnerabilities. Consider using managed identities to enhance security.')
        }
    } catch (err) {
        // if we can't read local or remote settings, don't warn them about anything
    }

    return;
}

function checkForConnectionSettings(property: { [propertyName: string]: string }): ConnectionSetting | undefined {
    if (isSettingConnectionString(property.key, property.value)) {
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
        const property = { propertyName: key, value: value as string };
        const connectionSetting = checkForManagedIdentitySettings(property) ?? checkForConnectionSettings(property) ?? checkForEmulatorSettings(property);
        if (connectionSetting) {
            settings.push(connectionSetting);
        }
    }

    return settings;
}
