/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getLineAndColumnFromOffset, parseJson } from '../extension.bundle';

suite('parseJson', () => {
    test('Valid json', () => {
        const data: string = '{"a": "1"}';
        assert.deepStrictEqual(parseJson(data), { a: '1' });
    });

    test('Trailing comma', () => {
        const data: string = '{"a": "1",}';
        assert.deepStrictEqual(parseJson(data), { a: '1' });
    });

    test('With comment', () => {
        const data: string = '{"a": /*comment*/"1"}';
        assert.deepStrictEqual(parseJson(data), { a: '1' });
    });

    test('Invalid json', () => {
        const data: string = '{"a": "1}';
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        assert.throws(() => parseJson(data));
    });
});

suite('getLineAndColumnFromOffset', () => {
    const data: string = `{
    "version": "2.0",
    "logging": {
        "applicationInsights": {
            "samplingExcludedTypes": "Request",
            "samplingSettings": {
                "isEnabled": true
            }
        }
    }
}`;

    test('First character', () => {
        assert.deepStrictEqual(getLineAndColumnFromOffset(data, 1), [1, 1]);
    });
    test('Middle of random line', () => {
        assert.deepStrictEqual(getLineAndColumnFromOffset(data, 28), [3, 4]);
    });
    test('End of random line', () => {
        assert.deepStrictEqual(getLineAndColumnFromOffset(data, 74), [4, 33]);
    });
    test('Last character', () => {
        assert.deepStrictEqual(getLineAndColumnFromOffset(data, 221), [11, 1]);
    });
});
