/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext, initializeWorkflowTelemetry, registerTelemetryHandler, TestOutputChannel, type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri, workspace } from 'vscode';
import { FunctionCreateStepBase } from '../../src/commands/createFunction/FunctionCreateStepBase';
import { type IFunctionWizardContext } from '../../src/commands/createFunction/IFunctionWizardContext';
import { FunctionsTemplateGalleryController } from '../../src/commands/createNewProject/FunctionsTemplateGalleryController';
import { type IProjectWizardContext } from '../../src/commands/createNewProject/IProjectWizardContext';
import { installNodeDependencies } from '../../src/commands/createNewProject/installNodeDependencies';
import { JavaScriptProjectCreateStep } from '../../src/commands/createNewProject/ProjectCreateStep/JavaScriptProjectCreateStep';
import { ProjectCreateStepBase } from '../../src/commands/createNewProject/ProjectCreateStep/ProjectCreateStepBase';
import { TypeScriptProjectCreateStep } from '../../src/commands/createNewProject/ProjectCreateStep/TypeScriptProjectCreateStep';
import { funcVersionSetting, ProjectLanguage } from '../../src/constants';
import { ext } from '../../src/extensionVariables';
import { FuncVersion } from '../../src/FuncVersion';
import { type IProjectTemplate } from '../../src/templates/projectTemplates/IProjectTemplate';
import { TemplateSchemaVersion } from '../../src/templates/TemplateProviderBase';
import { createActivityContext } from '../../src/utils/activityUtils';
import { cpUtils } from '../../src/utils/cpUtils';
import { gitUtils } from '../../src/utils/gitUtils';
import { type ITasksJson } from '../../src/vsCodeConfig/tasks';
import { runWithFuncSetting } from '../runWithSetting';
import { runWithTelemetryContext } from '../utils/runWithTelemetryContext';

