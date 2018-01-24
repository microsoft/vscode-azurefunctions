/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import * as fsUtils from '../src/utils/fs';

// tslint:disable-next-line:max-func-body-length
suite('fsUtils Tests', () => {
    test('isPathEqual, posix, true', () => {
        let fsPath1: string = '/test/';
        let fsPath2: string = '/test/';
        assert.equal(fsUtils.isPathEqual(fsPath1, fsPath2, path.posix.relative), true);

        // path separator mismatch
        fsPath1 = '/test/';
        fsPath2 = '/test';
        assert.equal(fsUtils.isPathEqual(fsPath1, fsPath2, path.posix.relative), true);
        // flip order and try again
        assert.equal(fsUtils.isPathEqual(fsPath2, fsPath1, path.posix.relative), true);
    });

    test('isPathEqual, win32, true', () => {
        let fsPath1: string = 'C:\\test\\';
        let fsPath2: string = 'C:\\test\\';

        // path separator mismatch
        fsPath1 = 'C:\\test\\';
        fsPath2 = 'C:\\test';
        assert.equal(fsUtils.isPathEqual(fsPath1, fsPath2, path.win32.relative), true);
        // flip order and try again
        assert.equal(fsUtils.isPathEqual(fsPath2, fsPath1, path.win32.relative), true);

        // windows case insensitive path
        fsPath1 = 'C:\\test\\';
        fsPath2 = 'c:\\TEST\\';
        assert.equal(fsUtils.isPathEqual(fsPath1, fsPath2, path.win32.relative), true);
    });

    test('isPathEqual, posix, false', () => {
        let fsPath1: string = '/test/';
        let fsPath2: string = '/test/a';
        assert.equal(fsUtils.isPathEqual(fsPath1, fsPath2, path.posix.relative), false);
        // flip order and try again
        assert.equal(fsUtils.isPathEqual(fsPath2, fsPath1, path.posix.relative), false);

        // completely different path
        fsPath1 = '/test/sub';
        fsPath2 = '/test2/sub2';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.posix.relative), false);
    });

    test('isPathEqual, win32, false', () => {
        let fsPath1: string = 'C:\\test\\a';
        let fsPath2: string = 'C:\\test\\';
        assert.equal(fsUtils.isPathEqual(fsPath1, fsPath2, path.win32.relative), false);
        // flip order and try again
        assert.equal(fsUtils.isPathEqual(fsPath2, fsPath1, path.win32.relative), false);

        // completely different path
        fsPath1 = 'C:\\test\\sub';
        fsPath2 = 'D:\\test2\\sub2';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.win32.relative), false);
    });

    test('isSubpath, posix, true', () => {
        // sub path
        let fsPath1: string = '/test/';
        let fsPath2: string = '/test/sub';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.posix.relative), true);

        // nested sub path
        fsPath1 = '/test/';
        fsPath2 = '/test/sub2/sub2';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.posix.relative), true);
    });

    test('isSubpath, win32, true', () => {
        // sub path
        let fsPath1: string = 'C:\\test';
        let fsPath2: string = 'C:\\test\\sub';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.win32.relative), true);

        // nested sub path
        fsPath1 = 'C:\\test';
        fsPath2 = 'C:\\test\\sub\\sub2';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.win32.relative), true);
    });

    test('isSubpath, posix, false', () => {
        // opposite of subpath
        let fsPath1: string = '/test/sub';
        let fsPath2: string = '/test/';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.posix.relative), false);

        // completely different path
        fsPath1 = '/test/sub';
        fsPath2 = '/test2/sub2';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.posix.relative), false);

        // same path
        fsPath1 = '/test/';
        fsPath2 = '/test/';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.posix.relative), false);
    });

    test('isSubpath, win32, false', () => {
        // opposite of subpath
        let fsPath1: string = 'C:\\test\\sub\\';
        let fsPath2: string = 'C:\\test\\';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.win32.relative), false);

        // completely different path
        fsPath1 = 'C:\\test\\sub';
        fsPath2 = 'D:\\test2\\sub2';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.win32.relative), false);

        // same path
        fsPath1 = 'C:\\test\\';
        fsPath2 = 'C:\\test\\';
        assert.equal(fsUtils.isSubpath(fsPath1, fsPath2, path.win32.relative), false);
    });
});
