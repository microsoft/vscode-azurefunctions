/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { goModFileName } from '../src/constants';
import { isGoProject } from '../src/commands/initProjectForVSCode/detectProjectLanguage';

suite('detectProjectLanguage — Go', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsazfn-go-detect-'));
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(tmpDir, { recursive: true, useTrash: false });
    });

    test('goModFileName is "go.mod"', () => {
        // Pinned because the detect function uses this constant; renaming it silently
        // would break Go project auto-detection.
        assert.strictEqual(goModFileName, 'go.mod');
    });

    test('isGoProject returns true when go.mod is present at the project root', async () => {
        await AzExtFsExtra.writeFile(path.join(tmpDir, goModFileName), 'module example.com/test\n\ngo 1.22\n');
        assert.strictEqual(await isGoProject(tmpDir), true);
    });

    test('isGoProject returns false when go.mod is missing', async () => {
        assert.strictEqual(await isGoProject(tmpDir), false);
    });

    test('isGoProject does not walk into subdirectories', async () => {
        // go.mod must be at the project root — a nested go.mod should not count.
        const nested = path.join(tmpDir, 'sub');
        await AzExtFsExtra.ensureDir(nested);
        await AzExtFsExtra.writeFile(path.join(nested, goModFileName), 'module example.com/nested\n');
        assert.strictEqual(await isGoProject(tmpDir), false);
    });
});
