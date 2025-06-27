/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { hostFileName, localSettingsFileName } from "../../../../constants";
import { type IDTSTaskJson, type IHostJsonV2 } from "../../../../funcConfig/host";
import { type ILocalSettingsJson } from "../../../../funcConfig/local.settings";

type DTSConnectionKeys = { dtsConnectionKey?: string, dtsHubConnectionKey?: string };

/**
 * The `host.json` allows you to designate which app settings you want to use for key DTS resources.
 * Use to retrieve these values in order to know which app/local settings to set and read.
 */
export async function getDTSHostConnectionKeys(context: IActionContext & { projectPath: string }): Promise<DTSConnectionKeys | undefined> {
    const hostJsonPath: string = path.join(context.projectPath, hostFileName);
    if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
        return undefined;
    }

    const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
    return {
        // Default: "DURABLE_TASK_SCHEDULER_CONNECTION_STRING"
        dtsConnectionKey: (hostJson.extensions?.durableTask as IDTSTaskJson)?.storageProvider?.connectionStringName,
        // Default: "%TASKHUB_NAME%"
        // Strip the surrounding % to grab as "TASKHUB_NAME"
        dtsHubConnectionKey: ((hostJson.extensions?.durableTask as IDTSTaskJson)?.hubName)?.replace(/^%(.*)%$/, '$1'),
    };
}

type DTSConnectionValues = { dtsConnectionValue?: string, dtsHubConnectionValue?: string };

export async function getDTSLocalSettingsValues(context: IActionContext & { projectPath: string }, hostKeys: DTSConnectionKeys): Promise<DTSConnectionValues | undefined> {
    const localSettingsFilePath = path.join(context.projectPath, localSettingsFileName);
    if (!await AzExtFsExtra.pathExists(localSettingsFilePath)) {
        return undefined;
    }

    const localSettings = await AzExtFsExtra.readJSON(localSettingsFilePath) as ILocalSettingsJson;
    const { dtsConnectionKey, dtsHubConnectionKey } = hostKeys;

    return {
        dtsConnectionValue: dtsConnectionKey ? localSettings?.Values?.[dtsConnectionKey] : undefined,
        dtsHubConnectionValue: dtsHubConnectionKey ? localSettings?.Values?.[dtsHubConnectionKey] : undefined,
    };
}
