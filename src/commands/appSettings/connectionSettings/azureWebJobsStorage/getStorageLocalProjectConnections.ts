/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { ConnectionKey, localSettingsFileName } from "../../../../constants";
import { type ILocalSettingsJson } from "../../../../funcConfig/local.settings";

export async function getStorageLocalSettingsValue(context: IActionContext & { projectPath: string }, localSettingsKey: string = ConnectionKey.Storage): Promise<string | undefined> {
    const localSettingsFilePath = path.join(context.projectPath, localSettingsFileName);
    if (!await AzExtFsExtra.pathExists(localSettingsFilePath)) {
        return undefined;
    }

    const localSettings = await AzExtFsExtra.readJSON(localSettingsFilePath) as ILocalSettingsJson;
    return localSettings?.Values?.[localSettingsKey];
}
