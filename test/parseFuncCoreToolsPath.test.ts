/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { npmFuncPackageName } from '../src/constants';
import { parseFuncCoreToolsPath } from '../src/funcCoreTools/validateFuncCoreToolsCodeSignature';

suite.only('parseFuncCoreToolsPath correctly resolves func CLI path from which/where func lookup output', () => {
    const tempDirs: string[] = [];

    suiteTeardown(async () => {
        for (const dir of tempDirs) {
            await fse.remove(dir).catch(() => { /* best effort cleanup */ });
        }
    });

    test('returns undefined when passed empty output', () => {
        assert.strictEqual(parseFuncCoreToolsPath(undefined, 'linux'), undefined);
        assert.strictEqual(parseFuncCoreToolsPath('', 'darwin'), undefined);
        assert.strictEqual(parseFuncCoreToolsPath(' \n ', 'linux'), undefined);
        assert.strictEqual(parseFuncCoreToolsPath(' \r\n ', 'win32'), undefined);
    });

    test('returns the first non-empty trimmed line', () => {
        assert.strictEqual(
            parseFuncCoreToolsPath('/usr/local/bin/func\n', 'darwin'),
            '/usr/local/bin/func',
        );
        assert.strictEqual(
            parseFuncCoreToolsPath('  /usr/local/bin/func  \n/opt/other/func', 'linux'),
            '/usr/local/bin/func',
        );
        assert.strictEqual(
            parseFuncCoreToolsPath('  C:\\tools\\func.exe  \r\nC:\\other\\func.exe', 'win32'),
            'C:\\tools\\func.exe',
        );
    });

    test('win32 falls back to npm global install when only launcher shims are found and the .exe exists', async () => {
        // Mock an npm-global layout with the real func.exe so the fallback path resolves properly
        const shimDir = await fse.mkdtemp(path.join(os.tmpdir(), 'funcNpmGlobal-'));
        tempDirs.push(shimDir);

        const expected = path.join(shimDir, 'node_modules', npmFuncPackageName, 'bin', 'func.exe');
        await fse.ensureDir(path.dirname(expected));
        await fse.writeFile(expected, '');

        // Actual shims you might find for a global npm install of core tools on Windows
        const funcLookupOutput = [
            path.join(shimDir, 'func'),
            path.join(shimDir, 'func.cmd'),
            path.join(shimDir, 'func.ps1'),
        ].join('\r\n');
        assert.strictEqual(parseFuncCoreToolsPath(funcLookupOutput, 'win32'), expected);
    });

    test('win32 falls back to the first match if launcher shim doesn\'t lead to a matching .exe', async () => {
        // node_modules exists with an unrelated package(s), but the func package and .exe are not found
        const shimDir = await fse.mkdtemp(path.join(os.tmpdir(), 'funcNpmGlobal2-'));
        tempDirs.push(shimDir);

        const notFuncPackagePath: string = path.join(shimDir, 'node_modules', 'not-func-package');
        await fse.ensureDir(notFuncPackagePath);
        await fse.writeFile(path.join(notFuncPackagePath, 'not-func.exe'), '');

        const firstShimPath = path.join(shimDir, 'func');
        const funcLookupOutput = [
            firstShimPath,
            path.join(shimDir, 'func.cmd'),
            path.join(shimDir, 'func.ps1'),
        ].join('\r\n');
        assert.strictEqual(parseFuncCoreToolsPath(funcLookupOutput, 'win32'), firstShimPath);
    });
});
