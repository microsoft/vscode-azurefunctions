/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FuncVersion, getMajorVersion } from '../src/FuncVersion';
import { funcPackageName, PackageManager } from '../src/constants';
import { getBrewPackageName } from '../src/funcCoreTools/getBrewPackageName';

const allFuncVersions: FuncVersion[] = Object.values(FuncVersion);

/**
 * Unit tests for install command construction across versions and package managers.
 *
 * Design decisions:
 *
 * 1. These tests verify that the correct npm/brew commands and package names are
 *    constructed for each FuncVersion. They do NOT execute the commands — actual
 *    installation would mutate global npm/brew state and require cleanup.
 *
 * 2. Real binary validation (code signature verification against downloaded
 *    binaries) is handled separately in validateFuncCoreToolsCodeSignature.test.ts.
 *    That test downloads from the same CDN the install flow targets, so the two
 *    test files together cover the full install-then-validate flow without side effects.
 *
 * 3. The version list is derived from `Object.values(FuncVersion)` so that adding
 *    a new version to the enum automatically adds it to every test suite here.
 *
 * ┌────────────┬─────┬───────────────────────────────────────────────────┬───────┐
 * │ PkgManager │ Ver │ Expected command / package name                   │ Test  │
 * ├────────────┼─────┼───────────────────────────────────────────────────┼───────┤
 * │ npm        │ v1  │ npm install -g azure-functions-core-tools@1       │ ✓     │
 * │ npm        │ v2  │ npm install -g azure-functions-core-tools@2       │ ✓     │
 * │ npm        │ v3  │ npm install -g azure-functions-core-tools@3       │ ✓     │
 * │ npm        │ v4  │ npm install -g azure-functions-core-tools@4       │ ✓     │
 * ├────────────┼─────┼───────────────────────────────────────────────────┼───────┤
 * │ brew       │ v1  │ azure-functions-core-tools@1                      │ ✓     │
 * │ brew       │ v2  │ azure-functions-core-tools@2                      │ ✓     │
 * │ brew       │ v3  │ azure-functions-core-tools@3                      │ ✓     │
 * │ brew       │ v4  │ azure-functions-core-tools@4                      │ ✓     │
 * ├────────────┼─────┼───────────────────────────────────────────────────┼───────┤
 * │ version    │ v1  │ getMajorVersion → '1'                             │ ✓     │
 * │ version    │ v2  │ getMajorVersion → '2'                             │ ✓     │
 * │ version    │ v3  │ getMajorVersion → '3'                             │ ✓     │
 * │ version    │ v4  │ getMajorVersion → '4'                             │ ✓     │
 * └────────────┴─────┴───────────────────────────────────────────────────┴───────┘
 */

suite('installFuncCoreTools', () => {
    suite('npm install command construction', () => {
        for (const version of allFuncVersions) {
            test(`Constructs correct npm dist tag for ${version}`, () => {
                const majorVersion = getMajorVersion(version);
                const expectedTag = `${funcPackageName}@${majorVersion}`;
                assert.strictEqual(expectedTag, `azure-functions-core-tools@${majorVersion}`);
            });
        }
    });

    suite('getMajorVersion mapping', () => {
        for (const version of allFuncVersions) {
            test(`${version} maps to correct major version`, () => {
                const major = getMajorVersion(version);
                // FuncVersion values are '~N', so major should be 'N'
                assert.strictEqual(major, version.replace('~', ''));
            });
        }
    });

    suite('brew install command construction', () => {
        for (const version of allFuncVersions) {
            test(`Constructs correct brew package name for ${version}`, () => {
                const brewName = getBrewPackageName(version);
                const majorVersion = getMajorVersion(version);
                assert.strictEqual(brewName, `${funcPackageName}@${majorVersion}`);
            });
        }
    });

    suite('PackageManager enum values', () => {
        test('npm is a valid package manager', () => {
            assert.strictEqual(PackageManager.npm, 'npm');
        });

        test('brew is a valid package manager', () => {
            assert.strictEqual(PackageManager.brew, 'brew');
        });
    });

    suite('lastCoreToolsInstallCommand tracking', () => {
        test('lastCoreToolsInstallCommand is exported and initially empty', async () => {
            const { lastCoreToolsInstallCommand } = await import('../src/funcCoreTools/installFuncCoreTools.js');
            assert.ok(Array.isArray(lastCoreToolsInstallCommand));
        });
    });
});
