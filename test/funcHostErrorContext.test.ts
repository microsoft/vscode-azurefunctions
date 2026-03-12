/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

// eslint-disable-next-line no-restricted-imports
import { addErrorLinesFromChunk, isFuncHostErrorLog } from '../extension.bundle';

suite('isFuncHostErrorLog', () => {
    test('detects basic red (31m)', () => {
        assert.strictEqual(isFuncHostErrorLog('\u001b[31m[Error] Boom\u001b[39m'), true);
    });

    test('detects basic bright red (91m)', () => {
        assert.strictEqual(isFuncHostErrorLog('\u001b[91mBright red error\u001b[0m'), true);
    });

    test('detects red with leading params (1;31m)', () => {
        assert.strictEqual(isFuncHostErrorLog('\u001b[1;31mBold red\u001b[0m'), true);
    });

    test('detects red with trailing params (31;1m)', () => {
        assert.strictEqual(isFuncHostErrorLog('\u001b[31;1mRed bold\u001b[0m'), true);
    });

    test('detects 256-color red (38;5;1m)', () => {
        assert.strictEqual(isFuncHostErrorLog('\u001b[38;5;1mRed 256\u001b[m'), true);
    });

    test('detects 256-color bright red (38;5;9m)', () => {
        assert.strictEqual(isFuncHostErrorLog('\u001b[38;5;9mBright red 256\u001b[m'), true);
    });

    test('returns false for non-red colors', () => {
        assert.strictEqual(isFuncHostErrorLog('\u001b[32mGreen text\u001b[0m'), false);
        assert.strictEqual(isFuncHostErrorLog('\u001b[38;5;3mYellow 256\u001b[m'), false);
        assert.strictEqual(isFuncHostErrorLog('\u001b[38;5;6mCyan 256\u001b[m'), false);
    });

    test('returns false for plain text', () => {
        assert.strictEqual(isFuncHostErrorLog('normal log line'), false);
    });
});

suite('addErrorLinesFromChunk', () => {
    test('extracts error entry from chunk with timestamp', () => {
        const errorLogs: string[] = [];
        const chunk = '[2026-03-11T20:00:00.000Z] \u001b[38;5;9mSomething failed\u001b[m';
        const added = addErrorLinesFromChunk(errorLogs, chunk);
        assert.strictEqual(added, true);
        assert.strictEqual(errorLogs.length, 1);
        assert.ok(errorLogs[0].includes('Something failed'));
    });

    test('skips non-error entries in a mixed chunk', () => {
        const errorLogs: string[] = [];
        const chunk = [
            '[2026-03-11T20:00:00.000Z] \u001b[38;5;6mInfo message\u001b[m',
            '[2026-03-11T20:00:01.000Z] \u001b[38;5;9mError message\u001b[m',
            '[2026-03-11T20:00:02.000Z] \u001b[38;5;6mAnother info\u001b[m',
        ].join('');
        const added = addErrorLinesFromChunk(errorLogs, chunk);
        assert.strictEqual(added, true);
        assert.strictEqual(errorLogs.length, 1);
        assert.ok(errorLogs[0].includes('Error message'));
        assert.ok(!errorLogs[0].includes('Info message'));
    });

    test('deduplicates identical error entries', () => {
        const errorLogs: string[] = [];
        const chunk = '[2026-03-11T20:00:00.000Z] \u001b[38;5;9mDuplicate error\u001b[m';
        addErrorLinesFromChunk(errorLogs, chunk);
        addErrorLinesFromChunk(errorLogs, chunk);
        assert.strictEqual(errorLogs.length, 1);
    });

    test('deduplicates entries that differ only in whitespace (terminal reflow)', () => {
        const errorLogs: string[] = [];
        const chunk1 = '[2026-03-11T20:00:00.000Z] \u001b[38;5;9mException while executing function: Foo\u001b[m';
        const chunk2 = '[2026-03-11T20:00:00.000Z] \u001b[38;5;9mException while\nexecuting function: Foo\u001b[m';
        addErrorLinesFromChunk(errorLogs, chunk1);
        addErrorLinesFromChunk(errorLogs, chunk2);
        assert.strictEqual(errorLogs.length, 1);
    });

    test('returns false when no new errors are added', () => {
        const errorLogs: string[] = [];
        const infoChunk = '[2026-03-11T20:00:00.000Z] \u001b[38;5;6mAll good\u001b[m';
        assert.strictEqual(addErrorLinesFromChunk(errorLogs, infoChunk), false);
        assert.strictEqual(errorLogs.length, 0);
    });

    test('caps errorLogs at 10 entries', () => {
        const errorLogs: string[] = [];
        const chunks = Array.from({ length: 15 }, (_, i) =>
            `[2026-03-11T20:00:${String(i).padStart(2, '0')}.000Z] \u001b[31mError ${i}\u001b[m`
        ).join('');
        addErrorLinesFromChunk(errorLogs, chunks);
        assert.ok(errorLogs.length <= 10, `Expected at most 10, got ${errorLogs.length}`);
    });

    test('handles chunk with no timestamps (pre-binding noise)', () => {
        const errorLogs: string[] = [];
        const chunk = '\u001b[?25l\u001b[38;5;8msome cursor noise\u001b[?25h';
        assert.strictEqual(addErrorLinesFromChunk(errorLogs, chunk), false);
        assert.strictEqual(errorLogs.length, 0);
    });
});
