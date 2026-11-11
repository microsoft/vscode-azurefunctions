/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CancellationTokenSource, Uri, workspace } from 'vscode';
import { ProjectTemplateCreator, type ConnectorProjectCreationOptions } from '../../src/commands/createNewProject/ProjectTemplateCreator';
import { ProjectPrepareStep, type IProjectPrepareContext } from '../../src/commands/createNewProject/ProjectPrepareStep';
import { findPollingConnectorBindings } from '../../src/connectorTrigger/connectorTriggerBindings';
import { getGenericConnectorTriggerTemplate } from '../../src/connectorTrigger/genericConnectorTriggerTemplates';
import { materializeGenericConnectorTriggerProject } from '../../src/connectorTrigger/materializeGenericConnectorTriggerProject';
import { ProjectLanguage, projectOpenBehaviorSetting } from '../../src/constants';
import { type IProjectTemplate } from '../../src/templates/projectTemplates/IProjectTemplate';
import { cpUtils } from '../../src/utils/cpUtils';
import { nonNullValue } from '../../src/utils/nonNull';
import { getGlobalSetting, updateGlobalSetting } from '../../src/vsCodeConfig/settings';

suite('Connector project batch creation', () => {
    let root: string;
    let source: string;
    let destination: string;
    let cancellation: CancellationTokenSource;
    let options: ConnectorProjectCreationOptions;

    setup(async () => {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc-connector-batch-'));
        source = path.join(root, 'source');
        destination = path.join(root, 'destination');
        await AzExtFsExtra.ensureDir(source);
        await AzExtFsExtra.ensureDir(destination);
        cancellation = new CancellationTokenSource();
        options = {
            selection: { connectorId: 'custom', operationIds: ['FirstEvent', 'SecondEvent'] },
            cancellationToken: cancellation.token,
        };
    });

    teardown(async () => {
        cancellation.dispose();
        await AzExtFsExtra.deleteResource(root, { recursive: true, useTrash: false });
    });

    for (const language of [ProjectLanguage.CSharp, ProjectLanguage.TypeScript, ProjectLanguage.Python]) {
        test(`bootstraps the ${language} generic starter once for the complete batch`, async () => {
            await AzExtFsExtra.writeFile(path.join(source, 'host.json'), '{"version":"2.0"}');
            await AzExtFsExtra.writeJSON(path.join(source, 'local.settings.json'), {
                IsEncrypted: false, Values: { FUNCTIONS_WORKER_RUNTIME: 'kept', AzureBlobConnection: 'sample' },
            });
            if (language === ProjectLanguage.CSharp) {
                await AzExtFsExtra.writeFile(path.join(source, 'GenericFunctions.cs'), 'class GenericFunctions {}');
                await AzExtFsExtra.writeFile(path.join(source, 'sample.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
<ItemGroup><PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="1.0.0" /></ItemGroup>
</Project>`);
            } else if (language === ProjectLanguage.TypeScript) {
                await AzExtFsExtra.ensureDir(path.join(source, 'src', 'functions'));
                await AzExtFsExtra.writeFile(path.join(source, 'src', 'functions', 'generic.ts'), 'sample');
                await AzExtFsExtra.writeJSON(path.join(source, 'package.json'), { name: 'generic' });
                await AzExtFsExtra.writeJSON(path.join(source, 'package-lock.json'), { name: 'generic', packages: { '': { name: 'generic' } } });
            } else {
                await AzExtFsExtra.writeFile(path.join(source, 'function_app.py'), 'sample');
                await AzExtFsExtra.writeFile(path.join(source, 'requirements.txt'), 'azure-functions>=2.2.0b4\n');
            }

            await materializeGenericConnectorTriggerProject(source, language, options.selection);

            const bindings = await findPollingConnectorBindings(source);
            assert.deepStrictEqual(bindings.map(binding => binding.functionName).sort(), ['FirstEvent', 'SecondEvent']);
            assert.strictEqual(new Set(bindings.map(binding => binding.triggerConfigSettingName)).size, 2);
            const settings = await AzExtFsExtra.readJSON<{ Values: Record<string, string> }>(path.join(source, 'local.settings.json'));
            assert.strictEqual(settings.Values.FUNCTIONS_WORKER_RUNTIME, 'kept');
            assert.strictEqual(settings.Values.AzureBlobConnection, undefined);
            assert.match(await AzExtFsExtra.readFile(path.join(source, 'README.md')), /FirstEventTriggerConfigName/);
        });
    }

    test('rejects specialized aliases that collide with another selected event before downloading', async () => {
        const template: IProjectTemplate = {
            id: 'specialized', displayName: 'Specialized', shortDescription: '', categories: [],
            languages: [ProjectLanguage.TypeScript], repositoryUrl: 'https://example.invalid/template',
            connectorTrigger: { operations: [{
                operationId: 'FirstEventV3', functionName: 'FirstEvent', ownedPaths: ['first.ts'],
            }] },
        };
        options.selection = { connectorId: 'custom', operationIds: ['FirstEventV3', 'FirstEvent'] };
        await assert.rejects(new ProjectTemplateCreator().createProject(
            await createTestActionContext(), template, ProjectLanguage.TypeScript, destination, options,
        ), /same template function/);
        assert.deepStrictEqual(await fs.promises.readdir(destination), []);
    });

    for (const { projectSubpath, childOpen } of [
        { projectSubpath: undefined, childOpen: true },
        { projectSubpath: 'existing', childOpen: true },
        { projectSubpath: undefined, childOpen: false },
    ]) {
        test(`initializes the selected ${childOpen ? 'open' : 'unopened'} child instead of the parent's ${projectSubpath ? 'configured' : 'root'} project`, async function () {
            this.timeout(30_000);
            const parent = path.join(root, 'parent');
            destination = path.join(parent, 'connector');
            const existingProject = projectSubpath ? path.join(parent, projectSubpath) : parent;
            await AzExtFsExtra.ensureDir(path.join(parent, '.vscode'));
            await AzExtFsExtra.ensureDir(existingProject);
            await AzExtFsExtra.ensureDir(destination);
            await AzExtFsExtra.writeJSON(path.join(existingProject, 'host.json'), { version: '2.0' });
            await AzExtFsExtra.writeFile(path.join(existingProject, 'function_app.py'), 'import azure.functions as func\n');
            await AzExtFsExtra.writeFile(path.join(existingProject, 'requirements.txt'), 'azure-functions\n');
            await AzExtFsExtra.writeJSON(path.join(parent, '.vscode', 'settings.json'), {
                'azureFunctions.projectLanguage': ProjectLanguage.Python,
                'azureFunctions.projectSubpath': projectSubpath,
                'azureFunctions.deploySubpath': projectSubpath || '.',
                'azureFunctions.preDeployTask': 'func: pack',
            });
            await AzExtFsExtra.writeJSON(path.join(parent, '.vscode', 'tasks.json'), {
                version: '2.0.0', tasks: [{ type: 'func', command: 'host start', problemMatcher: '$func-python-watch' }],
            });
            await AzExtFsExtra.writeJSON(path.join(parent, '.vscode', 'launch.json'), {
                version: '0.2.0', configurations: [{ name: 'Python', type: 'debugpy', request: 'attach' }],
            });
            const configFiles = ['settings.json', 'tasks.json', 'launch.json'];
            const originalConfig = await Promise.all(configFiles.map(file => fs.promises.readFile(path.join(parent, '.vscode', file))));
            await AzExtFsExtra.writeJSON(path.join(source, 'host.json'), { version: '2.0' });
            await AzExtFsExtra.writeJSON(path.join(source, 'local.settings.json'), {
                IsEncrypted: false, Values: { FUNCTIONS_WORKER_RUNTIME: 'node' },
            });
            await AzExtFsExtra.ensureDir(path.join(source, 'src', 'functions'));
            await AzExtFsExtra.writeJSON(path.join(source, 'package.json'), {
                name: 'generic', dependencies: { '@azure/functions': '^4.0.0' }, scripts: { clean: 'rimraf dist' },
            });
            const creator = new ProjectTemplateCreator();
            // Keep project materialization and VS Code initialization real, without network or npm subprocesses.
            Object.defineProperty(creator, 'downloadTemplate', { value: async () => source });
            const template = nonNullValue(getGenericConnectorTriggerTemplate(ProjectLanguage.TypeScript));
            const folderIndex = workspace.workspaceFolders?.length ?? 0;
            const added = new Promise<void>(resolve => {
                const listener = workspace.onDidChangeWorkspaceFolders(() => {
                    listener.dispose();
                    resolve();
                });
            });
            const folders = [{ uri: Uri.file(parent) }, ...(childOpen ? [{ uri: Uri.file(destination) }] : [])];
            assert.ok(workspace.updateWorkspaceFolders(folderIndex, 0, ...folders));
            await added;
            const oldOpenBehavior = getGlobalSetting(projectOpenBehaviorSetting);
            const originalExecuteCommand = cpUtils.executeCommand;
            const preparationCommands: Parameters<typeof cpUtils.executeCommand>[] = [];
            try {
                cpUtils.executeCommand = async (...args) => {
                    if (args[2] === 'npm') {
                        preparationCommands.push(args);
                        return '';
                    }
                    return originalExecuteCommand(...args);
                };
                await updateGlobalSetting(projectOpenBehaviorSetting, 'DontOpen');
                await creator.createProject(await createTestActionContext(), template, ProjectLanguage.TypeScript, destination, options);

                assert.deepStrictEqual(preparationCommands.map(([, cwd, command]) => ({ cwd, command })), [
                    { cwd: destination, command: 'npm' },
                    { cwd: destination, command: 'npm' },
                ]);
                assert.deepStrictEqual(preparationCommands[1][3], ['run', 'build']);
                for (const [index, file] of configFiles.entries()) {
                    assert.deepStrictEqual(await fs.promises.readFile(path.join(parent, '.vscode', file)), originalConfig[index], `Parent ${file} changed`);
                }
                assert.deepStrictEqual((await fs.promises.readdir(path.join(parent, '.vscode'))).sort(), configFiles.sort());
                const settings = await AzExtFsExtra.readJSON<Record<string, unknown>>(path.join(destination, '.vscode', 'settings.json'));
                assert.strictEqual(settings['azureFunctions.projectLanguage'], ProjectLanguage.TypeScript);
                assert.strictEqual(settings['azureFunctions.projectLanguageModel'], 4);
                assert.strictEqual(settings['azureFunctions.deploySubpath'], '.');
                assert.strictEqual(settings['azureFunctions.preDeployTask'], 'npm prune (functions)');
                const tasks = await AzExtFsExtra.readJSON<{ tasks: { label: string; options?: { cwd?: string } }[] }>(path.join(destination, '.vscode', 'tasks.json'));
                assert.ok(tasks.tasks.some(task => task.label === 'npm build (functions)'));
                assert.ok(tasks.tasks.every(task => !task.options?.cwd));
                const launch = await AzExtFsExtra.readJSON<{ configurations: { type: string }[] }>(path.join(destination, '.vscode', 'launch.json'));
                assert.ok(launch.configurations.some(config => config.type === 'node'));
                assert.ok(await AzExtFsExtra.pathExists(path.join(destination, '.vscode', 'extensions.json')));
                assert.strictEqual((await findPollingConnectorBindings(destination)).length, 2);
            } finally {
                cpUtils.executeCommand = originalExecuteCommand;
                await updateGlobalSetting(projectOpenBehaviorSetting, oldOpenBehavior);
                const removed = new Promise<void>(resolve => {
                    const listener = workspace.onDidChangeWorkspaceFolders(() => {
                        listener.dispose();
                        resolve();
                    });
                });
                assert.ok(workspace.updateWorkspaceFolders(folderIndex, folders.length));
                await removed;
            }
        });
    }

    test('creates the C# starter for the .NET runtime selected before the picker opened', async function () {
        this.timeout(30_000);
        await AzExtFsExtra.writeJSON(path.join(source, 'host.json'), { version: '2.0' });
        await AzExtFsExtra.writeJSON(path.join(source, 'local.settings.json'), {
            IsEncrypted: false, Values: { FUNCTIONS_WORKER_RUNTIME: 'dotnet-isolated' },
        });
        await AzExtFsExtra.writeFile(path.join(source, 'GenericFunctions.cs'), 'class GenericFunctions {}');
        await AzExtFsExtra.writeFile(path.join(source, 'Program.cs'), 'class Program {}');
        await AzExtFsExtra.writeFile(path.join(source, 'starter.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <AzureFunctionsVersion>v4</AzureFunctionsVersion>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="2.52.0" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="2.1.0" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="0.2.0-alpha" />
  </ItemGroup>
</Project>`);
        const creator = new ProjectTemplateCreator();
        Object.defineProperty(creator, 'downloadTemplate', { value: async () => source });
        const template = nonNullValue(getGenericConnectorTriggerTemplate(ProjectLanguage.CSharp));
        const oldOpenBehavior = getGlobalSetting(projectOpenBehaviorSetting);
        const originalExecuteCommand = cpUtils.executeCommand;
        const dotnetCommands: string[][] = [];
        try {
            cpUtils.executeCommand = async (...args) => {
                if (args[2] === 'dotnet') {
                    dotnetCommands.push(args[3] as string[]);
                    return '';
                }
                return originalExecuteCommand(...args);
            };
            await updateGlobalSetting(projectOpenBehaviorSetting, 'DontOpen');
            await creator.createProject(await createTestActionContext(), template, ProjectLanguage.CSharp, destination,
                { ...options, targetFramework: 'net8.0' });
        } finally {
            cpUtils.executeCommand = originalExecuteCommand;
            await updateGlobalSetting(projectOpenBehaviorSetting, oldOpenBehavior);
        }

        const csproj = await AzExtFsExtra.readFile(path.join(destination, 'starter.csproj'));
        assert.match(csproj, /<TargetFramework>net8\.0<\/TargetFramework>/);
        assert.doesNotMatch(csproj, /net10/);
        assert.match(csproj, /Extensions\.Connector" Version="1\.0\.0"/);
        const settings = await AzExtFsExtra.readJSON<Record<string, unknown>>(path.join(destination, '.vscode', 'settings.json'));
        assert.strictEqual(settings['azureFunctions.deploySubpath'], 'bin/Release/net8.0/publish');
        assert.deepStrictEqual(dotnetCommands, [['build']]);
        assert.strictEqual((await findPollingConnectorBindings(destination)).length, 2);
    });

    test('rejects a C# starter that cannot be retargeted before copying any file', async () => {
        await AzExtFsExtra.writeJSON(path.join(source, 'host.json'), { version: '2.0' });
        await AzExtFsExtra.writeFile(path.join(source, 'GenericFunctions.cs'), 'class GenericFunctions {}');
        await AzExtFsExtra.writeFile(path.join(source, 'starter.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
<PropertyGroup><TargetFrameworks>net8.0;net10.0</TargetFrameworks></PropertyGroup>
<ItemGroup><PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="1.0.0" /></ItemGroup>
</Project>`);
        const creator = new ProjectTemplateCreator();
        Object.defineProperty(creator, 'downloadTemplate', { value: async () => source });
        const template = nonNullValue(getGenericConnectorTriggerTemplate(ProjectLanguage.CSharp));
        await assert.rejects(creator.createProject(await createTestActionContext(), template, ProjectLanguage.CSharp, destination,
            { ...options, targetFramework: 'net8.0' }), /could not be configured for net8\.0/);
        assert.deepStrictEqual(await fs.promises.readdir(destination), []);
    });

    test('rejects destination conflicts before copying any file', async () => {
        await AzExtFsExtra.writeFile(path.join(source, 'first.txt'), 'new');
        await AzExtFsExtra.writeFile(path.join(source, 'second.txt'), 'template');
        await AzExtFsExtra.writeFile(path.join(destination, 'second.txt'), 'existing');

        await assert.rejects(copyPreparedProject(source, destination, options), /conflicting project files/);

        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(destination, 'first.txt')), false);
        assert.strictEqual(await AzExtFsExtra.readFile(path.join(destination, 'second.txt')), 'existing');
    });

    test('recovers a partial matching copy without overwriting settings or VS Code files', async () => {
        await AzExtFsExtra.ensureDir(path.join(source, '.vscode'));
        await AzExtFsExtra.ensureDir(path.join(destination, '.vscode'));
        await AzExtFsExtra.writeFile(path.join(source, 'first.txt'), 'already copied');
        await AzExtFsExtra.writeFile(path.join(destination, 'first.txt'), 'already copied');
        await AzExtFsExtra.writeFile(path.join(source, 'second.txt'), 'remaining');
        await AzExtFsExtra.writeFile(path.join(source, 'local.settings.json'), '{"Values":{}}');
        const settings = '{"Values":{"ExistingConfig":"configured"}}';
        await AzExtFsExtra.writeFile(path.join(destination, 'local.settings.json'), settings);
        await AzExtFsExtra.writeFile(path.join(source, '.vscode', 'settings.json'), '{"template":true}');
        await AzExtFsExtra.writeFile(path.join(destination, '.vscode', 'settings.json'), '{"custom":true}');

        await copyPreparedProject(source, destination, options);
        await copyPreparedProject(source, destination, options);

        assert.strictEqual(await AzExtFsExtra.readFile(path.join(destination, 'second.txt')), 'remaining');
        assert.strictEqual(await AzExtFsExtra.readFile(path.join(destination, 'local.settings.json')), settings);
        assert.strictEqual(await AzExtFsExtra.readFile(path.join(destination, '.vscode', 'settings.json')), '{"custom":true}');
    });

    test('compares existing binary assets byte-for-byte before copying', async () => {
        await fs.promises.writeFile(path.join(source, 'asset.bin'), Buffer.from([0x80]));
        await fs.promises.writeFile(path.join(destination, 'asset.bin'), Buffer.from([0x81]));
        await AzExtFsExtra.writeFile(path.join(source, 'remaining.txt'), 'remaining');

        await assert.rejects(copyPreparedProject(source, destination, options), /conflicting project files/);
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(destination, 'remaining.txt')), false);
        assert.deepStrictEqual(await fs.promises.readFile(path.join(destination, 'asset.bin')), Buffer.from([0x81]));

        await fs.promises.writeFile(path.join(destination, 'asset.bin'), Buffer.from([0x80]));
        await copyPreparedProject(source, destination, options);
        assert.strictEqual(await AzExtFsExtra.readFile(path.join(destination, 'remaining.txt')), 'remaining');
    });

    test('preserves an installed lockfile when retrying the same project', async () => {
        await AzExtFsExtra.writeJSON(path.join(source, 'package.json'), { name: 'same' });
        await AzExtFsExtra.writeJSON(path.join(destination, 'package.json'), { name: 'same' });
        await AzExtFsExtra.writeJSON(path.join(source, 'package-lock.json'), { name: 'starter' });
        await AzExtFsExtra.writeJSON(path.join(destination, 'package-lock.json'), { name: 'installed' });

        await copyPreparedProject(source, destination, options);

        assert.deepStrictEqual(await AzExtFsExtra.readJSON(path.join(destination, 'package-lock.json')), { name: 'installed' });
    });

    test('does not accept an installed lockfile as a reason to overwrite a different manifest', async () => {
        await AzExtFsExtra.writeJSON(path.join(source, 'package.json'), { name: 'new' });
        await AzExtFsExtra.writeJSON(path.join(destination, 'package.json'), { name: 'existing' });
        await AzExtFsExtra.writeJSON(path.join(source, 'package-lock.json'), { name: 'new' });
        await AzExtFsExtra.writeJSON(path.join(destination, 'package-lock.json'), { name: 'installed' });

        await assert.rejects(copyPreparedProject(source, destination, options), /conflicting project files/);
        assert.deepStrictEqual(await AzExtFsExtra.readJSON(path.join(destination, 'package.json')), { name: 'existing' });
    });

    test('retains a cancelled partial copy and completes it safely on retry', async () => {
        await AzExtFsExtra.writeFile(path.join(source, 'first.txt'), 'first');
        await AzExtFsExtra.writeFile(path.join(source, 'second.txt'), 'second');
        let cancellationChecks = 0;
        options.cancellationToken = {
            get isCancellationRequested(): boolean { return ++cancellationChecks === 3; },
            onCancellationRequested: cancellation.token.onCancellationRequested,
        };

        await assert.rejects(copyPreparedProject(source, destination, options), /cancel/i);
        assert.strictEqual((await fs.promises.readdir(destination)).length, 1);

        options.cancellationToken = cancellation.token;
        await copyPreparedProject(source, destination, options);
        assert.strictEqual(await AzExtFsExtra.readFile(path.join(destination, 'first.txt')), 'first');
        assert.strictEqual(await AzExtFsExtra.readFile(path.join(destination, 'second.txt')), 'second');
    });

    suite('Connector project preparation', () => {
        let context: IProjectPrepareContext;
        let cancellation: CancellationTokenSource;
        let originalExecuteCommand: typeof cpUtils.executeCommand;
        let commands: { cwd: string | undefined; command: string; args: unknown }[];

        setup(async () => {
            cancellation = new CancellationTokenSource();
            context = Object.assign(await createTestActionContext(), {
                projectPath: path.join(os.tmpdir(), 'connector project'),
                language: ProjectLanguage.TypeScript,
                cancellationToken: cancellation.token,
            });
            commands = [];
            originalExecuteCommand = cpUtils.executeCommand;
            cpUtils.executeCommand = async (_output, cwd, command, args) => {
                commands.push({ cwd, command, args });
                return '';
            };
        });

        teardown(() => {
            cpUtils.executeCommand = originalExecuteCommand;
            cancellation.dispose();
        });

        test('installs before building TypeScript and skips a completed preparation', async () => {
            const step = new ProjectPrepareStep();
            assert.strictEqual(step.shouldExecute(context), true);
            await step.execute(context, { report: () => undefined });
            assert.deepStrictEqual(commands.map(command => command.command), ['npm', 'npm']);
            assert.deepStrictEqual(commands[1].args, ['run', 'build']);
            assert.ok(commands.every(command => command.cwd === context.projectPath));
            assert.strictEqual(step.shouldExecute(context), false);
        });

        test('only installs dependencies for JavaScript', async () => {
            context.language = ProjectLanguage.JavaScript;
            await new ProjectPrepareStep().execute(context, { report: () => undefined });
            assert.deepStrictEqual(commands.map(command => command.command), ['npm']);
        });

        test('restores dependencies as part of the C# build', async () => {
            context.language = ProjectLanguage.CSharp;
            await new ProjectPrepareStep().execute(context, { report: () => undefined });
            assert.deepStrictEqual(commands, [{ cwd: context.projectPath, command: 'dotnet', args: ['build'] }]);
        });

        test('installs Python requirements with the selected environment interpreter', async () => {
            context.language = ProjectLanguage.Python;
            context.venvName = 'custom environment';
            await new ProjectPrepareStep().execute(context, { report: () => undefined });
            assert.deepStrictEqual(commands, [{
                cwd: context.projectPath,
                command: path.join(context.projectPath, context.venvName, process.platform === 'win32' ? 'Scripts' : 'bin',
                    process.platform === 'win32' ? 'python.exe' : 'python'),
                args: ['-m', 'pip', 'install', '-r', 'requirements.txt'],
            }]);
        });

        test('warns without installing globally when the Python environment is skipped', async () => {
            context.language = ProjectLanguage.Python;
            let warning: string | undefined;
            context.ui.showWarningMessage = async message => { warning = message; return undefined; };
            await new ProjectPrepareStep().execute(context, { report: () => undefined });
            assert.match(warning ?? '', /dependencies have not been installed/);
            assert.deepStrictEqual(commands, []);
            assert.strictEqual(context.projectPrepared, undefined);
        });

        test('allows dismissal of the skipped-environment warning without cancelling creation', async () => {
            context.language = ProjectLanguage.Python;
            context.ui.showWarningMessage = async () => { throw new UserCancelledError(); };
            await new ProjectPrepareStep().execute(context, { report: () => undefined });
            assert.deepStrictEqual(commands, []);
            assert.strictEqual(context.projectPrepared, undefined);
        });

        for (const failedCommand of ['install', 'build']) {
            test(`propagates ${failedCommand} failure without marking the project ready`, async () => {
                const failure = new Error('Preparation failed');
                cpUtils.executeCommand = async () => {
                    if (failedCommand === 'install' || commands.length > 0) {
                        throw failure;
                    }
                    commands.push({ cwd: context.projectPath, command: 'npm', args: ['install'] });
                    return '';
                };
                const step = new ProjectPrepareStep();
                await assert.rejects(step.execute(context, { report: () => undefined }), error => error === failure);
                assert.strictEqual(step.shouldExecute(context), true);
                assert.strictEqual(commands.length, failedCommand === 'install' ? 0 : 1);
            });
        }

        test('does not run installation when cancelled before preparation', async () => {
            cancellation.cancel();
            await assert.rejects(new ProjectPrepareStep().execute(context, { report: () => undefined }), /cancel/i);
            assert.deepStrictEqual(commands, []);
        });

        test('does not start a build after cancellation during installation', async () => {
            cpUtils.executeCommand = async () => { cancellation.cancel(); return ''; };
            await assert.rejects(new ProjectPrepareStep().execute(context, { report: () => undefined }), /cancel/i);
            assert.strictEqual(context.projectPrepared, undefined);
        });
    });

    test('leaves the destination untouched when cancelled before copying', async () => {
        await AzExtFsExtra.writeFile(path.join(source, 'first.txt'), 'new');
        cancellation.cancel();
        await assert.rejects(copyPreparedProject(source, destination, options), /cancel/i);
        assert.deepStrictEqual(await fs.promises.readdir(destination), []);
    });
});

async function copyPreparedProject(source: string, destination: string, options: ConnectorProjectCreationOptions): Promise<void> {
    const creator = new ProjectTemplateCreator() as unknown as {
        copyPreparedProject(source: string, destination: string, options: ConnectorProjectCreationOptions): Promise<void>;
    };
    await creator.copyPreparedProject(source, destination, options);
}
