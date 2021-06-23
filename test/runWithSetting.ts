/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ext, getGlobalSetting, updateGlobalSetting } from "../extension.bundle";

type SettingValue = {} | string | boolean | undefined;

export async function runWithFuncSetting(key: string, value: SettingValue, callback: () => Promise<void>): Promise<void> {
    await runWithSettingInternal(key, value, ext.prefix, callback);
}

export async function runWithSetting(key: string, value: SettingValue, callback: () => Promise<void>): Promise<void> {
    await runWithSettingInternal(key, value, '', callback);
}

async function runWithSettingInternal(key: string, value: SettingValue, prefix: string, callback: () => Promise<void>): Promise<void> {
    const oldValue: SettingValue = getGlobalSetting(key, prefix);
    try {
        await updateGlobalSetting(key, value, prefix);
        await callback();
    } finally {
        await updateGlobalSetting(key, oldValue, prefix);
    }
}
