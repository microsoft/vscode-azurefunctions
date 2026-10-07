/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerClient } from '@microsoft/vscode-container-client';
import { composeArgs, withQuotedArg } from '@microsoft/vscode-processutils';
import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DockerCliContainerClient } from '../src/tree/durableTaskScheduler/ContainerClient';

suite('DockerCliContainerClient', () => {
    test('preserves quoted arguments without a shell', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc container client '));
        const originalListContainers = DockerClient.prototype.listContainers;
        try {
            const script = path.join(directory, 'echo arguments.cjs');
            await fs.writeFile(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
            const expectedArgs = ['{{json .}}', 'literal & value'];
            DockerClient.prototype.listContainers = async () => ({
                command: process.execPath,
                args: composeArgs(withQuotedArg(script, ...expectedArgs))(),
                parse: async output => {
                    assert.deepStrictEqual(JSON.parse(output), expectedArgs);
                    return [];
                }
            });

            assert.deepStrictEqual(await new DockerCliContainerClient().getContainers(), []);
        } finally {
            DockerClient.prototype.listContainers = originalListContainers;
            await fs.rm(directory, { recursive: true, force: true });
        }
    });
});
