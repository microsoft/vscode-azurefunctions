/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractZip } from '../src/utils/zipUtils';

const validZip = 'UEsDBBQAAAAIAKpOEl2386lFDQAAAAsAAAAQAAAAbmVzdGVkL2hlbGxvLnR4dMtIzcnJV6hMLK3KAQBQSwECFAAUAAAACACqThJdt/OpRQ0AAAALAAAAEAAAAAAAAAAAAAAAAAAAAAAAbmVzdGVkL2hlbGxvLnR4dFBLBQYAAAAAAQABAD4AAAA7AAAAAAA=';
const unsafeZip = 'UEsDBBQAAAAIAK5OEl2m/eq1DwAAAAcAAAAOAAAALi4vb3V0c2lkZS50eHTKLy0pzkxJBQAAAP//AwBQSwECFAAUAAAACACuThJdpv3qtQ8AAAAHAAAADgAAAAAAAAAAAAAAAAAAAAAALi4vb3V0c2lkZS50eHRQSwUGAAAAAAEAAQA8AAAAOwAAAAAA';
const sourceOverwriteZip = 'UEsDBBQAAAAIAGJUEl0GgMErEQAAAAkAAAALAAAAYXJjaGl2ZS56aXDKL0stKi/KLEkFAAAA//8DAFBLAQIUABQAAAAIAGJUEl0GgMErEQAAAAkAAAALAAAAAAAAAAAAAAAAAAAAAABhcmNoaXZlLnppcFBLBQYAAAAAAQABADkAAAA6AAAAAAA=';
const symlinkZip = 'UEsDBBQAAAAAAAAAIQD8L29GBgAAAAYAAAAEAAAAbGlua3RhcmdldFBLAQIUAxQAAAAAAAAAIQD8L29GBgAAAAYAAAAEAAAAAAAAAAAAAAD/oQAAAABsaW5rUEsFBgAAAAABAAEAMgAAACgAAAAAAA==';
const dosDirectoryZip = 'UEsDBBQAAAAAAAAAIQAAAAAAAAAAAAAAAAAGAAAAZm9sZGVyUEsDBBQAAAAAAAAAIQB3Efq0CAAAAAgAAAAPAAAAZm9sZGVyL2ZpbGUudHh0Y29udGVudHNQSwECFAAUAAAAAAAAACEAAAAAAAAAAAAAAAAABgAAAAAAAAAAABAAAAAAAAAAZm9sZGVyUEsBAhQAFAAAAAAAAAAhAHcR+rQIAAAACAAAAA8AAAAAAAAAAAAAAIABJAAAAGZvbGRlci9maWxlLnR4dFBLBQYAAAAAAgACAHEAAABZAAAAAAA=';
const linkedPathZip = 'UEsDBBQAAAAIAChbEl2m/eq1CQAAAAcAAAAQAAAAbGlua2VkL2hlbGxvLnR4dMsvLSnOTEkFAFBLAQIUABQAAAAIAChbEl2m/eq1CQAAAAcAAAAQAAAAAAAAAAAAAACAAQAAAABsaW5rZWQvaGVsbG8udHh0UEsFBgAAAAABAAEAPgAAADcAAAAAAA==';

suite('zipUtils', () => {
    let tempDir: string;

    setup(async () => {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-azurefunctions-zip-'));
    });

    teardown(async () => {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    test('extracts nested files', async () => {
        const zipPath = path.join(tempDir, 'valid.zip');
        const destination = path.join(tempDir, 'destination');
        await fs.promises.writeFile(zipPath, Buffer.from(validZip, 'base64'));

        await extractZip(zipPath, destination);

        assert.equal(await fs.promises.readFile(path.join(destination, 'nested', 'hello.txt'), 'utf8'), 'hello yauzl');
    });

    test('rejects entries outside the destination directory', async () => {
        const zipPath = path.join(tempDir, 'unsafe.zip');
        const destination = path.join(tempDir, 'destination');
        await fs.promises.writeFile(zipPath, Buffer.from(unsafeZip, 'base64'));

        await assert.rejects(extractZip(zipPath, destination), /invalid relative path|outside of the destination directory/);
        assert.equal(fs.existsSync(path.join(tempDir, 'outside.txt')), false);
    });

    test('rejects entries that overwrite the source ZIP', async () => {
        const destination = path.join(tempDir, 'destination');
        const zipPath = path.join(destination, 'archive.zip');
        const zipContents = Buffer.from(sourceOverwriteZip, 'base64');
        await fs.promises.mkdir(destination);
        await fs.promises.writeFile(zipPath, zipContents);

        await assert.rejects(extractZip(zipPath, destination), /Cannot overwrite source ZIP/);
        assert.deepEqual(await fs.promises.readFile(zipPath), zipContents);
    });

    test('rejects symbolic link entries', async () => {
        const zipPath = path.join(tempDir, 'symlink.zip');
        await fs.promises.writeFile(zipPath, Buffer.from(symlinkZip, 'base64'));

        await assert.rejects(extractZip(zipPath, path.join(tempDir, 'destination')), /Cannot extract symbolic link/);
    });

    test('extracts MS-DOS directory entries as directories', async () => {
        const zipPath = path.join(tempDir, 'dos-directory.zip');
        const destination = path.join(tempDir, 'destination');
        await fs.promises.writeFile(zipPath, Buffer.from(dosDirectoryZip, 'base64'));

        await extractZip(zipPath, destination);

        assert.equal(await fs.promises.readFile(path.join(destination, 'folder', 'file.txt'), 'utf8'), 'contents');
    });

    test('rejects paths through links outside the destination', async () => {
        const zipPath = path.join(tempDir, 'linked-path.zip');
        const destination = path.join(tempDir, 'destination');
        const outside = path.join(tempDir, 'outside');
        await fs.promises.writeFile(zipPath, Buffer.from(linkedPathZip, 'base64'));
        await fs.promises.mkdir(destination);
        await fs.promises.mkdir(outside);
        await fs.promises.symlink(outside, path.join(destination, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');

        await assert.rejects(extractZip(zipPath, destination), /outside of the destination directory/);
        assert.equal(fs.existsSync(path.join(outside, 'hello.txt')), false);
    });
});
