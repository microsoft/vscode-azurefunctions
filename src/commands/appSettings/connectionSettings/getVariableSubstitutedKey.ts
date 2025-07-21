/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns the local settings key if the input uses variable substitution (e.g. "%TASKHUB_NAME%").
 * If the input is not in variable substitution format, returns undefined.
 *
 * Example: "%TASKHUB_NAME%" → "TASKHUB_NAME"
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
