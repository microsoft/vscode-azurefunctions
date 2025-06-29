/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeAction } from "../../../constants";
import { MismatchBehavior, setLocalAppSetting } from "../../../funcConfig/local.settings";
import { type ISetConnectionSettingContext } from "./ISetConnectionSettingContext";

/**
 * Automatically sets the correct connection setting based on whether the code action is running during `Debug` or `Deploy`.
 * - If the action is `Deploy`, it sets the key/value directly on the context to be later added as an app setting.
 * - If the action is `Debug`, it updates the `local.settings.json` file for local development, overwriting any existing values.
 */
export async function setConnectionSetting(context: ISetConnectionSettingContext, key: string, value: string): Promise<void> {
    if (context.action === CodeAction.Deploy) {
        context[key] = value;
    } else {
        await setLocalAppSetting(context, context.projectPath, key, value, MismatchBehavior.Overwrite);
    }
}
