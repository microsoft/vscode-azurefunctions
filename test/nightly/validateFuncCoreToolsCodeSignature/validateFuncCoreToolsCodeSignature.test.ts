/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { FuncVersion } from '../../../src/FuncVersion';
import { validateCodeSignature } from '../../../src/funcCoreTools/validateFuncCoreToolsCodeSignature';
import { downloadFuncCoreToolsVersions } from './downloadFuncCoreToolsVersions';

/**
 * 1. Download binaries from the official CLI feed instead of running `npm install -g` or `brew install`.
 *    Download each specified version into its own temp directory where it can be easily checked concurrently & cleaned up after.
 *
 * 2. Pass each version's cliPath into `validateCodeSignature` directly
 *    to test and ensure the code signature validation logic is working as expected.
 *
 * Note: Choosing to just skip v1 here as it's an older non-cross-platform binary.
 * Note: Only v4+ binaries are code-signed. Older versions were published
 *       without signatures, so the production code skips validation for those.
 */

const versions: FuncVersion[] = Object.values(FuncVersion).filter(v => v !== FuncVersion.v1);

suite.only('validateFuncCoreToolsCodeSignature', function (this: Mocha.Suite): void {
    this.timeout(5 * 60 * 1000);

    let coreToolsBinMap: Map<FuncVersion, string> = new Map();
    let coreToolsDirs: string[] = [];

    suiteSetup(async function (this: Mocha.Context): Promise<void> {
        this.timeout(5 * 60 * 1000);

        // Skip on linux where code signature validation is not currently supported
        if (process.platform === 'linux') {
            this.skip();
        }

        const result = await downloadFuncCoreToolsVersions(versions);
        coreToolsBinMap = result.coreToolsBinMap;
        coreToolsDirs = result.coreToolsDirs;
    });

    suiteTeardown(async () => {
        for (const dir of coreToolsDirs) {
            await fse.remove(dir).catch(() => console.warn(`Failed to clean up Core Tools temp dir: "${dir}"`));
        }
    });

    for (const version of versions) {
        const shouldBeSigned = version === FuncVersion.v4;

        test(`Code signature is ${shouldBeSigned ? 'valid' : 'absent'} for func CLI ${version}`, async function () {
            const binPath = coreToolsBinMap.get(version);
            if (!binPath) {
                return this.skip();
            }

            console.log(`\n--- func CLI ${version} (${binPath}) ---`);
            const isValidSignature = await validateCodeSignature(binPath);
            if (shouldBeSigned) {
                assert.strictEqual(isValidSignature, true, `Expected ${version} binary at ${binPath} to have a valid Microsoft code signature`);
            } else {
                // v2 and v3 binaries were never code-signed; verify that validateCodeSignature correctly reports them as unsigned
                assert.strictEqual(isValidSignature, false, `Expected ${version} binary at ${binPath} to be unsigned (pre-v4 binaries are not code-signed)`);
            }
        });
    }

    test('Returns false for a non-existent binary path', async () => {
        console.log(`\n--- non-existent binary path ---`);
        const isValid = await validateCodeSignature('/tmp/this-binary-does-not-exist');
        assert.strictEqual(isValid, false);
    });

    test('Detects tampering with a signed v4 binary', async function () {
        const signedBinPath = coreToolsBinMap.get(FuncVersion.v4);
        if (!signedBinPath) {
            return this.skip();
        }

        // Sanity check: the original binary should pass signature validation
        assert.strictEqual(await validateCodeSignature(signedBinPath), true, `Expected original v4 binary at ${signedBinPath} to have a valid signature`);

        const tamperDir = path.join(os.tmpdir(), `funcSignatureTamper-${Date.now()}`);
        coreToolsDirs.push(tamperDir);
        await fse.ensureDir(tamperDir);

        const tamperedBinPath = path.join(tamperDir, process.platform === 'win32' ? 'func.exe' : 'func');
        await fse.copy(signedBinPath, tamperedBinPath);

        // Modify a byte in the middle of the binary to invalidate the embedded signature.
        // The midpoint is reliably inside the hashed code body (not the header).
        // XOR with 0xff is an easy way to guarantee the byte always changes regardless of its original value.
        const contents = await fse.readFile(tamperedBinPath);
        const midpoint = Math.floor(contents.length / 2);
        contents[midpoint] = contents[midpoint] ^ 0xff;

        await fse.writeFile(tamperedBinPath, contents);
        if (process.platform !== 'win32') {
            await fse.chmod(tamperedBinPath, 0o755);
        }

        console.log(`\n--- tampered v4 binary (${tamperedBinPath}) ---`);
        const isValid = await validateCodeSignature(tamperedBinPath);
        assert.strictEqual(isValid, false, `Expected tampered v4 binary at ${tamperedBinPath} to fail signature validation`);
    });
});