suite('Project npm dependencies', () => {
    const originalExecuteCommand = cpUtils.executeCommand;
    const originalExecuteCommandLine = cpUtils.executeCommandLine;
    let originalOutputChannel: typeof ext.outputChannel;
    let projectPath: string;
    let logs: string[];

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc gallery npm '));
        originalOutputChannel = ext.outputChannel;
        logs = [];
        const outputChannel = new TestOutputChannel();
        outputChannel.appendLog = message => { logs.push(message); };
        ext.outputChannel = outputChannel;
        cpUtils.executeCommandLine = async (_output, cwd, command) => {
            assert.strictEqual(cwd, projectPath);
            assert.strictEqual(command, 'git init');
            return '';
        };
    });

    teardown(async () => {
        cpUtils.executeCommand = originalExecuteCommand;
        cpUtils.executeCommandLine = originalExecuteCommandLine;
        ext.outputChannel = originalOutputChannel;
        await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
    });

    const template: IProjectTemplate = {
        id: 'node-dependencies-test',
        displayName: 'Node dependencies test',
        shortDescription: 'Test template',
        categories: [],
        languages: [ProjectLanguage.JavaScript, ProjectLanguage.TypeScript],
        repositoryUrl: 'https://github.com/Azure-Samples/functions-quickstart-typescript-azd',
    };

    function createController(gitInstalled: boolean, events: string[]): FunctionsTemplateGalleryController {
        const controller: FunctionsTemplateGalleryController = Object.create(FunctionsTemplateGalleryController.prototype);
        controller['isGitInstalled'] = async () => gitInstalled;
        controller['sendProgress'] = message => { events.push(message); };
        controller['tryOpenReadme'] = async () => { events.push('readme'); };
        controller['disposePanelIfOpen'] = () => { events.push('dispose'); };
        controller['promptAndOpenProject'] = async () => { events.push('open'); };
        controller['initializeProjectForVSCode'] = async () => { events.push('initialized'); };
        return controller;
    }

    for (const language of Object.values(ProjectLanguage)) {
        test(`initializes ${language} gallery projects before reporting success and opening`, async () => {
            const events: string[] = [];
            const controller = createController(false, events);
            controller['downloadAndExtractZip'] = async (_context, _repository, _branch, destination) => {
                await AzExtFsExtra.ensureDir(destination);
                await AzExtFsExtra.writeJSON(path.join(destination, 'host.json'), { version: '2.0' });
                events.push('downloaded');
            };
            controller['initializeProjectForVSCode'] = async (_context, location, projectLanguage) => {
                assert.strictEqual(location, projectPath);
                assert.strictEqual(projectLanguage, language);
                events.push('initialized');
            };

            await controller['createProject'](template, language, projectPath);

            assert.ok(events.indexOf('downloaded') < events.indexOf('initialized'));
            assert.ok(events.indexOf('initialized') < events.indexOf('readme'));
            assert.ok(events.indexOf('initialized') < events.indexOf('open'));
        });
    }

    for (const gitInstalled of [true, false]) {
        test(`passes the C# function file to the post-create opener after ${gitInstalled ? 'git' : 'zip'} copy`, async () => {
            const events: string[] = [];
            const controller = createController(gitInstalled, events);
            const functionRelativePath = path.join('src', 'api', 'HttpTrigger.cs');
            const writeTemplate = async (directory: string): Promise<void> => {
                const appPath = path.join(directory, 'src', 'api');
                await AzExtFsExtra.ensureDir(appPath);
                await AzExtFsExtra.writeJSON(path.join(appPath, 'host.json'), { version: '2.0' });
                await fs.promises.writeFile(path.join(directory, functionRelativePath), '[Function("HttpTrigger")]');
                await fs.promises.writeFile(path.join(appPath, 'Program.cs'), 'var host = new HostBuilder().Build();');
            };
            controller['downloadAndExtractZip'] = async (_context, _repository, _branch, destination) => writeTemplate(destination);
            cpUtils.executeCommand = async (_output, _cwd, command, args) => {
                assert.strictEqual(command, 'git');
                assert.ok(Array.isArray(args));
                const destination = args[args.length - 1];
                assert.ok(typeof destination === 'string');
                await writeTemplate(destination);
                return '';
            };
            let opened = false;
            controller['promptAndOpenProject'] = async (_context, location, functionFile) => {
                assert.strictEqual(location, projectPath);
                assert.strictEqual(functionFile, Uri.file(path.join(projectPath, functionRelativePath)).fsPath);
                opened = true;
            };

            await controller['createProject'](template, ProjectLanguage.CSharp, projectPath);

            assert.ok(opened);
        });
    }

    for (const language of [ProjectLanguage.JavaScript, ProjectLanguage.TypeScript]) {
        for (const installSucceeds of [true, false]) {
            test(`Classic ${language} ${installSucceeds ? 'installs dependencies' : 'warns and continues when npm fails'}`, async () => {
                const context: IProjectWizardContext = {
                    ...await createTestActionContext(),
                    projectPath,
                    workspacePath: projectPath,
                    workspaceFolder: undefined,
                    version: FuncVersion.v4,
                    language,
                    languageModel: 4,
                    projectTemplateKey: undefined,
                };
                const step = language === ProjectLanguage.JavaScript ? new JavaScriptProjectCreateStep() : new TypeScriptProjectCreateStep();
                step['getHostContent'] = async () => ({ version: '2.0' });
                let installs = 0;
                cpUtils.executeCommand = async (output, cwd, command, args) => {
                    assert.strictEqual(command, 'npm');
                    assert.strictEqual(output, ext.outputChannel);
                    assert.strictEqual(cwd, projectPath);
                    assert.deepStrictEqual(args, composeArgs(withArg('install'))());
                    assert.ok(await AzExtFsExtra.pathExists(path.join(projectPath, 'package.json')));
                    installs++;
                    if (!installSucceeds) {
                        throw new Error('npm unavailable');
                    }
                    return '';
                };

                await step.executeCore(context, { report: () => undefined });

                assert.strictEqual(installs, 1);
                assert.deepStrictEqual(logs, installSucceeds ? [] : ['WARNING: Failed to install packages in your workspace. Run "npm install" manually instead.']);
                if (language === ProjectLanguage.TypeScript) {
                    assert.ok(await AzExtFsExtra.pathExists(path.join(projectPath, 'tsconfig.json')));
                }
            });
        }

        for (const gitInstalled of [true, false]) {
            test(`installs ${language} dependencies after ${gitInstalled ? 'git' : 'zip'} copy and before opening`, async () => {
                const events: string[] = [];
                const controller = createController(gitInstalled, events);
                const writeTemplate = async (directory: string): Promise<void> => {
                    await AzExtFsExtra.ensureDir(directory);
                    await AzExtFsExtra.writeJSON(path.join(directory, 'package.json'), {
                        dependencies: { '@azure/functions': '^4.0.0' },
                    });
                    await AzExtFsExtra.writeJSON(path.join(directory, 'host.json'), { version: '2.0' });
                    events.push('downloaded');
                };
                controller['downloadAndExtractZip'] = async (_context, _repository, _branch, destination) => writeTemplate(destination);
                let installs = 0;
                cpUtils.executeCommand = async (output, cwd, command, args) => {
                    if (command === 'git') {
                        assert.ok(Array.isArray(args));
                        const destination = args[args.length - 1];
                        assert.ok(typeof destination === 'string');
                        await writeTemplate(destination);
                    } else {
                        assert.strictEqual(command, 'npm');
                        assert.strictEqual(output, ext.outputChannel);
                        assert.strictEqual(cwd, Uri.file(projectPath).fsPath);
                        assert.deepStrictEqual(args, composeArgs(withArg('install'))());
                        assert.ok(await AzExtFsExtra.pathExists(path.join(projectPath, 'package.json')));
                        assert.ok(!events.includes('open'));
                        installs++;
                        await new Promise(resolve => setImmediate(resolve));
                        events.push('installed');
                    }
                    return '';
                };

                await controller['createProject'](template, language, projectPath);

                assert.strictEqual(installs, 1);
                assert.ok(events.indexOf('downloaded') < events.indexOf('installed'));
                assert.ok(events.indexOf('installed') < events.indexOf('readme'));
                assert.ok(events.indexOf('installed') < events.indexOf('open'));
            });
        }
    }

    for (const [language, hasPackageJson] of [
        [ProjectLanguage.Python, true],
        [ProjectLanguage.TypeScript, false],
    ] as const) {
        test(`skips npm for ${language} with package.json ${hasPackageJson ? 'present' : 'absent'}`, async () => {
            const events: string[] = [];
            const controller = createController(false, events);
            controller['downloadAndExtractZip'] = async (_context, _repository, _branch, destination) => {
                await AzExtFsExtra.ensureDir(destination);
                await AzExtFsExtra.writeJSON(path.join(destination, 'host.json'), { version: '2.0' });
                if (hasPackageJson) {
                    await AzExtFsExtra.writeJSON(path.join(destination, 'package.json'), {});
                }
            };
            let installs = 0;
            cpUtils.executeCommand = async () => {
                installs++;
                return '';
            };

            await controller['createProject'](template, language, projectPath);

            assert.strictEqual(installs, 0);
            assert.ok(events.includes('open'));
        });
    }

    test('installs each nested Function App but excludes unrelated packages and dependency folders', async () => {
        const events: string[] = [];
        const controller = createController(false, events);
        const appFolders = [path.join('services', 'first'), path.join('services', 'nested', 'second')];
        controller['downloadAndExtractZip'] = async (_context, _repository, _branch, destination) => {
            for (const directory of [
                ...appFolders,
                '.hidden',
                path.join('node_modules', 'dependency'),
                path.join('services', 'node_modules', 'dependency'),
            ]) {
                const appPath = path.join(destination, directory);
                await AzExtFsExtra.ensureDir(appPath);
                await AzExtFsExtra.writeJSON(path.join(appPath, 'host.json'), { version: '2.0' });
                await AzExtFsExtra.writeJSON(path.join(appPath, 'package.json'), {});
            }
            await AzExtFsExtra.writeJSON(path.join(destination, 'package.json'), {});
            await AzExtFsExtra.ensureDir(path.join(destination, 'frontend'));
            await AzExtFsExtra.writeJSON(path.join(destination, 'frontend', 'package.json'), {});
            await AzExtFsExtra.ensureDir(path.join(destination, 'python'));
            await AzExtFsExtra.writeJSON(path.join(destination, 'python', 'host.json'), { version: '2.0' });
        };
        const installedPaths: (string | undefined)[] = [];
        cpUtils.executeCommand = async (_output, cwd, command, args) => {
            assert.strictEqual(command, 'npm');
            assert.deepStrictEqual(args, composeArgs(withArg('install'))());
            installedPaths.push(cwd);
            return '';
        };

        await controller['createProject'](template, ProjectLanguage.TypeScript, projectPath);

        assert.deepStrictEqual(installedPaths.sort(), appFolders.map(folder => Uri.file(path.join(projectPath, folder)).fsPath).sort());
        assert.ok(events.includes('open'));
    });

    for (const [language, insideWorkspace] of [
        [ProjectLanguage.JavaScript, false],
        [ProjectLanguage.TypeScript, false],
        [ProjectLanguage.JavaScript, true],
        [ProjectLanguage.TypeScript, true],
    ] as const) {
        test(`initializes nested ${language} gallery tasks ${insideWorkspace ? 'inside' : 'outside'} an existing workspace`, async () => {
            let parentConfig: Array<{ filePath: string; contents: string | undefined }> = [];
            if (insideWorkspace) {
                const parentFolder = workspace.workspaceFolders?.[0];
                assert.ok(parentFolder);
                parentConfig = await Promise.all(['tasks.json', 'launch.json', 'settings.json'].map(async name => {
                    const filePath = path.join(parentFolder.uri.fsPath, '.vscode', name);
                    return { filePath, contents: await AzExtFsExtra.pathExists(filePath) ? await fs.promises.readFile(filePath, 'utf8') : undefined };
                }));
                await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
                projectPath = await fs.promises.mkdtemp(path.join(parentFolder.uri.fsPath, 'gallery-'));
            }
            const events: string[] = [];
            const controller = createController(false, events);
            const customTask = { type: 'shell', label: 'custom task', command: 'echo custom' };
            const copiedTasks = [
                { type: 'shell', label: 'npm install (functions)', command: 'npm install' },
                { type: 'func', label: 'func: host start', command: 'host start', dependsOn: 'npm install (functions)' },
                customTask,
            ];
            controller['downloadAndExtractZip'] = async (_context, _repository, _branch, destination) => {
                const appPath = path.join(destination, 'src');
                await AzExtFsExtra.ensureDir(appPath);
                await AzExtFsExtra.writeJSON(path.join(appPath, 'host.json'), { version: '2.0' });
                await AzExtFsExtra.writeJSON(path.join(appPath, 'package.json'), {
                    dependencies: { '@azure/functions': '^4.0.0' },
                    scripts: { build: 'tsc', watch: 'tsc --watch' },
                });
                await AzExtFsExtra.ensureDir(path.join(destination, '.vscode'));
                await AzExtFsExtra.writeJSON(path.join(destination, '.vscode', 'tasks.json'), { version: '2.0.0', tasks: copiedTasks });
            };
            cpUtils.executeCommand = async () => '';
            controller['initializeProjectForVSCode'] = async (context, location, projectLanguage) => {
                const { ui } = await createTestActionContext();
                context.ui = ui;
                await ui.runWithInputs(['Overwrite'], async () =>
                    await FunctionsTemplateGalleryController.prototype['initializeProjectForVSCode'].call(controller, context, location, projectLanguage));
                events.push('initialized');
            };

            await runWithFuncSetting(funcVersionSetting, FuncVersion.v4, async () =>
                await controller['createProject'](template, language, projectPath));

            const tasksJson = await AzExtFsExtra.readJSON<ITasksJson>(path.join(projectPath, '.vscode', 'tasks.json'));
            const tasks = tasksJson.tasks ?? [];
            const functionTasks = tasks.filter(task => task.label !== customTask.label);
            assert.ok(functionTasks.length >= 3);
            for (const task of functionTasks) {
                assert.strictEqual(task.options?.cwd, '${workspaceFolder}/src', task.label);
            }
            assert.deepStrictEqual(tasks.find(task => task.label === customTask.label), customTask);
            assert.ok(events.indexOf('initialized') < events.indexOf('open'));
            for (const { filePath, contents } of parentConfig) {
                assert.strictEqual(await AzExtFsExtra.pathExists(filePath) ? await fs.promises.readFile(filePath, 'utf8') : undefined, contents);
            }
        });
    }

    for (const language of [ProjectLanguage.JavaScript, ProjectLanguage.Python, ProjectLanguage.CSharp, ProjectLanguage.PowerShell]) {
        for (const subpath of ['.', 'src']) {
            test(`writes ${language} gallery configuration for a ${subpath === '.' ? 'root-level' : 'nested'} Function App without package.json`, async () => {
                const events: string[] = [];
                const controller = createController(false, events);
                const customTask = { type: 'shell', label: 'custom task', command: 'echo custom' };
                controller['downloadAndExtractZip'] = async (_context, _repository, _branch, destination) => {
                    const appPath = path.join(destination, subpath);
                    await AzExtFsExtra.ensureDir(appPath);
                    await AzExtFsExtra.writeJSON(path.join(appPath, 'host.json'), { version: '2.0' });
                    if (language === ProjectLanguage.CSharp) {
                        await fs.promises.writeFile(path.join(appPath, 'test.csproj'), '<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework><AzureFunctionsVersion>v4</AzureFunctionsVersion></PropertyGroup></Project>');
                    } else if (language === ProjectLanguage.Python) {
                        await fs.promises.writeFile(path.join(appPath, 'function_app.py'), '');
                    }
                    await AzExtFsExtra.ensureDir(path.join(destination, '.vscode'));
                    await AzExtFsExtra.writeJSON(path.join(destination, '.vscode', 'tasks.json'), { version: '2.0.0', tasks: [customTask] });
                };
                controller['initializeProjectForVSCode'] = async (context, location, projectLanguage) => {
                    const { ui } = await createTestActionContext();
                    context.ui = ui;
                    await ui.runWithInputs([], async () =>
                        await FunctionsTemplateGalleryController.prototype['initializeProjectForVSCode'].call(controller, context, location, projectLanguage));
                    events.push('initialized');
                };
                cpUtils.executeCommand = async () => { throw new Error('npm must not run without a Node package.json'); };

                await runWithFuncSetting('createPythonVenv', false, async () =>
                    await runWithFuncSetting(funcVersionSetting, FuncVersion.v4, async () =>
                        await controller['createProject'](template, language, projectPath)));

                const vscodePath = path.join(projectPath, '.vscode');
                const settings = await AzExtFsExtra.readJSON<Record<string, unknown>>(path.join(vscodePath, 'settings.json'));
                assert.strictEqual(settings['azureFunctions.projectLanguage'], language);
                assert.ok(await AzExtFsExtra.pathExists(path.join(vscodePath, 'launch.json')));
                const tasks = (await AzExtFsExtra.readJSON<ITasksJson>(path.join(vscodePath, 'tasks.json'))).tasks ?? [];
                assert.deepStrictEqual(tasks.find(task => task.label === customTask.label), customTask);
                const functionTasks = tasks.filter(task => task.label !== customTask.label);
                assert.ok(functionTasks.length > 0);
                for (const task of functionTasks) {
                    if (subpath === 'src') {
                        assert.ok(task.options?.cwd?.startsWith('${workspaceFolder}/src'), task.label);
                    } else {
                        assert.ok(!task.options?.cwd?.includes('/src'), task.label);
                    }
                }
                assert.ok(events.indexOf('initialized') < events.indexOf('open'));
            });
        }
    }

    test('Gallery installer records success and uses the project directory with spaces', async () => {
        const context = await createTestActionContext();
        cpUtils.executeCommand = async (output, cwd, command, args) => {
            assert.strictEqual(output, ext.outputChannel);
            assert.strictEqual(cwd, projectPath);
            assert.strictEqual(command, 'npm');
            assert.deepStrictEqual(args, composeArgs(withArg('install'))());
            return '';
        };

        await installNodeDependencies(context, projectPath);

        assert.strictEqual(context.telemetry.properties.npmInstallSucceeded, 'true');
        assert.deepStrictEqual(logs, []);
    });

    test('gallery creation emits its own root with an observed creation stage', async () => {
        const contexts: IActionContext[] = [];
        const telemetry = registerTelemetryHandler(context => {
            if (context.callbackId === 'azureFunctions.templateGallery.createProject') {
                contexts.push(context);
            }
        });
        const controller = createController(false, []);
        controller['downloadAndExtractZip'] = async (_context, _repository, _branch, destination) => {
            await AzExtFsExtra.ensureDir(destination);
        };
        try {
            await controller['createProject'](template, ProjectLanguage.Python, projectPath);
        } finally {
            telemetry.dispose();
        }
        assert.strictEqual(contexts.length, 1);
        const { properties, measurements } = contexts[0].telemetry;
        assert.strictEqual(properties.workflow, 'createProject');
        assert.strictEqual(properties.command, 'templateGallery.createProject');
        assert.strictEqual(properties.isWorkflowRoot, 'true');
        assert.strictEqual(properties.outcome, 'succeeded');
        assert.ok(typeof measurements.workflowDuration === 'number' && measurements.workflowDuration >= 0);
        assert.ok(!JSON.stringify({ properties, measurements }).includes(projectPath));
    });

    test('classic started event copies legacy fields without aliasing or counting another root', async () => {
        const context: IProjectWizardContext = Object.assign(await createTestActionContext(), {
            projectPath, workspacePath: projectPath, workspaceFolder: undefined,
            version: FuncVersion.v4, language: ProjectLanguage.JavaScript, projectTemplateKey: undefined,
        });
        initializeWorkflowTelemetry(context, { workflow: 'createProject', command: 'createNewProject' });
        context.telemetry.properties.legacyProjectSignal = 'present';
        const children: IActionContext[] = [];
        const handler = registerTelemetryHandler(child => {
            if (child.callbackId === 'azureFunctions.createNewProjectStarted') {
                children.push(child);
            }
        });
        const originalGitInstalled = gitUtils.isGitInstalled;
        gitUtils.isGitInstalled = async () => false;
        class ProjectStep extends ProjectCreateStepBase {
            public async executeCore(wizardContext: IProjectWizardContext): Promise<void> {
                wizardContext.telemetry.properties.fixtureCreated = 'true';
            }
        }
        try {
            await runWithTelemetryContext(context, async () => new ProjectStep().execute(context, { report: () => undefined }));
        } finally {
            gitUtils.isGitInstalled = originalGitInstalled;
            handler.dispose();
        }
        assert.strictEqual(children.length, 1);
        const child = children[0];
        assert.notStrictEqual(child.telemetry, context.telemetry);
        assert.notStrictEqual(child.telemetry.properties, context.telemetry.properties);
        assert.strictEqual(child.telemetry.properties.legacyProjectSignal, 'present');
        assert.strictEqual(child.telemetry.properties.fixtureCreated, 'true');
        assert.strictEqual(child.telemetry.properties.workflowRunId, context.telemetry.properties.workflowRunId);
        assert.strictEqual(child.telemetry.properties.parentAttemptId, context.telemetry.properties.attemptId);
        assert.strictEqual(child.telemetry.properties.isWorkflowRoot, 'false');
        assert.notStrictEqual(child.telemetry.properties.attemptId, context.telemetry.properties.attemptId);
    });

    test('nested function creation retains the project root and correlates its post-create child', async () => {
        const context: IFunctionWizardContext = Object.assign(await createTestActionContext(), await createActivityContext(), {
            projectPath, workspacePath: projectPath, workspaceFolder: undefined,
            version: FuncVersion.v4, language: ProjectLanguage.JavaScript, projectTemplateKey: undefined,
            functionTemplate: {
                id: 'testHttpTrigger', name: 'HttpTrigger', language: ProjectLanguage.JavaScript,
                isHttpTrigger: true, isTimerTrigger: false, isMcpTrigger: false, templateSchemaVersion: TemplateSchemaVersion.v1,
            },
        });
        initializeWorkflowTelemetry(context, { workflow: 'createProject', command: 'createNewProject' });
        const children: IActionContext[] = [];
        const handler = registerTelemetryHandler(child => {
            if (child.callbackId === 'postFunctionCreate') {
                children.push(child);
            }
        });
        class FunctionStep extends FunctionCreateStepBase<IFunctionWizardContext> {
            public async executeCore(): Promise<string> { return ''; }
        }
        try {
            await runWithTelemetryContext(context, async () => new FunctionStep().execute(context, { report: () => undefined }));
        } finally {
            handler.dispose();
        }
        assert.strictEqual(context.telemetry.properties.stage, 'workflow');
        assert.strictEqual(context.telemetry.properties.isWorkflowRoot, 'true');
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].telemetry.properties.workflowRunId, context.telemetry.properties.workflowRunId);
        assert.strictEqual(children[0].telemetry.properties.parentAttemptId, context.telemetry.properties.attemptId);
        assert.strictEqual(children[0].telemetry.properties.isWorkflowRoot, 'false');
    });

    test('Gallery installer records optional failure and explains manual recovery', async () => {
        const context = await createTestActionContext();
        cpUtils.executeCommand = async () => { throw new Error('npm unavailable'); };

        await installNodeDependencies(context, projectPath);

        assert.strictEqual(context.telemetry.properties.npmInstallSucceeded, 'false');
        assert.deepStrictEqual(logs, ['WARNING: Failed to install packages in your workspace. Run "npm install" manually instead.']);
    });

    test('a later successful install does not mask failure in another app', async () => {
        const context = await createTestActionContext();
        cpUtils.executeCommand = async () => { throw new Error('npm unavailable'); };
        await installNodeDependencies(context, projectPath);
        cpUtils.executeCommand = async () => '';

        await installNodeDependencies(context, projectPath);

        assert.strictEqual(context.telemetry.properties.npmInstallSucceeded, 'false');
        assert.strictEqual(logs.length, 1);
    });
});
