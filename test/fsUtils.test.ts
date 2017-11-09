/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fsUtils from '../src/utils/fs';

suite('fsUtils Tests', () => {
    test('isPathEqual: true', () => {
        let fsPath1: string = '/test/';
        let fsPath2: string = '/test/';
        assert.equal(fsUtils.isPathEqual(fsPath1, fsPath2), true);

        // path separator mismatch
        fsPath1 = '/test/';
        fsPath2 = '/test';
        assert.equal(fsUtils.isPathEqual(fsPath1, fsPath2), true);
        // flip order and try again
        assert.equal(fsUtils.isPathEqual(fsPath2, fsPath1), true);
    });

    test('isPathEqual: false', () => {
        let fsPath1: string = '/test/';
        let fsPath2: string = '/test/a';
        assert.equal(fsUtils.isPathEqual(fsPath1, fsPath2), false);
        // flip order and try again
        assert.equal(fsUtils.isPathEqual(fsPath2, fsPath1), false);

        // completely different path
        fsPath1 = '/test/sub';
        fsPath2 = '/test2/sub2';
        assert.equal(fsUtils.isSubPath(fsPath1, fsPath2), false);
    });

    test('isSubPath: true', () => {
        // sub path
        let fsPath1: string = '/test/';
        let fsPath2: string = '/test/sub';
        assert.equal(fsUtils.isSubPath(fsPath1, fsPath2), true);

        // nested sub path
        fsPath1 = '/test/';
        fsPath2 = '/test/sub2/sub2';
        assert.equal(fsUtils.isSubPath(fsPath1, fsPath2), true);
    });

    test('isSubPath: false', () => {
        // opposite of subpath
        let fsPath1: string = '/test/sub';
        let fsPath2: string = '/test/';
        assert.equal(fsUtils.isSubPath(fsPath1, fsPath2), false);

        // completely different path
        fsPath1 = '/test/sub';
        fsPath2 = '/test2/sub2';
        assert.equal(fsUtils.isSubPath(fsPath1, fsPath2), false);

        // same path
        fsPath1 = '/test/';
        fsPath2 = '/test/';
        assert.equal(fsUtils.isSubPath(fsPath1, fsPath2), false);
    });
});
