/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FuncVersion } from '../src/FuncVersion';
import { isCodeSignatureExpected } from '../src/funcCoreTools/validateFuncCoreToolsCodeSignature';

suite('isCodeSignatureExpected maps platform + func version to signing expectation', () => {
    test('win32 - only v4 is validated; v1-v3 npm-delivered binaries are not', () => {
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v4, 'win32'), true);
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v3, 'win32'), false);
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v2, 'win32'), false);
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v1, 'win32'), false);
    });

    test('darwin - only v4 is codesigned/notarized, v2 and v3 are not', () => {
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v4, 'darwin'), true);
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v3, 'darwin'), false);
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v2, 'darwin'), false);
    });

    test('linux (and other platforms) - skipped', () => {
        const funcVersions: FuncVersion[] = [FuncVersion.v1, FuncVersion.v2, FuncVersion.v3, FuncVersion.v4];
        for (const version of funcVersions) {
            assert.strictEqual(isCodeSignatureExpected(version, 'linux'), false);
            assert.strictEqual(isCodeSignatureExpected(version, 'freebsd' as NodeJS.Platform), false);
        }
    });
});
