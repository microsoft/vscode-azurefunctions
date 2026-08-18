/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import fse from 'fs-extra';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import yauzl from 'yauzl';

const execAsync = promisify(exec);

const directoryFileType = 0o040000;
const fileTypeMask = 0o170000;
const funcDir = path.join(os.homedir(), 'tools', 'func');
const funcZip = 'funccli.zip';
const funcExecutable = process.platform === 'win32' ? 'func.exe' : 'func';
const symbolicLinkFileType = 0o120000;

function matchesCliFeedOS(platform) {
    switch (process.platform) {
        case 'win32':
            return platform === 'Windows';
        case 'darwin':
            return platform === 'MacOS';
        default:
            return platform === 'Linux';
    }
}

async function getFuncLink() {
    const response = await fetch('https://aka.ms/V00v5v');
    if (!response.ok) {
        throw new Error(`Failed to fetch func CLI feed: ${response.status} ${response.statusText}`);
    }

    const cliFeed = await response.json();
    const version = cliFeed.tags['v4-prerelease'].release;
    console.log(`Func cli feed version: ${version}`);

    const cliRelease = cliFeed.releases[version].coreTools.find((rel) => {
        return rel.Architecture === 'x64' && (
            matchesCliFeedOS(rel.OperatingSystem) ||
            matchesCliFeedOS(rel.OS)
        );
    });

    if (!cliRelease?.downloadLink) {
        throw new Error('Failed to resolve func CLI download link from feed.');
    }

    console.log(`Func downloadLink: ${cliRelease.downloadLink}`);
    return cliRelease.downloadLink;
}

async function download(url, targetPath) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request for func CLI responded with status code: ${response.status}`);
    }

    await fse.ensureFile(targetPath);
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(targetPath, Buffer.from(arrayBuffer));
}

async function downloadFuncCli(downloadLink) {
    if (fse.pathExistsSync(funcDir)) {
        console.log('Removing old install of func.');
        fse.removeSync(funcDir);
    }

    const funcZipPath = path.join(funcDir, funcZip);
    await download(downloadLink, funcZipPath);
    console.log('Successfully downloaded the func CLI zip at ' + funcZipPath);
    return funcZipPath;
}

async function extractFuncCli(funcZipPath) {
    try {
        const zipFile = await yauzl.openPromise(funcZipPath, { lazyEntries: true });
        try {
            for await (const entry of zipFile.eachEntry()) {
                const destination = getEntryDestination(entry.fileName, funcZipPath);
                const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
                const fileType = mode & fileTypeMask;

                if (fileType === symbolicLinkFileType) {
                    throw new Error(`Cannot extract symbolic link "${entry.fileName}".`);
                }

                if (entry.fileName.endsWith('/') || fileType === directoryFileType) {
                    await fs.mkdir(destination, { recursive: true });
                    continue;
                }

                await fs.mkdir(path.dirname(destination), { recursive: true });
                await pipeline(
                    await zipFile.openReadStreamPromise(entry),
                    fse.createWriteStream(destination)
                );
            }
        } finally {
            zipFile.close();
        }

        console.log('Successfully extracted func CLI.');

        console.log('Setting executable permissions...');
        await fse.chmod(path.join(funcDir, funcExecutable), 0o755);
        console.log('Successfully set executable permissions.');
    } finally {
        await fse.remove(funcZipPath);
    }
}

function getEntryDestination(entryName, sourceZipPath) {
    const destinationRoot = path.resolve(funcDir);
    const destination = path.resolve(destinationRoot, entryName.replace(/\\/g, '/'));
    if (destination !== destinationRoot && !destination.startsWith(`${destinationRoot}${path.sep}`)) {
        throw new Error(`Cannot extract "${entryName}" outside of the destination directory.`);
    }
    if (path.relative(path.resolve(sourceZipPath), destination) === '') {
        throw new Error(`Cannot overwrite source ZIP with entry "${entryName}".`);
    }

    return destination;
}

async function printFuncVersion() {
    const funcExecutablePath = path.join(funcDir, funcExecutable);
    const { stdout } = await execAsync(`"${funcExecutablePath}" --version`);
    console.log(`Verified func CLI version:\n${stdout}`);
}

const downloadLink = await getFuncLink();
const funcZipPath = await downloadFuncCli(downloadLink);
await extractFuncCli(funcZipPath);
await printFuncVersion();
