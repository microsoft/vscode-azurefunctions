/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

// eslint-disable-next-line no-restricted-imports
import { extractFuncHostErrorContext } from '../src/funcCoreTools/funcHostErrorUtils';

suite('Function host error grouping', () => {
    test('groups consecutive red entries into a single entry', () => {
        const logs = [
            '\u001b[31m[Error] First\u001b[39m\n',
            '\u001b[31m[Error] Second\u001b[39m\n',
        ];

        const extracted = extractFuncHostErrorContext(logs);
        assert.deepStrictEqual(extracted, ['[Error] First\n[Error] Second\n']);
    });

    test('does not group red entries separated by non-red output', () => {
        const logs = [
            '\u001b[31m[Error] First\u001b[39m\n',
            'normal\n',
            '\u001b[31m[Error] Second\u001b[39m\n',
        ];

        const extracted = extractFuncHostErrorContext(logs);
        assert.deepStrictEqual(extracted, ['[Error] First\n', '[Error] Second\n']);
    });
});

