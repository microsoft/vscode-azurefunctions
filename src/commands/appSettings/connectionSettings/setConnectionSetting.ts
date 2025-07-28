/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MismatchBehavior, setLocalAppSetting } from "../../../funcConfig/local.settings";
import { type ISetConnectionSettingContext } from "./ISetConnectionSettingContext";

export async function setLocalSetting(context: ISetConnectionSettingContext, key: string, value: string): Promise<void> {
    await setLocalAppSetting(context, context.projectPath, key, value, MismatchBehavior.Overwrite);
}
