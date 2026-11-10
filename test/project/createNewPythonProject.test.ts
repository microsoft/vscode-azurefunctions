/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext, runWithTestActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg, withQuotedArg } from '@microsoft/vscode-processutils';
import * as assert from 'assert';
import * as path from 'path';
import { FuncVersion } from '../../src/FuncVersion';
import { getPythonVersion, getSupportedPythonVersions, isSupportedPythonVersion } from '../../src/commands/createNewProject/pythonSteps/pythonVersion';
import { cpUtils } from '../../src/utils/cpUtils';
import { envUtils } from '../../src/utils/envUtils';
import { getRandomHexString } from '../../src/utils/fs';
import { longRunningTestsEnabled, testFolderPath } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { createAndValidateProject } from './createAndValidateProject';
import { PythonModelVersion, getPythonValidateOptions } from './validateProject';

suite('Create New Python Project', () => {
    test('skip venv', async () => {
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(undefined, FuncVersion.v4, PythonModelVersion.v2), inputs: [/skip/i] });
        });
    });

    test('enter venv', async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
        this.timeout(2 * 60 * 1000);

        const supportedVersions: string[] = await getSupportedPythonVersions(await createTestActionContext(), FuncVersion.v4);
        const alias: string | undefined = await findPythonAlias(supportedVersions);
        if (!alias) {
            const message = 'No supported Python interpreter found for the enter venv test';
            if (envUtils.isEnvironmentVariableSet(process.env.CI) || envUtils.isEnvironmentVariableSet(process.env.TF_BUILD)) {
                throw new Error(message);
            }
            console.log(`${message}; skipping`);
            this.skip();
            return;
        }
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions('.venv', FuncVersion.v4, PythonModelVersion.v2), inputs: [/enter/i, alias] });
        });
    });

    test('no venv', async () => {
        await runWithFuncSetting('createPythonVenv', false, async () => {
            await runWithTestActionContext('createProject', async context => {
                await createAndValidateProject(context, { ...getPythonValidateOptions(undefined, FuncVersion.v4, PythonModelVersion.v2), inputs: [] });
            });
        });
    });

    test('single existing venv', async () => {
        const projectPath: string = path.join(testFolderPath, getRandomHexString());
        const venvName: string = 'testVenv';
        await createTestVenv(projectPath, venvName);
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(venvName, FuncVersion.v4, PythonModelVersion.v2), projectPath, inputs: [] });
        });
    });

    test('multiple existing venvs', async () => {
        const projectPath: string = path.join(testFolderPath, getRandomHexString());
        const venvName: string = 'testVenv2';
        await createTestVenv(projectPath, 'testVenv1');
        await createTestVenv(projectPath, venvName);
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateProject(context, { ...getPythonValidateOptions(venvName, FuncVersion.v4, PythonModelVersion.v2), projectPath, inputs: [venvName] });
        });
    });

    test('finds a supported versioned interpreter after an unsupported default', async () => {
        const versions = new Map([
            ['python3', '3.10.12'],
            ['python', '3.15.2'],
            ['python3.12', '3.12.8'],
        ]);
        const alias = await findPythonAlias(['3.11', '3.12'], {
            platform: 'linux',
            getVersion: async candidate => {
                const version = versions.get(candidate);
                if (!version) {
                    throw new Error('Interpreter not found');
                }
                return version;
            },
            resolveWindowsPython: async () => {
                throw new Error('Windows launcher should not be used');
            },
        });

        assert.strictEqual(alias, 'python3.12');
    });

    test('finds a supported interpreter through the Windows launcher', async () => {
        const executable = 'C:\\Program Files\\Python313\\python.exe';
        const requestedVersions: string[] = [];
        const alias = await findPythonAlias(['3.11', '3.12', '3.13'], {
            platform: 'win32',
            getVersion: async candidate => {
                if (candidate === 'py') {
                    return '3.15.2';
                }
                if (candidate === executable) {
                    return '3.13.4';
                }
                throw new Error('Interpreter not found');
            },
            resolveWindowsPython: async version => {
                requestedVersions.push(version);
                if (version !== '3.13') {
                    throw new Error('Interpreter not found');
                }
                return executable;
            },
        });

        assert.strictEqual(alias, executable);
        assert.deepStrictEqual(requestedVersions, ['3.11', '3.12', '3.13']);
    });

    test('does not select an unsupported interpreter', async () => {
        const alias = await findPythonAlias(['3.11', '3.12'], {
            platform: 'linux',
            getVersion: async () => '3.10.12',
            resolveWindowsPython: async () => {
                throw new Error('Windows launcher should not be used');
            },
        });

        assert.strictEqual(alias, undefined);
    });
});

async function createTestVenv(projectPath: string, venvName: string): Promise<void> {
    if (process.platform === 'win32') {
        await AzExtFsExtra.ensureFile(path.join(projectPath, venvName, 'Scripts', 'activate'));
    } else {
        await AzExtFsExtra.ensureFile(path.join(projectPath, venvName, 'bin', 'activate'));
    }
}

interface PythonAliasDiscovery {
    platform: NodeJS.Platform;
    getVersion(alias: string): Promise<string>;
    resolveWindowsPython(version: string): Promise<string>;
}

async function findPythonAlias(supportedVersions: string[], discovery: PythonAliasDiscovery = {
    platform: process.platform,
    getVersion: getPythonVersion,
    resolveWindowsPython: async version => (await cpUtils.executeCommand(
        undefined,
        undefined,
        'py',
        composeArgs(withArg(`-${version}`, '-c'), withQuotedArg('import sys; print(sys.executable)'))(),
    )).trim(),
}): Promise<string | undefined> {
    const aliases = discovery.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
    aliases.push(...supportedVersions.map(version => `python${version}`));

    for (const alias of aliases) {
        try {
            if (isSupportedPythonVersion(supportedVersions, await discovery.getVersion(alias))) {
                return alias;
            }
        } catch {
            // Try the next interpreter.
        }
    }

    if (discovery.platform === 'win32') {
        for (const version of supportedVersions) {
            try {
                const alias = await discovery.resolveWindowsPython(version);
                if (isSupportedPythonVersion(supportedVersions, await discovery.getVersion(alias))) {
                    return alias;
                }
            } catch {
                // Try the next launcher version.
            }
        }
    }
    return undefined;
}
