/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { runTests } from 'vscode-test';

async function main(): Promise<void> {
    try {
        const repoRoot: string = path.resolve(__dirname, '..', '..');
        await runTests({
            extensionDevelopmentPath: repoRoot,
            launchArgs: [
                path.resolve(repoRoot, 'test', 'test.code-workspace'),
                '--disable-workspace-trust'
            ],
            extensionTestsPath: path.resolve(repoRoot, 'dist', 'test', 'index'),
            extensionTestsEnv: {
                DEBUGTELEMETRY: 'v',
                MOCHA_timeout: '20000'
            }
        });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

void main();
