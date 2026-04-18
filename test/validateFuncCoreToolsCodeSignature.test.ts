/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import extract from 'extract-zip';
import * as fse from 'fs-extra';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FuncVersion } from '../src/FuncVersion';
import { validateCodeSignature } from '../src/funcCoreTools/validateFuncCoreToolsCodeSignature';
import { cliFeedUtils } from '../src/utils/cliFeedUtils';

type ICliFeed = cliFeedUtils.ICliFeed;
type ICoreToolsRelease = cliFeedUtils.ICoreToolsRelease;

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
 * │ v2      │ macOS x64, Win x64/x86  │ Real binary code signature (darwin   │
 * │ v3      │ macOS x64, Win x64/x86  │ or win32). Skipped on linux and for  │
 * │ v4      │ macOS x64/arm64,        │ versions without a build for the     │
 * │         │ Win x64/arm64           │ current OS.                          │
 * ├─────────┼──────────────────────────┼──────────────────────────────────────┤
 * │ (any)   │ non-existent path       │ validateCodeSignature returns false   │
 * └─────────┴──────────────────────────┴──────────────────────────────────────┘
 *
 * Note: v1 is excluded because it only ships a Windows x86 build.
 */

const cliFeedUrl = cliFeedUtils.funcCliFeedV4Url;
const funcExecutable = process.platform === 'win32' ? 'func.exe' : 'func';
const versionsToTest: FuncVersion[] = Object.values(FuncVersion).filter(v => v !== FuncVersion.v1);

function matchesCurrentOS(rel: ICoreToolsRelease): boolean {
    const osProp = rel.OperatingSystem ?? rel.OS;
    switch (process.platform) {
        case 'win32': return osProp === 'Windows';
        case 'darwin': return osProp === 'MacOS';
        default: return osProp === 'Linux';
    }
}

function matchesArchitecture(rel: ICoreToolsRelease): boolean {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return rel.Architecture === arch;
}

function resolveDownloadLink(feed: ICliFeed, versionTag: string): string | undefined {
    const releaseVersion = feed.tags[versionTag]?.release;
    if (!releaseVersion) return undefined;

    const coreTools = feed.releases[releaseVersion]?.coreTools;
    if (!coreTools) return undefined;

    // Prefer native architecture, fall back to x64 (runs via Rosetta on arm64 macOS)
    const nativeMatch = coreTools.find(r => matchesCurrentOS(r) && matchesArchitecture(r));
    if (nativeMatch?.downloadLink) return nativeMatch.downloadLink;

    const x64Fallback = coreTools.find(r => matchesCurrentOS(r) && r.Architecture === 'x64');
    return x64Fallback?.downloadLink;
}

async function downloadAndExtract(downloadLink: string, destDir: string): Promise<string> {
    const zipPath = path.join(destDir, 'funccli.zip');

    const response = await fetch(downloadLink);
    if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await fse.ensureDir(destDir);
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(zipPath, Buffer.from(arrayBuffer));

    await extract(zipPath, { dir: destDir });
    await fse.remove(zipPath);

    const execPath = path.join(destDir, funcExecutable);
    if (process.platform !== 'win32') {
        await fse.chmod(execPath, 0o755);
    }
    return execPath;
}

suite('validateFuncCoreToolsCodeSignature (integration)', function (this: Mocha.Suite): void {
    this.timeout(5 * 60 * 1000);

    // Skip on linux where code signature validation is not supported
    if (process.platform !== 'darwin') {
        return;
    }

    let cliFeed: ICliFeed;
    const downloadedPaths: Map<FuncVersion, string> = new Map();
    const tempDirs: string[] = [];

    suiteSetup(async function (this: Mocha.Context): Promise<void> {
        this.timeout(5 * 60 * 1000);

        const response = await fetch(cliFeedUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch CLI feed: ${response.status}`);
        }
        cliFeed = (await response.json()) as ICliFeed;

        // Download all func versions in parallel to different temp directories
        const downloads = versionsToTest.map(async (version) => {
            // Enum values go from: ~1, ~2... => v1, v2...
            const versionTag = version.replace('~', 'v');
            const link = resolveDownloadLink(cliFeed, versionTag);
            if (!link) return;

            const tempDir = path.join(os.tmpdir(), `funcSignatureTest-${versionTag}-${Date.now()}`);
            tempDirs.push(tempDir);

            const execPath = await downloadAndExtract(link, tempDir);
            downloadedPaths.set(version, execPath);
        });

        await Promise.all(downloads);
    });

    suiteTeardown(async () => {
        for (const dir of tempDirs) {
            await fse.remove(dir).catch(() => console.warn(`Failed to clean up temp dir: ${dir}`));
        }
    });

    for (const version of versionsToTest) {
        test(`Code signature is valid for func CLI ${version}`, async function () {
            const execPath = downloadedPaths.get(version);
            if (!execPath) {
                this.skip(); // No binary available for this platform/version
            }

            const isValid = await validateCodeSignature(execPath);
            assert.strictEqual(isValid, true, `Expected ${version} binary at ${execPath} to have a valid Microsoft code signature`);
        });
    }

    test('Returns false for a non-existent binary path', async () => {
        const isValid = await validateCodeSignature('/tmp/this-binary-does-not-exist');
        assert.strictEqual(isValid, false);
    });
});
