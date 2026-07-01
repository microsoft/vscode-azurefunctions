/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FuncVersion } from '../src/FuncVersion';
import { isCodeSignatureExpected } from '../src/funcCoreTools/validateFuncCoreToolsCodeSignature';

suite('isCodeSignatureExpected maps platform + func version to signing expectation', () => {
    const allVersions: FuncVersion[] = [FuncVersion.v1, FuncVersion.v2, FuncVersion.v3, FuncVersion.v4];

    test('win32: all versions are Authenticode-signed', () => {
        for (const version of allVersions) {
            assert.strictEqual(isCodeSignatureExpected(version, 'win32'), true, `Expected ${version} to be signed on win32`);
        }
    });

    test('darwin: only v4 is codesigned/notarized, v2 and v3 are not', () => {
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v4, 'darwin'), true);
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v3, 'darwin'), false);
        assert.strictEqual(isCodeSignatureExpected(FuncVersion.v2, 'darwin'), false);
    });

    test('linux (and other platforms): never validated', () => {
        for (const version of allVersions) {
            assert.strictEqual(isCodeSignatureExpected(version, 'linux'), false, `Expected ${version} to be unvalidated on linux`);
            assert.strictEqual(isCodeSignatureExpected(version, 'freebsd' as NodeJS.Platform), false);
        }
    });
});
