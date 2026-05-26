/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as path from 'path';
import { packageJsonFileName } from '../src/constants';
import { tryAddNodeJsDependency } from '../src/utils/nodeJsUtils';
import { testFolderPath } from './global.test';

suite('nodeJsUtils', () => {
    test('tryAddNodeJsDependency adds missing dependency', async () => {
        const projectPath = path.join(testFolderPath, 'nodeJsUtils-adds');
        await AzExtFsExtra.ensureDir(projectPath);
        const packageJsonPath = path.join(projectPath, packageJsonFileName);

        await AzExtFsExtra.writeJSON(packageJsonPath, { name: 'test', version: '1.0.0', dependencies: { '@azure/functions': '^4.0.0' } });
        await tryAddNodeJsDependency(projectPath, 'durable-functions', '^3.0.0');

        const packageJson = await AzExtFsExtra.readJSON(packageJsonPath) as { dependencies?: Record<string, string> };
        assert.strictEqual(packageJson.dependencies?.['durable-functions'], '^3.0.0');
        assert.strictEqual(packageJson.dependencies?.['@azure/functions'], '^4.0.0');
    });

    test('tryAddNodeJsDependency does not overwrite existing dependency version', async () => {
        const projectPath = path.join(testFolderPath, 'nodeJsUtils-keeps-existing');
        await AzExtFsExtra.ensureDir(projectPath);
        const packageJsonPath = path.join(projectPath, packageJsonFileName);

        await AzExtFsExtra.writeJSON(packageJsonPath, { name: 'test', version: '1.0.0', dependencies: { 'durable-functions': '^3.3.1' } });
        await tryAddNodeJsDependency(projectPath, 'durable-functions', '^3.0.0');

        const packageJson = await AzExtFsExtra.readJSON(packageJsonPath) as { dependencies?: Record<string, string> };
        assert.strictEqual(packageJson.dependencies?.['durable-functions'], '^3.3.1');
    });
});
