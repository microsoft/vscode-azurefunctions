/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

/**
 * Same as assert.throws except for async functions
 */
export async function assertThrowsAsync<T>(block: () => Promise<T>, error: RegExp | Function, message?: string): Promise<void> {
    let blockSync = (): void => { /* ignore */ };
    try {
        await block();
    } catch (e) {
        blockSync = (): void => { throw e; };
    } finally {
        assert.throws(blockSync, error, message);
    }
}
