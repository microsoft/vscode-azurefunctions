/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cpUtils } from '../../../utils/cpUtils';

let _cachedAzdAvailable: boolean | undefined;

/**
 * Checks if the Azure Developer CLI (azd) is installed and available on the system PATH.
 * Caches the result so subsequent calls don't re-invoke the CLI.
 */
export async function isAzdInstalled(): Promise<boolean> {
    if (_cachedAzdAvailable !== undefined) {
        return _cachedAzdAvailable;
    }

    try {
        await cpUtils.executeCommand(undefined, undefined, 'azd', ['version']);
        _cachedAzdAvailable = true;
    } catch {
        _cachedAzdAvailable = false;
    }

    return _cachedAzdAvailable;
}

/**
 * Reset the cached azd availability (useful for testing).
 */
export function resetAzdCache(): void {
    _cachedAzdAvailable = undefined;
}
