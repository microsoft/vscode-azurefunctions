/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FuncVersion, getRandomHexString } from '../../extension.bundle';
import { longRunningTestsEnabled, testFolderPath } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { createAndValidateProject } from './createAndValidateProject';
import { PythonModelVersion, getPythonValidateOptions } from './validateProject';

suite.only('Create New Python Project (Model V1)', () => {
    test('skip venv', async () => {
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(undefined, FuncVersion.v4), inputs: [/Model V1/, /skip/i] });
        });
    });

    test('enter venv', async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
        this.timeout(2 * 60 * 1000);

        const alias: string = process.platform === 'win32' ? 'py -3.9' : 'python3.9';
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions('.venv', FuncVersion.v4), inputs: [/Model V1/, /enter/i, alias] });
        });
    });

    test('no venv', async () => {
        await runWithFuncSetting('createPythonVenv', false, async () => {
            await runWithTestActionContext('createProject', async context => {
                await createAndValidateProject(context, { ...getPythonValidateOptions(undefined, FuncVersion.v4), inputs: [/Model V1/] });
            });
        });
    });

    test('single existing venv', async () => {
        const projectPath: string = path.join(testFolderPath, getRandomHexString());
        const venvName: string = 'testVenv';
        await createTestVenv(projectPath, venvName);
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(venvName, FuncVersion.v4), projectPath, inputs: [/Model V1/] });
        });
    });

    test('multiple existing venvs', async () => {
        const projectPath: string = path.join(testFolderPath, getRandomHexString());
        const venvName: string = 'testVenv2';
        await createTestVenv(projectPath, 'testVenv1');
        await createTestVenv(projectPath, venvName);
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(venvName, FuncVersion.v4), projectPath, inputs: [/Model V1/, venvName] });
        });
    });
});

suite.only('Create New Python Project (Model V2)', () => {
    test('skip venv', async () => {
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(undefined, FuncVersion.v4, PythonModelVersion.v2), inputs: [/Model V2/, /skip/i] });
        });
    });

    test('enter venv', async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
        this.timeout(2 * 60 * 1000);

        const alias: string = process.platform === 'win32' ? 'py -3.9' : 'python3.9';
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions('.venv', FuncVersion.v4, PythonModelVersion.v2), inputs: [/Model V2/, /enter/i, alias] });
        });
    });

    test('no venv', async () => {
        await runWithFuncSetting('createPythonVenv', false, async () => {
            await runWithTestActionContext('createProject', async context => {
                await createAndValidateProject(context, { ...getPythonValidateOptions(undefined, FuncVersion.v4, PythonModelVersion.v2), inputs: [/Model V2/] });
            });
        });
    });

    test('single existing venv', async () => {
        const projectPath: string = path.join(testFolderPath, getRandomHexString());
        const venvName: string = 'testVenv';
        await createTestVenv(projectPath, venvName);
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(venvName, FuncVersion.v4, PythonModelVersion.v2), projectPath, inputs: [/Model V2/] });
        });
    });

    test('multiple existing venvs', async () => {
        const projectPath: string = path.join(testFolderPath, getRandomHexString());
        const venvName: string = 'testVenv2';
        await createTestVenv(projectPath, 'testVenv1');
        await createTestVenv(projectPath, venvName);
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(venvName, FuncVersion.v4, PythonModelVersion.v2), projectPath, inputs: [/Model V2/, venvName] });
        });
    });
});

async function createTestVenv(projectPath: string, venvName: string): Promise<void> {
    if (process.platform === 'win32') {
        await AzExtFsExtra.ensureFile(path.join(projectPath, venvName, 'Scripts', 'activate'));
    } else {
        await AzExtFsExtra.ensureFile(path.join(projectPath, venvName, 'bin', 'activate'));
    }
}
