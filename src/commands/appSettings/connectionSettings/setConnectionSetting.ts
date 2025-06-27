/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeAction } from "../../../constants";
import { MismatchBehavior, setLocalAppSetting } from "../../../funcConfig/local.settings";
import { type ISetConnectionSettingContext } from "./ISetConnectionSettingContext";

export async function setConnectionSetting(context: ISetConnectionSettingContext, key: string, value: string): Promise<void> {
    if (context.action === CodeAction.Deploy) {
        context[key] = value;
    } else {
        await setLocalAppSetting(context, context.projectPath, key, value, MismatchBehavior.Overwrite);
    }
}
