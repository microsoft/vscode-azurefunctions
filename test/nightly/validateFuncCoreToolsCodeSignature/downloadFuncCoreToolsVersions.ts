/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import extract from 'extract-zip';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { FuncVersion } from '../../../src/FuncVersion';
import { cliFeedUtils } from "../../../src/utils/cliFeedUtils";

type ICliFeed = cliFeedUtils.ICliFeed;
type ICoreToolsRelease = cliFeedUtils.ICoreToolsRelease;

export async function downloadFuncCoreToolsVersions(versions: FuncVersion[]): Promise<{ coreToolsBinMap: Map<FuncVersion, string>, coreToolsDirs: string[] }> {
    // 1. Fetch the latest CLI feed which includes all the latest Core Tools download links
    const response = await fetch(cliFeedUtils.funcCliFeedV4Url);
    if (!response.ok) {
        throw new Error(`Failed to fetch CLI feed: ${response.status}`);
    }

    const cliFeed = (await response.json()) as ICliFeed;
    const coreToolsDirs: string[] = [];
    const coreToolsBinMap: Map<FuncVersion, string> = new Map();

    // 2. Download all func versions in parallel to different temp directories using the feed links
    const downloads = versions.map(async (version) => {
        // Enum values go from: ~1, ~2... => v1, v2...
        const versionTag = version.replace('~', 'v');
        const link = resolveDownloadLink(cliFeed, versionTag);
        if (!link) return;

        const tempDir = path.join(os.tmpdir(), `funcSignatureTest-${versionTag}-${Date.now()}`);
        coreToolsDirs.push(tempDir);

        const execPath = await downloadAndExtract(link, tempDir);
        coreToolsBinMap.set(version, execPath);
    });

    await Promise.all(downloads);

    return {
        coreToolsBinMap,
        coreToolsDirs,
    }
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
    await fse.writeFile(zipPath, Buffer.from(arrayBuffer));

    await extract(zipPath, { dir: destDir });
    await fse.remove(zipPath);

    const funcExecutable = process.platform === 'win32' ? 'func.exe' : 'func';
    const execPath = path.join(destDir, funcExecutable);

    if (process.platform !== 'win32') {
        await fse.chmod(execPath, 0o755);
    }

    return execPath;
}

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
