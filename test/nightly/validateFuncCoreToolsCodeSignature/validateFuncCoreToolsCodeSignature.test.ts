/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { FuncVersion } from '../../../src/FuncVersion';
import { isCodeSignatureExpected, validateCodeSignature } from '../../../src/funcCoreTools/validateFuncCoreToolsCodeSignature';
import { downloadFuncCoreToolsVersions } from './downloadFuncCoreToolsVersions';

/**
 * 1. Download binaries from the official CLI feed instead of running `npm install -g` or `brew install`.
 *    Download each specified version into its own temp directory where it can be easily checked concurrently & cleaned up after.
 *
 * 2. Pass each version's cliPath into `validateCodeSignature` directly
 *    to test and ensure the code signature validation logic is working as expected.
 *
 * Whether a version is expected to be signed depends on the platform (see `isCodeSignatureExpected`):
 *   - We only validate v4+ on every platform. Although Windows Authenticode-signs v1-v4 on the CLI feed,
 *     the extension installs func via npm where the v1-v3 binaries are not reliably signed, so we keep
 *     live and test behavior aligned by only expecting a signature for v4+.
 *   - macOS: only v4+ is codesigned/notarized; v2/v3 shipped unsigned (v1 was Windows-only).
 */

const versions: FuncVersion[] = Object.values(FuncVersion);

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

        const setupStart = Date.now();
        console.log(`\n[suiteSetup] Downloading Func Core Tools for signature validation (${process.platform}/${process.arch})...`);

        const result = await downloadFuncCoreToolsVersions(versions);
        coreToolsBinMap = result.coreToolsBinMap;
        coreToolsDirs = result.coreToolsDirs;
        console.log(`[suiteSetup] Setup complete in ${((Date.now() - setupStart) / 1000).toFixed(1)}s\n`);
    });

    suiteTeardown(async () => {
        for (const dir of coreToolsDirs) {
            await fse.remove(dir).catch(() => console.warn(`Failed to clean up Core Tools temp dir: "${dir}"`));
        }
    });

    for (const version of versions) {
        // Only versions we expect to be signed are worth validating; skip registering a test otherwise.
        if (!isCodeSignatureExpected(version)) {
            continue;
        }

        test(`Code signature is valid for func CLI ${version}`, async function () {
            const binPath = coreToolsBinMap.get(version);
            if (!binPath) {
                // No download link for this version on the current platform
                return this.skip();
            }

            console.log(`\n--- func CLI ${version} (${binPath}) ---`);
            const isValidSignature = await validateCodeSignature(binPath);
            assert.strictEqual(isValidSignature, true, `Expected ${version} binary at ${binPath} to have a valid Microsoft code signature on ${process.platform}`);
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
