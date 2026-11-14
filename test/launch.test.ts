/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isDebugConfigEqual } from '../src/vsCodeConfig/launch';

suite('Launch configuration', () => {
    test('treats legacy Python and debugpy configurations as equivalent', () => {
        for (const legacyType of ['python', 'Python']) {
            for (const currentType of ['debugpy', 'DEBUGPY']) {
                const legacy = { name: 'Attach to Python Functions', type: legacyType, request: 'attach' };
                const current = { name: 'Attach to Python Functions', type: currentType, request: 'attach' };

                assert.ok(isDebugConfigEqual(legacy, current));
                assert.ok(isDebugConfigEqual(current, legacy));
            }
        }
    });

    test('keeps differently named configurations and different requests separate', () => {
        const current = { name: 'Attach to Python Functions', type: 'debugpy', request: 'attach' };

        assert.ok(!isDebugConfigEqual(current, { ...current, name: 'Custom Python debugger', type: 'python' }));
        assert.ok(!isDebugConfigEqual(current, { ...current, request: 'launch', type: 'python' }));
    });

    test('does not migrate unrelated debugger types', () => {
        const current = { name: 'Attach to Python Functions', type: 'debugpy', request: 'attach' };

        for (const type of ['node', 'python-custom', 'custom-debugpy']) {
            assert.ok(!isDebugConfigEqual(current, { ...current, type }));
        }
    });

    test('preserves Node debugger equivalence', () => {
        const current = { name: 'Attach to Node Functions', type: 'pwa-node', request: 'attach' };

        for (const type of ['node', 'node2', 'pwa-node']) {
            assert.ok(isDebugConfigEqual(current, { ...current, type }));
        }
    });
});
