/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { IHookCallbackContext, ITestCallbackContext } from 'mocha';
import * as path from 'path';
import { cpUtils, ext, getGlobalSetting, pythonVenvSetting, updateGlobalSetting, venvUtils } from '../extension.bundle';
import { longRunningTestsEnabled, testFolderPath } from './global.test';
import { runWithSetting } from './runWithSetting';

suite('venvUtils', () => {
    const command: string = 'do a thing';
    const terminalSetting: string = 'terminal.integrated.shell.windows';
    const venvName: string = '.venv';
    const testFolder: string = path.join(testFolderPath, 'venvUtils');
    let oldVenvValue: string | undefined;

    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        oldVenvValue = getGlobalSetting(pythonVenvSetting);
        await updateGlobalSetting(pythonVenvSetting, venvName);

        if (longRunningTestsEnabled) {
            this.timeout(60 * 1000);
            await fse.ensureDir(testFolder);
            const pyAlias: string = process.platform === 'win32' ? 'py' : 'python3';
            await cpUtils.executeCommand(ext.outputChannel, testFolder, pyAlias, '-m', 'venv', venvName);
        }
    });

    suiteTeardown(async () => {
        await updateGlobalSetting(pythonVenvSetting, oldVenvValue);
    });

    test('venvExists true', async function (this: ITestCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        assert.equal(await venvUtils.venvExists(venvName, testFolder), true);
    });

    test('venvExists false', async () => {
        assert.equal(await venvUtils.venvExists('nonExistentPath', testFolder), false);

        const fileName: string = 'notAVenvFile';
        await fse.ensureFile(path.join(testFolder, fileName));
        assert.equal(await venvUtils.venvExists(fileName, testFolder), false);

        const folderName: string = 'notAVenvFolder';
        await fse.ensureDir(path.join(testFolder, folderName));
        assert.equal(await venvUtils.venvExists(folderName, testFolder), false);
    });

    test('runCommandInVenv', async function (this: ITestCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        await venvUtils.runCommandInVenv('python --version', venvName, testFolder);
    });

    test('convertToVenvCommand Windows powershell', async () => {
        await runWithSetting(terminalSetting, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', async () => {
            assert.equal(venvUtils.convertToVenvCommand(command, testFolder, 'win32'), '.venv\\Scripts\\activate ; do a thing');
            assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'win32'), '.venv\\Scripts\\python -m do a thing');
        });
    });

    test('convertToVenvCommand Windows pwsh', async () => {
        await runWithSetting(terminalSetting, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\pwsh.exe', async () => {
            assert.equal(venvUtils.convertToVenvCommand(command, testFolder, 'win32'), '.venv\\Scripts\\activate ; do a thing');
            assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'win32'), '.venv\\Scripts\\python -m do a thing');
        });
    });

    test('convertToVenvCommand Windows cmd', async () => {
        await runWithSetting(terminalSetting, 'C:\\Windows\\System32\\cmd.exe', async () => {
            assert.equal(venvUtils.convertToVenvCommand(command, testFolder, 'win32'), '.venv\\Scripts\\activate && do a thing');
            assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'win32'), '.venv\\Scripts\\python -m do a thing');
        });
    });

    test('convertToVenvCommand Windows git bash', async () => {
        await runWithSetting(terminalSetting, 'C:\\Program Files\\Git\\bin\\bash.exe', async () => {
            assert.equal(venvUtils.convertToVenvCommand(command, testFolder, 'win32'), '. .venv/Scripts/activate && do a thing');
            assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'win32'), '.venv/Scripts/python -m do a thing');
        });
    });

    test('convertToVenvCommand Windows bash', async () => {
        await runWithSetting(terminalSetting, 'C:\\Windows\\System32\\bash.exe', async () => {
            assert.equal(venvUtils.convertToVenvCommand(command, testFolder, 'win32'), '. .venv/Scripts/activate && do a thing');
            assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'win32'), '.venv/Scripts/python -m do a thing');
        });
    });

    test('convertToVenvCommand Mac', async () => {
        assert.equal(venvUtils.convertToVenvCommand(command, testFolder, 'darwin'), '. .venv/bin/activate && do a thing');
        assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'darwin'), '.venv/bin/python -m do a thing');
    });

    test('convertToVenvCommand Linux', async () => {
        assert.equal(venvUtils.convertToVenvCommand(command, testFolder, 'linux'), '. .venv/bin/activate && do a thing');
        assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'linux'), '.venv/bin/python -m do a thing');
    });
});
