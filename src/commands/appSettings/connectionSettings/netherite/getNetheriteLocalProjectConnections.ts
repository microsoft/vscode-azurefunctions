/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { hostFileName, localSettingsFileName } from "../../../../constants";
import { type IDTSTaskJson, type IHostJsonV2, type INetheriteTaskJson } from "../../../../funcConfig/host";
import { type ILocalSettingsJson } from "../../../../funcConfig/local.settings";
import { tryGetVariableSubstitutedKey } from "../getVariableSubstitutedKey";

type NetheriteConnectionKeys = { eventHubsNamespaceConnectionKey?: string, eventHubConnectionKey?: string };

/**
 * The `host.json` allows you to designate which app settings you want to use for key Netherite resources.
 * Use to retrieve these values in order to know which app/local settings to set and read.
 */
export async function getNetheriteSettingsKeys(context: IActionContext & { projectPath: string }): Promise<NetheriteConnectionKeys | undefined> {
    const hostJsonPath: string = path.join(context.projectPath, hostFileName);
    if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
        return undefined;
    }

    const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
    return {
        // Default: "EventHubsConnection"
        eventHubsNamespaceConnectionKey: (hostJson.extensions?.durableTask as INetheriteTaskJson)?.storageProvider?.EventHubsConnectionName,
        // Default: "MyTaskHub"
        eventHubConnectionKey: tryGetVariableSubstitutedKey((hostJson.extensions?.durableTask as IDTSTaskJson)?.hubName),
    };
}

type NetheriteConnectionValues = { eventHubsNamespaceConnectionValue?: string, eventHubConnectionValue?: string };

/**
 * Use to get the local settings values associated with each Netherite key provided.
 *
 * Note: If the event hub key is omitted, it is assumed that there was not a variable substituted key, but instead a value that could be used directly.
 */
export async function getNetheriteLocalSettingsValues(context: IActionContext & { projectPath: string }, localSettingsKeys: NetheriteConnectionKeys): Promise<NetheriteConnectionValues | undefined> {
    const localSettingsFilePath = path.join(context.projectPath, localSettingsFileName);
    if (!await AzExtFsExtra.pathExists(localSettingsFilePath)) {
        return undefined;
    }

    const hostJsonPath: string = path.join(context.projectPath, hostFileName);
    if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
        return undefined;
    }

    const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
    const localSettings = await AzExtFsExtra.readJSON(localSettingsFilePath) as ILocalSettingsJson;
    const { eventHubsNamespaceConnectionKey: ehnKey, eventHubConnectionKey: ehKey } = localSettingsKeys;

    return {
        eventHubsNamespaceConnectionValue: ehnKey ? localSettings?.Values?.[ehnKey] : undefined,
        eventHubConnectionValue: ehKey ? localSettings?.Values?.[ehKey] : (hostJson.extensions?.durableTask as INetheriteTaskJson)?.hubName,
    };
}
