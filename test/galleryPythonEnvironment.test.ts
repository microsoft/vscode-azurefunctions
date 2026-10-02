/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext, testGlobalSetup, TestOutputChannel } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ShellExecution, Task, Uri, type WorkspaceFolder } from 'vscode';
import { type IProjectWizardContext } from '../src/commands/createNewProject/IProjectWizardContext';
import { PythonVenvCreateStep } from '../src/commands/createNewProject/pythonSteps/PythonVenvCreateStep';
import { PythonInitVSCodeStep } from '../src/commands/initProjectForVSCode/InitVSCodeStep/PythonInitVSCodeStep';
import { ProjectLanguage } from '../src/constants';
import { BallerinaDebugProvider } from '../src/debug/BallerinaDebugProvider';
import { FuncTaskProvider } from '../src/debug/FuncTaskProvider';
import { JavaDebugProvider } from '../src/debug/JavaDebugProvider';
import { NodeDebugProvider } from '../src/debug/NodeDebugProvider';
import { PowerShellDebugProvider } from '../src/debug/PowerShellDebugProvider';
import { PythonDebugProvider } from '../src/debug/PythonDebugProvider';
import { ext } from '../src/extensionVariables';
import { FuncVersion } from '../src/FuncVersion';
import { cpUtils } from '../src/utils/cpUtils';
import { isPathEqual } from '../src/utils/fs';
import { venvUtils } from '../src/utils/venvUtils';
import { convertToFunctionsTaskLabel, type ITasksJson } from '../src/vsCodeConfig/tasks';
import { runWithFuncSetting } from './runWithSetting';

const repositoryRoot = path.resolve(__dirname, '..');

