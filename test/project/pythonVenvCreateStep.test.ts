/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import { type CommandLineArgs } from '@microsoft/vscode-processutils';
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { FuncVersion } from '../../src/FuncVersion';
import { type IPythonVenvWizardContext } from '../../src/commands/createNewProject/pythonSteps/IPythonVenvWizardContext';
import { PythonVenvCreateStep } from '../../src/commands/createNewProject/pythonSteps/PythonVenvCreateStep';
import { getPythonVersion } from '../../src/commands/createNewProject/pythonSteps/pythonVersion';
import { cpUtils } from '../../src/utils/cpUtils';
import { venvUtils } from '../../src/utils/venvUtils';

suite('Python virtual environment creation', () => {
    test('installs requirements in the project after creating the selected environment', async () => {
        const context: IPythonVenvWizardContext = {
            ...await createTestActionContext(),
            projectPath: path.join(os.tmpdir(), 'python project with spaces'),
            version: FuncVersion.v4,
            pythonAlias: 'py -3.12',
            venvName: 'custom-venv',
        };
        const originalExecuteCommand = cpUtils.executeCommand;
        const originalTryExecuteCommand = cpUtils.tryExecuteCommand;
        const originalInstall = venvUtils.runPipInstallCommandIfPossible;
        const calls: string[] = [];

        try {
            cpUtils.tryExecuteCommand = async () => ({
                code: 0,
                cmdOutput: 'Python 3.12.10',
                cmdOutputIncludingStderr: 'Python 3.12.10',
                formattedCommandLine: 'py -3.12 --version',
            });
            cpUtils.executeCommand = async (_output, cwd, command, args) => {
                assert.strictEqual(cwd, context.projectPath);
                assert.strictEqual(command, 'py');
                assert.deepStrictEqual(getArgumentValues(args), ['-3.12', '-m', 'venv', context.venvName]);
                calls.push('create');
                return '';
            };
            venvUtils.runPipInstallCommandIfPossible = async (projectPath, venvName) => {
                assert.deepStrictEqual(calls, ['create']);
                assert.strictEqual(projectPath, context.projectPath);
                assert.strictEqual(venvName, context.venvName);
                calls.push('install');
            };

            await new PythonVenvCreateStep().execute(context, { report: () => undefined });

            assert.deepStrictEqual(calls, ['create', 'install']);
        } finally {
            cpUtils.executeCommand = originalExecuteCommand;
            cpUtils.tryExecuteCommand = originalTryExecuteCommand;
            venvUtils.runPipInstallCommandIfPossible = originalInstall;
        }
    });

    test('validates a versioned Python launcher using separate executable arguments', async () => {
        const originalTryExecuteCommand = cpUtils.tryExecuteCommand;
        let command = '';
        let args: CommandLineArgs = [];

        try {
            cpUtils.tryExecuteCommand = async (_output, _cwd, executable, commandArgs) => {
                command = executable;
                args = commandArgs;
                return {
                    code: 0,
                    cmdOutput: 'Python 3.12.10',
                    cmdOutputIncludingStderr: 'Python 3.12.10',
                    formattedCommandLine: 'py -3.12 --version',
                };
            };

            assert.strictEqual(await getPythonVersion('py -3.12'), '3.12.10');
            assert.strictEqual(command, 'py');
            assert.deepStrictEqual(getArgumentValues(args), ['-3.12', '--version']);
        } finally {
            cpUtils.tryExecuteCommand = originalTryExecuteCommand;
        }
    });

    function getArgumentValues(args: CommandLineArgs): string[] {
        return args.map(arg => typeof arg === 'string' ? arg : arg.value);
    }

    test('does not recreate an existing environment or create one without an interpreter', async () => {
        const context: IPythonVenvWizardContext = {
            ...await createTestActionContext(),
            projectPath: os.tmpdir(),
            version: FuncVersion.v4,
            pythonAlias: 'python',
        };
        const step = new PythonVenvCreateStep();

        assert.ok(step.shouldExecute(context));
        assert.ok(!step.shouldExecute({ ...context, useExistingVenv: true }));
        assert.ok(!step.shouldExecute({ ...context, pythonAlias: undefined }));
    });
});
