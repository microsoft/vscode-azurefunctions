/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { FuncVersion } from '../../../src/FuncVersion';
import { cliFeedUtils } from "../../../src/utils/cliFeedUtils";

type ICliFeed = cliFeedUtils.ICliFeed;
type ICoreToolsRelease = cliFeedUtils.ICoreToolsRelease;

const execFileAsync = promisify(execFile);

export async function downloadFuncCoreToolsVersions(versions: FuncVersion[]): Promise<{ coreToolsBinMap: Map<FuncVersion, string>, coreToolsDirs: string[] }> {
    // 1. Fetch the latest CLI feed which includes all the latest Core Tools download links
    console.log(`[downloadFuncCoreToolsVersions] Fetching CLI feed: ${cliFeedUtils.funcCliFeedV4Url}`);

    const feedStart = Date.now();
    const response = await fetch(cliFeedUtils.funcCliFeedV4Url);
    if (!response.ok) {
        throw new Error(`Failed to fetch CLI feed: ${response.status}`);
    }

    const cliFeed = (await response.json()) as ICliFeed;
    console.log(`[downloadFuncCoreToolsVersions] Fetched CLI feed in ${elapsed(feedStart)}`);

    const coreToolsDirs: string[] = [];
    const coreToolsBinMap: Map<FuncVersion, string> = new Map();

    // 2. Download all func zips concurrently
    console.log(`[downloadFuncCoreToolsVersions] Resolving download links for versions: ${versions.join(', ')}`);
    const downloads = await Promise.all(versions.map(async (version) => {
        // Enum values go from: ~1, ~2... => v1, v2...
        const versionTag = version.replace('~', 'v');
        const link = resolveDownloadLink(cliFeed, versionTag);
        if (!link) {
            console.log(`[downloadFuncCoreToolsVersions] ${versionTag}: no download link for ${process.platform}/${process.arch}, skipping`);
            return undefined;
        }

        const tempDir = path.join(os.tmpdir(), `funcSignatureTest-${versionTag}-${Date.now()}`);
        coreToolsDirs.push(tempDir);

        console.log(`[downloadFuncCoreToolsVersions] ${versionTag}: downloading ${link}`);
        const downloadStart = Date.now();
        const zipPath = await downloadZip(link, tempDir);
        console.log(`[downloadFuncCoreToolsVersions] ${versionTag}: downloaded in ${elapsed(downloadStart)}`);
        return { version, versionTag, tempDir, zipPath };
    }));

    // 3. Extract sequentially so only one heavy unzip runs at a time
    for (const download of downloads) {
        if (!download) {
            continue;
        }

        const extractStart = Date.now();
        const { version, versionTag, tempDir, zipPath } = download;

        const execPath = await extractZip(zipPath, tempDir);
        coreToolsBinMap.set(version, execPath);
        console.log(`[downloadFuncCoreToolsVersions] ${versionTag}: ready at ${execPath} (extract ${elapsed(extractStart)})`);
    }

    console.log(`[downloadFuncCoreToolsVersions] All downloads finished. Resolved ${coreToolsBinMap.size}/${versions.length} version(s).`);

    return {
        coreToolsBinMap,
        coreToolsDirs,
    }
}

function elapsed(startMs: number): string {
    return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

function resolveDownloadLink(feed: ICliFeed, versionTag: string): string | undefined {
    const releaseVersion = feed.tags[versionTag]?.release;
    if (!releaseVersion) {
        return undefined;
    }

    const coreTools = feed.releases[releaseVersion]?.coreTools;
    if (!coreTools) {
        return undefined;
    }

    // Prefer native architecture, fall back to x64 (runs via Rosetta on arm64 macOS)
    const nativeMatch = coreTools.find(r => matchesCurrentOS(r) && matchesArchitecture(r));
    if (nativeMatch?.downloadLink) {
        return nativeMatch.downloadLink;
    }

    const x64Fallback = coreTools.find(r => matchesCurrentOS(r) && r.Architecture === 'x64');
    return x64Fallback?.downloadLink;
}

async function downloadZip(downloadLink: string, destDir: string): Promise<string> {
    const zipPath = path.join(destDir, 'funccli.zip');

    const response = await fetch(downloadLink);
    if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await fse.ensureDir(destDir);
    const arrayBuffer = await response.arrayBuffer();
    await fse.writeFile(zipPath, Buffer.from(arrayBuffer));
    console.log(`[downloadFuncCoreToolsVersions] ${path.basename(destDir)}: wrote ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB zip`);

    return zipPath;
}

async function extractZip(zipPath: string, destDir: string): Promise<string> {
    console.log(`[downloadFuncCoreToolsVersions] ${path.basename(destDir)}: extracting...`);
    const extractStart = Date.now();

    // Shell out to extract instead of unzipping in-process. The in-process JS unzip
    // (extract-zip/yauzl) deadlocks under the VS Code extension-host debugger.
    if (process.platform === 'win32') {
        // bsdtar (tar.exe) fails to create nested subdirectories for these archives on Windows,
        // so use native .NET zip extraction via PowerShell instead (fast and reliable).
        const psCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath}', '${destDir}')`;
        await execFileAsync('powershell', ['-NoProfile', '-Command', psCommand]);
    } else {
        await execFileAsync('unzip', ['-q', '-o', zipPath, '-d', destDir]);
    }

    console.log(`[downloadFuncCoreToolsVersions] ${path.basename(destDir)}: extraction done (${elapsed(extractStart)})`);
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
        case 'win32':
            return osProp === 'Windows';
        case 'darwin':
            return osProp === 'MacOS';
        default:
            return osProp === 'Linux';
    }
}

function matchesArchitecture(rel: ICoreToolsRelease): boolean {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return rel.Architecture === arch;
}
