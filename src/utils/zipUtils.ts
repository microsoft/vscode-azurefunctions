/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import * as yauzl from 'yauzl';

const directoryFileType = 0o040000;
const fileTypeMask = 0o170000;
const symbolicLinkFileType = 0o120000;

export async function extractZip(zipPath: string, destinationPath: string): Promise<void> {
    const sourceZipPath = await fs.promises.realpath(zipPath);
    const sourceZipStats = await fs.promises.stat(sourceZipPath);
    await fs.promises.mkdir(destinationPath, { recursive: true });
    const destinationRoot = await fs.promises.realpath(destinationPath);

    const zipFile = await yauzl.openPromise(sourceZipPath, { lazyEntries: true });
    try {
        for await (const entry of zipFile.eachEntry()) {
            await extractEntry(zipFile, entry, destinationRoot, sourceZipPath, sourceZipStats);
        }
    } finally {
        zipFile.close();
    }
}

async function extractEntry(zipFile: yauzl.ZipFile, entry: yauzl.Entry, destinationRoot: string, sourceZipPath: string, sourceZipStats: fs.Stats): Promise<void> {
    const destination = getEntryDestination(entry.fileName, destinationRoot);
    const entryMode = getEntryMode(entry);
    const isDirectory = isDirectoryEntry(entry, entryMode);
    const permissions = getEntryPermissions(entryMode);

    if (isSymbolicLinkEntry(entryMode)) {
        throw new Error(`Cannot extract symbolic link "${entry.fileName}".`);
    }

    if (destination === destinationRoot && !isDirectory) {
        throw new Error(`Cannot extract file "${entry.fileName}" as the destination directory.`);
    }

    if (isDirectory) {
        await fs.promises.mkdir(destination, { recursive: true });
        const canonicalDestination = await fs.promises.realpath(destination);
        assertWithinDestination(canonicalDestination, destinationRoot, entry.fileName);
        if (permissions !== 0 && canonicalDestination !== destinationRoot) {
            await fs.promises.chmod(canonicalDestination, permissions);
        }
        return;
    }

    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const canonicalParent = await fs.promises.realpath(path.dirname(destination));
    assertWithinDestination(canonicalParent, destinationRoot, entry.fileName);
    const canonicalDestination = path.join(canonicalParent, path.basename(destination));
    await assertDoesNotOverwriteSource(canonicalDestination, sourceZipPath, sourceZipStats, entry.fileName);

    const readStream = await zipFile.openReadStreamPromise(entry);
    await pipeline(readStream, fs.createWriteStream(canonicalDestination));

    if (permissions !== 0) {
        await fs.promises.chmod(canonicalDestination, permissions);
    }
}

function getEntryMode(entry: yauzl.Entry): number {
    return (entry.externalFileAttributes >>> 16) & 0xffff;
}

function getEntryPermissions(entryMode: number): number {
    return entryMode & 0o777;
}

function isDirectoryEntry(entry: yauzl.Entry, entryMode: number): boolean {
    const originatingSystem = entry.versionMadeBy >>> 8;
    return entry.fileName.endsWith('/')
        || getFileType(entryMode) === directoryFileType
        || (originatingSystem === 0 && entry.externalFileAttributes === 16);
}

function isSymbolicLinkEntry(entryMode: number): boolean {
    return getFileType(entryMode) === symbolicLinkFileType;
}

function getFileType(entryMode: number): number {
    return entryMode & fileTypeMask;
}

function getEntryDestination(entryName: string, destinationRoot: string): string {
    const destination = path.resolve(destinationRoot, entryName.replace(/\\/g, '/'));
    assertWithinDestination(destination, destinationRoot, entryName);

    return destination;
}

function assertWithinDestination(destination: string, destinationRoot: string, entryName: string): void {
    const relativePath = path.relative(destinationRoot, destination);
    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        throw new Error(`Cannot extract "${entryName}" outside of the destination directory.`);
    }
}

async function assertDoesNotOverwriteSource(destination: string, sourceZipPath: string, sourceZipStats: fs.Stats, entryName: string): Promise<void> {
    try {
        const destinationStats = await fs.promises.lstat(destination);
        if (destinationStats.isSymbolicLink()) {
            throw new Error(`Cannot extract file "${entryName}" through a symbolic link.`);
        }

        if (destinationStats.dev === sourceZipStats.dev && destinationStats.ino === sourceZipStats.ino) {
            throw new Error(`Cannot overwrite source ZIP with entry "${entryName}".`);
        }

        const canonicalDestination = await fs.promises.realpath(destination);
        if (canonicalDestination === sourceZipPath) {
            throw new Error(`Cannot overwrite source ZIP with entry "${entryName}".`);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
}
