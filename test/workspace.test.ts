/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Uri, type WorkspaceFolder } from 'vscode';
import { findFiles } from '../src/utils/workspace';

suite('workspace.findFiles', () => {
    let tempDir: string;
    let projectPath: string;

    setup(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vsazfn-find-files-'));
        projectPath = path.join(tempDir, 'project [test] (local)+');
        await AzExtFsExtra.ensureDir(projectPath);
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(tempDir, { recursive: true, useTrash: false });
    });

    test('finds files outside the workspace with special characters in the base path', async () => {
        const projectFile = path.join(projectPath, 'app.csproj');
        await AzExtFsExtra.writeFile(projectFile, '');
        await AzExtFsExtra.ensureDir(path.join(projectPath, 'directory.csproj'));
        await AzExtFsExtra.ensureDir(path.join(projectPath, 'nested'));
        await AzExtFsExtra.writeFile(path.join(projectPath, 'nested', 'other.csproj'), '');

        const files = await findFiles(projectPath, '*.csproj');

        assert.deepStrictEqual(files.map(file => file.fsPath), [Uri.file(projectFile).fsPath]);
    });

    test('accepts a workspace folder and limits single-level patterns', async () => {
        const hostFile = path.join(projectPath, 'app', 'host.json');
        await AzExtFsExtra.ensureDir(path.dirname(hostFile));
        await AzExtFsExtra.writeFile(hostFile, '{}');
        await AzExtFsExtra.writeFile(path.join(projectPath, 'host.json'), '{}');
        await AzExtFsExtra.ensureDir(path.join(projectPath, 'app', 'nested'));
        await AzExtFsExtra.writeFile(path.join(projectPath, 'app', 'nested', 'host.json'), '{}');
        const folder: WorkspaceFolder = { uri: Uri.file(projectPath), name: 'project', index: 0 };

        const files = await findFiles(folder, '*/host.json');

        assert.deepStrictEqual(files.map(file => file.fsPath), [Uri.file(hostFile).fsPath]);
    });

    test('finds recursive matches but excludes node_modules and hidden directories', async () => {
        const expectedFiles = [
            path.join(projectPath, 'host.json'),
            path.join(projectPath, 'app', 'nested', 'host.json')
        ];
        const excludedFiles = [
            path.join(projectPath, 'node_modules', 'dependency', 'host.json'),
            path.join(projectPath, 'app', 'node_modules', 'dependency', 'host.json'),
            path.join(projectPath, '.hidden', 'host.json')
        ];
        for (const file of [...expectedFiles, ...excludedFiles]) {
            await AzExtFsExtra.ensureDir(path.dirname(file));
            await AzExtFsExtra.writeFile(file, '{}');
        }

        const files = await findFiles(projectPath, '**/host.json');

        assert.deepStrictEqual(files.map(file => file.fsPath).sort(), expectedFiles.map(file => Uri.file(file).fsPath).sort());
    });

    test('returns no matches for a missing file', async () => {
        assert.deepStrictEqual(await findFiles(projectPath, '*.fsproj'), []);
    });
});
