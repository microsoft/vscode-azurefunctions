/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { runWithDotnetSupportDate } from './runWithDotnetSupportDate';

suite('runWithDotnetSupportDate', () => {
    test('pins the support date and restores the clock after success', async () => {
        const originalNow = Date.now;

        await runWithDotnetSupportDate(async () => {
            assert.strictEqual(Date.now(), Date.parse('2026-01-15T00:00:00Z'));
        });

        assert.strictEqual(Date.now, originalNow);
    });

    test('restores the clock and propagates failures', async () => {
        const originalNow = Date.now;
        const error = new Error('Expected scaffolding failure');

        await assert.rejects(runWithDotnetSupportDate(async () => {
            assert.strictEqual(Date.now(), Date.parse('2026-01-15T00:00:00Z'));
            throw error;
        }), error);

        assert.strictEqual(Date.now, originalNow);
    });
});
