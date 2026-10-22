/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isDebugConfigEqual } from '../src/vsCodeConfig/launch';

suite('Launch configuration', () => {
    test('treats legacy Python and debugpy configurations as equivalent', () => {
        const legacy = { name: 'Attach to Python Functions', type: 'python', request: 'attach' };
        const current = { name: 'Attach to Python Functions', type: 'debugpy', request: 'attach' };

        assert.ok(isDebugConfigEqual(legacy, current));
        assert.ok(isDebugConfigEqual(current, legacy));
    });
});
