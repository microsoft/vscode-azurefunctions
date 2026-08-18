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
});
