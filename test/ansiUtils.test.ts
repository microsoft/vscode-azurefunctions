/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { stripAnsiControlCharacters } from '../extension.bundle';

suite('stripAnsiControlCharacters', () => {
    test('removes CSI color sequences', () => {
        const input = '\u001b[31mred\u001b[39m';
        assert.strictEqual(stripAnsiControlCharacters(input), 'red');
    });

    test('removes OSC sequences', () => {
        const input = '\u001b]0;my title\u0007hello';
        assert.strictEqual(stripAnsiControlCharacters(input), 'hello');
    });

    test('preserves newlines and tabs while removing other control chars', () => {
        const input = `a\n\t\u0000b\r\n\u001b[2Kc`;
        assert.strictEqual(stripAnsiControlCharacters(input), 'a\n\tb\r\nc');
    });
});
