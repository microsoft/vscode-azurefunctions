/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * If a variable substituted key is used, grabs the connection key name it is referencing.
 *
 * Note: The `host.json` often specifies which connection key name to use by referencing a variable-substituted name.
 * Instead of hardcoding the connection key, `host.json` uses a placeholder surrounded with parenthesis (e.g. %TASKHUB_NAME%)
 * that is replaced at runtime with the actual value from `local.settings.json` or the app’s configuration settings.
 *
 * Example: `%TASKHUB_NAME%` => `TASKHUB_NAME`
 */
export function tryGetVariableSubstitutedKey(key?: string): string | undefined {
    if (!key) {
        return undefined;
    }

    if (key.startsWith('%') && key.endsWith('%')) {
        return key.replace(/^%(.*)%$/, '$1');
    } else {
        return undefined;
    }
}