suite('Gallery Python environment regressions', () => {
    suiteSetup(() => {
        testGlobalSetup();
        ext.outputChannel = new TestOutputChannel();
    });

    for (const subpath of ['', 'src', path.join('src', 'McpWeatherApp')]) {
        test(`venv creation installs requirements in the selected project: ${subpath || 'root'}`, async () => {
            await runWithTestActionContext('testVenvCreate', async context => {
                const projectPath = path.join(repositoryRoot, 'unused-python-project', subpath);
                const originalExecute = cpUtils.executeCommand;
                const originalTryExecute = cpUtils.tryExecuteCommand;
                const originalInstall = venvUtils.runPipInstallCommandIfPossible;
                let installed = false;
                try {
                    cpUtils.tryExecuteCommand = async () => ({
                        code: 0, cmdOutput: 'Python 3.12.0', cmdOutputIncludingStderr: 'Python 3.12.0', formattedCommandLine: ''
                    });
                    cpUtils.executeCommand = async (_output, cwd, command) => {
                        assert.strictEqual(cwd, projectPath);
                        assert.strictEqual(command, 'python');
                        return '';
                    };
                    venvUtils.runPipInstallCommandIfPossible = async (cwd, venvName) => {
                        assert.strictEqual(cwd, projectPath);
                        assert.strictEqual(venvName, '.venv');
                        installed = true;
                    };
                    await new PythonVenvCreateStep().execute({ ...context, projectPath, venvName: '.venv', pythonAlias: 'python', version: FuncVersion.v4 }, { report: () => undefined });
                    assert.ok(installed);
                } finally {
                    cpUtils.executeCommand = originalExecute;
                    cpUtils.tryExecuteCommand = originalTryExecute;
                    venvUtils.runPipInstallCommandIfPossible = originalInstall;
                }
            });
        });

        test(`initialization aligns pip and host cwd without replacing unrelated files: ${subpath || 'root'}`, async () => {
            const workspacePath = await fs.mkdtemp(path.join(repositoryRoot, '.gallery-python-test-'));
            try {
                const projectPath = path.join(workspacePath, subpath);
                await fs.mkdir(projectPath, { recursive: true });
                await fs.writeFile(path.join(projectPath, 'local.settings.json'), '{"preserved":true}');
                await fs.mkdir(path.join(workspacePath, '.vscode'));
                await fs.writeFile(path.join(workspacePath, '.vscode', 'settings.json'), '{"editor.tabSize":7}');
                await fs.writeFile(path.join(workspacePath, '.vscode', 'tasks.json'), JSON.stringify({
                    version: '2.0.0', tasks: [{ label: 'preserved-task', type: 'shell', command: 'echo preserved', problemMatcher: [] }]
                }));
                await runWithTestActionContext('testPythonInit', async context => {
                    const wizardContext: IProjectWizardContext & { venvName: string } = {
                        ...context, workspacePath, projectPath, workspaceFolder: undefined, projectTemplateKey: undefined,
                        language: ProjectLanguage.Python, version: FuncVersion.v4, venvName: '.venv'
                    };
                    await new PythonInitVSCodeStep().execute(wizardContext);
                });
                const tasks: ITasksJson = JSON.parse(await fs.readFile(path.join(workspacePath, '.vscode', 'tasks.json'), 'utf8'));
                const pip = tasks.tasks?.find(task => task.label === convertToFunctionsTaskLabel('pip install'));
                const host = tasks.tasks?.find(task => task.label === 'func: host start');
                assert.ok(pip);
                assert.ok(host);
                const expectedCwd = subpath ? '${workspaceFolder}/' + subpath.split(path.sep).join('/') : undefined;
                assert.strictEqual(pip.options?.cwd, expectedCwd);
                assert.strictEqual(host.options?.cwd, expectedCwd);
                assert.ok(tasks.tasks?.some(task => task.label === 'preserved-task'));
                const settings = JSON.parse(await fs.readFile(path.join(workspacePath, '.vscode', 'settings.json'), 'utf8'));
                assert.strictEqual(settings['editor.tabSize'], 7);
                assert.strictEqual(settings['azureFunctions.pythonVenv'], '.venv');
                if (subpath === path.join('src', 'McpWeatherApp')) {
                    assert.strictEqual(settings['azureFunctions.projectSubpath'], 'src/McpWeatherApp');
                }
                assert.strictEqual(await fs.readFile(path.join(projectPath, 'local.settings.json'), 'utf8'), '{"preserved":true}');
            } finally {
                await fs.rm(workspacePath, { recursive: true, force: true });
            }
        });

        test(`resolved func tasks use the selected project root: ${subpath || 'root'}`, async () => {
            const workspacePath = await fs.mkdtemp(path.join(repositoryRoot, '.gallery-task-test-'));
            try {
                const projectPath = path.join(workspacePath, subpath);
                await fs.mkdir(projectPath, { recursive: true });
                await fs.writeFile(path.join(projectPath, 'host.json'), '{"version":"2.0"}');
                const folder: WorkspaceFolder = { uri: Uri.file(workspacePath), name: 'test', index: 0 };
                class TestPythonDebugProvider extends PythonDebugProvider {
                    public async getWorkerArgValue(): Promise<string> {
                        return '-m debugpy';
                    }
                }
                const provider = new FuncTaskProvider(new NodeDebugProvider(), new TestPythonDebugProvider(), new JavaDebugProvider(), new BallerinaDebugProvider(), new PowerShellDebugProvider());
                await runWithFuncSetting('projectLanguage', ProjectLanguage.Python, async () => {
                    await runWithFuncSetting('projectSubpath', subpath || undefined, async () => {
                        await runWithFuncSetting('pythonVenv', '.venv', async () => {
                            const definition = { type: 'func', command: 'host start' };
                            const task = await provider.resolveTask(new Task(definition, folder, 'host start', 'func'));
                            assert.ok(task?.execution instanceof ShellExecution);
                            assert.ok(task.execution.options?.cwd && isPathEqual(task.execution.options.cwd, projectPath));
                            assert.strictEqual(task.definition, definition);
                            assert.ok(task.execution.commandLine?.includes('.venv'));
                            assert.ok(task.execution.commandLine?.includes('host start'));
                        });
                    });
                });
            } finally {
                await fs.rm(workspacePath, { recursive: true, force: true });
            }
        });
    }
});
