/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ErrorData } from '../src/ErrorData';

suite('Error Data Tests', () => {
    test('Generic Error', () => {
        const ed: ErrorData = new ErrorData(new Error('test'));
        assert.equal(ed.errorType, 'Error');
        assert.equal(ed.message, 'test');
    });

    test('Specific Error', () => {
        const ed: ErrorData = new ErrorData(new ReferenceError('test'));
        assert.equal(ed.errorType, 'ReferenceError');
        assert.equal(ed.message, 'test');
    });

    test('String', () => {
        const ed: ErrorData = new ErrorData('test');
        assert.equal(ed.errorType, 'string');
        assert.equal(ed.message, 'test');
    });

    test('Empty String', () => {
        const ed: ErrorData = new ErrorData('   ');
        assert.equal(ed.errorType, 'string');
        assert.equal(ed.message, 'Unknown Error');
    });

    test('Object', () => {
        const ed: ErrorData = new ErrorData({ errorCode: 1 });
        assert.equal(ed.errorType, 'Object');
        assert.equal(ed.message, '{"errorCode":1}');
    });

    test('Custom Object', () => {
        class MyObject {
            public readonly msg: string;
            constructor(msg: string) { this.msg = msg; }
        }

        const ed: ErrorData = new ErrorData(new MyObject('test'));
        assert.equal(ed.errorType, 'MyObject');
        assert.equal(ed.message, '{"msg":"test"}');
    });

    test('Null', () => {
        const ed: ErrorData = new ErrorData(null);
        assert.equal(ed.errorType, 'object');
        assert.equal(ed.message, 'Unknown Error');
    });

    test('Array', () => {
        const ed: ErrorData = new ErrorData([1, 2]);
        assert.equal(ed.errorType, 'Array');
        assert.equal(ed.message, '[1,2]');
    });

    test('Number', () => {
        const ed: ErrorData = new ErrorData(3);
        assert.equal(ed.errorType, 'number');
        assert.equal(ed.message, '3');
    });

    test('Boolean', () => {
        const ed: ErrorData = new ErrorData(false);
        assert.equal(ed.errorType, 'boolean');
        assert.equal(ed.message, 'false');
    });

    test('Undefined', () => {
        const ed: ErrorData = new ErrorData(undefined);
        assert.equal(ed.errorType, 'undefined');
        assert.equal(ed.message, 'Unknown Error');
    });
});
