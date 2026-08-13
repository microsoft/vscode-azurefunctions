/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { npmFuncPackageName } from '../src/constants';
import { resolveFuncCoreToolsPath } from '../src/funcCoreTools/validateFuncCoreToolsCodeSignature';

// Verify the function normalizes the single path `which` resolves, preferring the real executable
// over a Windows npm launcher shim and handling the not-found case gracefully on every platform.

suite('resolveFuncCoreToolsPath', () => {
    const tempDirs: string[] = [];

    suiteTeardown(async () => {
        for (const dir of tempDirs) {
            await AzExtFsExtra.deleteResource(dir, { recursive: true }).catch(() => { /* best effort cleanup */ });
        }
    });

    test('returns undefined when func was not found', () => {
        assert.strictEqual(resolveFuncCoreToolsPath(null, 'linux'), undefined);
        assert.strictEqual(resolveFuncCoreToolsPath(null, 'darwin'), undefined);
        assert.strictEqual(resolveFuncCoreToolsPath('', 'win32'), undefined);
    });

    test('returns the resolved path as-is on non-Windows platforms', () => {
        assert.strictEqual(resolveFuncCoreToolsPath('/usr/local/bin/func', 'darwin'), '/usr/local/bin/func');
        assert.strictEqual(resolveFuncCoreToolsPath('/opt/homebrew/bin/func', 'linux'), '/opt/homebrew/bin/func');
    });

    test('win32 returns the executable directly when which already resolved func.exe', () => {
        assert.strictEqual(resolveFuncCoreToolsPath('C:\\tools\\func.exe', 'win32'), 'C:\\tools\\func.exe');
    });

    test('win32 falls back to npm global install when a launcher shim is found and the .exe exists', async () => {
        // Mock an npm-global layout with the real func.exe so the fallback path resolves properly
        const shimDir = await fse.mkdtemp(path.join(os.tmpdir(), 'funcNpmGlobal-'));
        tempDirs.push(shimDir);

        const expected = path.join(shimDir, 'node_modules', npmFuncPackageName, 'bin', 'func.exe');
        await AzExtFsExtra.ensureDir(path.dirname(expected));
        await AzExtFsExtra.writeFile(expected, '');

        // The shim which would resolve for a global npm install of core tools on Windows
        const shimPath = path.join(shimDir, 'func.cmd');
        assert.strictEqual(resolveFuncCoreToolsPath(shimPath, 'win32'), expected);
    });

    test('win32 falls back to the shim itself when it doesn\'t lead to a matching .exe', async () => {
        // node_modules exists with an unrelated package(s), but the func package and .exe are not found
        const shimDir = await fse.mkdtemp(path.join(os.tmpdir(), 'funcNpmGlobal2-'));
        tempDirs.push(shimDir);

        const notFuncPackagePath: string = path.join(shimDir, 'node_modules', 'not-func-package');
        await AzExtFsExtra.ensureDir(notFuncPackagePath);
        await AzExtFsExtra.writeFile(path.join(notFuncPackagePath, 'not-func.exe'), '');

        const shimPath = path.join(shimDir, 'func.cmd');
        assert.strictEqual(resolveFuncCoreToolsPath(shimPath, 'win32'), shimPath);
    });
});
