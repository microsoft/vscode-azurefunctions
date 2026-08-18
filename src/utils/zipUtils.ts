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
    const sourceZipPath = path.resolve(zipPath);
    const destinationRoot = path.resolve(destinationPath);
    await fs.promises.mkdir(destinationRoot, { recursive: true });

    const zipFile = await yauzl.openPromise(sourceZipPath, { lazyEntries: true });
    try {
        for await (const entry of zipFile.eachEntry()) {
            await extractEntry(zipFile, entry, destinationRoot, sourceZipPath);
        }
    } finally {
        zipFile.close();
    }
}

async function extractEntry(zipFile: yauzl.ZipFile, entry: yauzl.Entry, destinationRoot: string, sourceZipPath: string): Promise<void> {
    const destination = getEntryDestination(entry.fileName, destinationRoot);
    const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
    const fileType = mode & fileTypeMask;

    if (path.relative(sourceZipPath, destination) === '') {
        throw new Error(`Cannot overwrite source ZIP with entry "${entry.fileName}".`);
    }

    if (fileType === symbolicLinkFileType) {
        throw new Error(`Cannot extract symbolic link "${entry.fileName}".`);
    }

    if (entry.fileName.endsWith('/') || fileType === directoryFileType) {
        await fs.promises.mkdir(destination, { recursive: true });
        return;
    }

    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const readStream = await zipFile.openReadStreamPromise(entry);
    await pipeline(readStream, fs.createWriteStream(destination));

    const permissions = mode & 0o777;
    if (permissions !== 0) {
        await fs.promises.chmod(destination, permissions);
    }
}

function getEntryDestination(entryName: string, destinationRoot: string): string {
    const destination = path.resolve(destinationRoot, entryName.replace(/\\/g, '/'));
    if (destination !== destinationRoot && !destination.startsWith(`${destinationRoot}${path.sep}`)) {
        throw new Error(`Cannot extract "${entryName}" outside of the destination directory.`);
    }

    return destination;
}
