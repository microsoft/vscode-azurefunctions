/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { FuncVersion } from '../../../src/FuncVersion';
import { validateCodeSignature } from '../../../src/funcCoreTools/validateFuncCoreToolsCodeSignature';
import { downloadFuncCoreToolsVersions } from './downloadFuncCoreToolsVersions';

/**
 * Integration test matrix for code signature validation
 *
 * Design decisions:
 *
 * 1. We download binaries from the official CLI feed (same CDN that pretest.mjs and
 *    the real install flow use) instead of running `npm install -g` or `brew install`.
 *    This avoids mutating global package state on the test machine and the need to
 *    uninstall after each version.
 *
 * 2. We call `validateCodeSignature(cliPath)` directly rather than the top-level
 *    `validateFuncCoreToolsCodeSignature(context)`. The top-level function adds two
 *    things: path discovery via `which func` (an OS utility, not worth testing) and
 *    the warning dialog flow (a UI concern, testable separately with TestUserInput).
 *    `validateCodeSignature` is the best test point as it accepts a CLI path and does the real
 *    platform-specific signature verification.
 *
 * 3. Install command construction (npm dist tags, brew package names) is tested
 *    separately in installFuncCoreTools.test.ts since it exercises different code
 *    and doesn't require real binaries.
 *
 * ┌─────────┬──────────────────────────┬──────────────────────────────────────┐
 * │ Version │ Platform availability    │ Validates                            │
 * ├─────────┼──────────────────────────┼──────────────────────────────────────┤
 * │ v2      │ macOS x64, Win x64/x86  │ Not code-signed; asserts false       │
 * │ v3      │ macOS x64, Win x64/x86  │ Not code-signed; asserts false       │
 * │ v4      │ macOS x64/arm64,        │ Code-signed by Microsoft; asserts    │
 * │         │ Win x64/arm64           │ true. Skipped on linux.              │
 * ├─────────┼──────────────────────────┼──────────────────────────────────────┤
 * │ (any)   │ non-existent path       │ validateCodeSignature returns false   │
 * └─────────┴──────────────────────────┴──────────────────────────────────────┘
 *
 * Note: v1 is excluded because it only ships a Windows x86 build.
 * Note: Only v4+ binaries are code-signed. Older versions (v2, v3) were published
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
                return this.skip(); // No binary available for this platform/version
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
});
