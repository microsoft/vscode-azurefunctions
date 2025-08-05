/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { hostFileName, localSettingsFileName } from "../../../../constants";
import { type IHostJsonV2, type ISqlTaskJson } from "../../../../funcConfig/host";
import { type ILocalSettingsJson } from "../../../../funcConfig/local.settings";

/**
 * The `host.json` allows you to designate which app settings you want to use for key SQL resources.
 * Use to retrieve these values in order to know which app/local settings to set and read.
 */
export async function getSqlDbSettingsKey(context: IActionContext & { projectPath: string }): Promise<string | undefined> {
    const hostJsonPath: string = path.join(context.projectPath, hostFileName);
    if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
        return undefined;
    }

    const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
    // Default: "SQLDB_Connection"
    return (hostJson.extensions?.durableTask as ISqlTaskJson)?.storageProvider?.connectionStringName;
}

export async function getSqlDbLocalSettingsValue(context: IActionContext & { projectPath: string }, localSettingsKey?: string): Promise<string | undefined> {
    const localSettingsFilePath = path.join(context.projectPath, localSettingsFileName);
    if (!await AzExtFsExtra.pathExists(localSettingsFilePath)) {
        return undefined;
    }

    const localSettings = await AzExtFsExtra.readJSON(localSettingsFilePath) as ILocalSettingsJson;
    return localSettingsKey ? localSettings?.Values?.[localSettingsKey] : undefined;
}
