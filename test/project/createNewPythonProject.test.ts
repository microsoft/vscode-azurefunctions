/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { runWithTestActionContext } from 'vscode-azureextensiondev';
import { FuncVersion, getRandomHexString } from '../../extension.bundle';
import { longRunningTestsEnabled, testFolderPath } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { createAndValidateProject } from './createAndValidateProject';
import { getPythonValidateOptions } from './validateProject';

suite('Create New Python Project', () => {
    test('skip venv', async () => {
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(undefined, FuncVersion.v2), inputs: [/skip/i] });
        });
    });

    test('enter venv', async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
        this.timeout(2 * 60 * 1000);

        const alias: string = process.platform === 'win32' ? 'py -3.6' : 'python3.6';
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions('.venv', FuncVersion.v2), inputs: [/enter/i, alias] });
        });
    });

    test('no venv', async () => {
        await runWithFuncSetting('createPythonVenv', false, async () => {
            await runWithTestActionContext('createProject', async context => {
                await createAndValidateProject(context, { ...getPythonValidateOptions(undefined, FuncVersion.v2) });
            });
        });
    });

    test('single existing venv', async () => {
        const projectPath: string = path.join(testFolderPath, getRandomHexString());
        const venvName: string = 'testVenv';
        await createTestVenv(projectPath, venvName);
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(venvName, FuncVersion.v2), projectPath });
        });
    });

    test('multiple existing venvs', async () => {
        const projectPath: string = path.join(testFolderPath, getRandomHexString());
        const venvName: string = 'testVenv2';
        await createTestVenv(projectPath, 'testVenv1');
        await createTestVenv(projectPath, venvName);
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(venvName, FuncVersion.v2), projectPath, inputs: [venvName] });
        });
    });
});

async function createTestVenv(projectPath: string, venvName: string): Promise<void> {
    if (process.platform === 'win32') {
        await fse.ensureFile(path.join(projectPath, venvName, 'Scripts', 'activate'));
    } else {
        await fse.ensureFile(path.join(projectPath, venvName, 'bin', 'activate'));
    }
}
