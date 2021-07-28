/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { cpUtils, delay, ext, getGlobalSetting, getRandomHexString, pythonVenvSetting, updateGlobalSetting, venvUtils } from '../extension.bundle';
import { longRunningTestsEnabled, testFolderPath } from './global.test';
import { runWithSetting } from './runWithSetting';

suite('venvUtils', () => {
    const command: string = 'do a thing';
    const venvName: string = '.venv';
    const testFolder: string = path.join(testFolderPath, 'venvUtils');
    let oldVenvValue: string | undefined;

    suiteSetup(async function (this: Mocha.Context): Promise<void> {
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

    test('venvExists true', async function (this: Mocha.Context): Promise<void> {
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

    test('runCommandInVenv', async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        await venvUtils.runCommandInVenv('python --version', venvName, testFolder);
    });

    test('convertToVenvCommand Windows powershell', async function (this: Mocha.Context): Promise<void> {
        if (process.platform !== 'win32') {
            this.skip();
        }
        await runWithWindowsTerminal('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', () => {
            assert.equal(venvUtils.convertToVenvCommand(command, testFolder), '.venv\\Scripts\\activate ; do a thing');
            assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'win32'), '.venv\\Scripts\\python -m do a thing');
        });
    });

    test('convertToVenvCommand Windows pwsh', async function (this: Mocha.Context): Promise<void> {
        if (process.platform !== 'win32') {
            this.skip();
        }
        await runWithWindowsTerminal('C:\\Program Files\\PowerShell\\7\\pwsh.exe', () => {
            assert.equal(venvUtils.convertToVenvCommand(command, testFolder), '.venv\\Scripts\\activate ; do a thing');
            assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'win32'), '.venv\\Scripts\\python -m do a thing');
        });
    });

    test('convertToVenvCommand Windows cmd', async function (this: Mocha.Context): Promise<void> {
        if (process.platform !== 'win32') {
            this.skip();
        }
        await runWithWindowsTerminal('C:\\Windows\\System32\\cmd.exe', () => {
            assert.equal(venvUtils.convertToVenvCommand(command, testFolder), '.venv\\Scripts\\activate && do a thing');
            assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'win32'), '.venv\\Scripts\\python -m do a thing');
        });
    });

    test('convertToVenvCommand Windows git bash', async function (this: Mocha.Context): Promise<void> {
        if (process.platform !== 'win32') {
            this.skip();
        }

        await runWithWindowsTerminal('C:\\Program Files\\Git\\bin\\bash.exe', () => {
            assert.equal(venvUtils.convertToVenvCommand(command, testFolder), '. .venv/Scripts/activate && do a thing');
            assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'win32'), '.venv/Scripts/python -m do a thing');
        });
    });

    test('convertToVenvCommand Mac', async function (this: Mocha.Context): Promise<void> {
        if (process.platform !== 'darwin') {
            this.skip();
        }
        assert.equal(venvUtils.convertToVenvCommand(command, testFolder), '. .venv/bin/activate && do a thing');
        assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'darwin'), '.venv/bin/python -m do a thing');
    });

    test('convertToVenvCommand Linux', async function (this: Mocha.Context): Promise<void> {
        if (process.platform !== 'linux') {
            this.skip();
        }
        assert.equal(venvUtils.convertToVenvCommand(command, testFolder), '. .venv/bin/activate && do a thing');
        assert.equal(venvUtils.convertToVenvPythonCommand(command, venvName, 'linux'), '.venv/bin/python -m do a thing');
    });
});

async function runWithWindowsTerminal(terminalPath: string, callback: () => void): Promise<void> {
    if (!(await fse.pathExists(terminalPath))) {
        throw new Error(`Terminal path cannot be set because it does not exist: ${terminalPath}`)
    }

    const profileName = getRandomHexString();
    const terminalProfiles = { [profileName]: { path: terminalPath } };
    await runWithSetting('terminal.integrated.profiles.windows', terminalProfiles, async () => {
        await runWithSetting('terminal.integrated.defaultProfile.windows', profileName, async () => {
            // https://github.com/microsoft/vscode/issues/121760
            // "it takes up to 2 seconds after changing a profile to apply the changes by design"
            await delay(5 * 1000);
            callback();
        });
    });
}
