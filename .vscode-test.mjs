/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from '@vscode/test-cli';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    files: 'dist/test/**/*.test.js',
    workspaceFolder: path.resolve(__dirname, 'test', 'test.code-workspace'),
    mocha: {
        ui: 'tdd',
        color: true,
        timeout: 20000,
        reporter: 'mocha-multi-reporters',
        reporterOptions: {
            reporterEnabled: 'spec, mocha-junit-reporter',
            mochaJunitReporterReporterOptions: {
                mochaFile: path.resolve(__dirname, 'test-results.xml')
            }
        }
    },
    extensionDevelopmentPath: __dirname,
    launchArgs: ['--disable-workspace-trust'],
    installExtensions: [
        'ms-vscode.azure-account',
        'ms-azuretools.vscode-azureresourcegroups',
        'ms-python.python'
    ]
});
