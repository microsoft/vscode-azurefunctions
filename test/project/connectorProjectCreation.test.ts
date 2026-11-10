/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CancellationTokenSource } from 'vscode';
import { ProjectTemplateCreator, type ConnectorProjectCreationOptions } from '../../src/commands/createNewProject/ProjectTemplateCreator';
import { findPollingConnectorBindings } from '../../src/connectorTrigger/connectorTriggerBindings';
import { materializeGenericConnectorTriggerProject } from '../../src/connectorTrigger/materializeGenericConnectorTriggerProject';
import { ProjectLanguage } from '../../src/constants';
import { type IProjectTemplate } from '../../src/templates/projectTemplates/IProjectTemplate';

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
