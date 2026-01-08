/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

// eslint-disable-next-line no-restricted-imports
import { extractFuncHostErrorContext, extractFuncHostErrorContextForErrorMessage, isFuncHostErrorLog } from '../src/funcCoreTools/funcHostErrorUtils';

suite('Function host error context extraction', () => {
    test('detects red ANSI as error', () => {
        assert.strictEqual(isFuncHostErrorLog('\u001b[31m[Error] Boom\u001b[39m'), true);
        assert.strictEqual(isFuncHostErrorLog('normal log line'), false);
    });

    test('extractFuncHostErrorContext includes surrounding window', () => {
        const logs = [
            'line 0\n',
            'line 1\n',
            '\u001b[31m[Error] Something failed\u001b[39m\n',
            'line 3\n',
            'line 4\n',
        ];

        const extracted = extractFuncHostErrorContext(logs, { before: 1, after: 1, max: 250 });
        assert.deepStrictEqual(extracted, [
            'line 1\n',
            '\u001b[31m[Error] Something failed\u001b[39m\n',
            'line 3\n',
        ]);
    });

    test('extractFuncHostErrorContextForErrorMessage only includes the selected error line', () => {
        const logs = [
            'line 0\n',
            '\u001b[31m[Error] First\u001b[39m\n',
            'line 2\n',
            '\u001b[31m[Error] Second\u001b[39m\n',
            'line 4\n',
        ];

        const extracted = extractFuncHostErrorContextForErrorMessage(logs, '[Error] Second', { before: 1, after: 1, max: 250 });
        assert.deepStrictEqual(extracted, [
            '\u001b[31m[Error] Second\u001b[39m\n',
        ]);
    });
});
