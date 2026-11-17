/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { transform } from 'esbuild';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInNewContext } from 'vm';
import { ensureConnectorTriggerPollProject as ensureFromSample, ensureConnectorTriggerPollProjects as ensureBatchFromSample, readConnectorPollSample, validateConnectorTriggerSelections } from '../../src/connectorTrigger/ensureConnectorTriggerPollProject';
import { ProjectLanguage } from '../../src/constants';
import { findPollingConnectorBindings, getPollingConnectorBindings } from '../../src/connectorTrigger/connectorTriggerBindings';
import { CancellationTokenSource } from 'vscode';
import {
    parseConnectorTriggerOutputMetadata,
    type ConnectorTriggerOutputMetadata,
} from '../../src/connectorTrigger/connectorTriggerOutputSchema';
import { type ConnectorTriggerSelection } from '../../src/connectorTrigger/connectorTriggerSelection';
import { type ILocalSettingsJson } from '../../src/funcConfig/local.settings';
import { cpUtils } from '../../src/utils/cpUtils';
import { envUtils } from '../../src/utils/envUtils';
import { writeConnectorPollSample } from './connectorPollSampleFixture';

const buildAddProjectsEnabled = envUtils.isEnvironmentVariableSet(
    process.env.AZFUNC_TEST_BUILD_CONNECTOR_ADD_PROJECTS,
);

suite('Connector trigger Poll project scaffolding', () => {
    let projectPath: string;
    let sampleRoot: string;

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), 'azfunc-connector-poll-project-'),
        );
        sampleRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc-connector-poll-sample-'));
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(
            projectPath,
            { recursive: true, useTrash: false },
        );
        await AzExtFsExtra.deleteResource(sampleRoot, { recursive: true, useTrash: false });
    });

    async function getSample(target: string, language: string) {
        const samplePath = path.join(sampleRoot, language);
        if (!await AzExtFsExtra.pathExists(samplePath)) {
            await writeConnectorPollSample(samplePath, language);
        }
        const targetRequirements = path.join(target, 'requirements.txt');
        if (language === ProjectLanguage.Python && await AzExtFsExtra.pathExists(targetRequirements)) {
            const requirements = await AzExtFsExtra.readFile(targetRequirements);
            const functionsRequirement = requirements.split(/\r?\n/).find(line => /^azure-functions(?:[=<>~!; ]|$)/i.test(line));
            if (functionsRequirement) {
                await AzExtFsExtra.writeFile(path.join(samplePath, 'requirements.txt'), `${functionsRequirement}\n`);
            }
        }
        return await readConnectorPollSample(samplePath, language);
    }

    async function ensureConnectorTriggerPollProject(
        target: string, language: string, selection: ConnectorTriggerSelection, metadata?: ConnectorTriggerOutputMetadata,
    ): Promise<string | undefined> {
        return await ensureFromSample(target, language, selection, metadata, await getSample(target, language));
    }

    async function ensureConnectorTriggerPollProjects(
        target: string, language: string, selection: Parameters<typeof ensureBatchFromSample>[2],
        metadata?: Parameters<typeof ensureBatchFromSample>[3], cancellationToken?: Parameters<typeof ensureBatchFromSample>[4],
    ): Promise<(string | undefined)[]> {
        return await ensureBatchFromSample(target, language, selection, metadata, cancellationToken, await getSample(target, language));
    }

    for (const language of [ProjectLanguage.CSharp, ProjectLanguage.TypeScript, ProjectLanguage.Python]) {
        test(`adds an idempotent ${language} batch while preserving existing settings`, async function () {
            this.timeout(30_000);
            if (language === ProjectLanguage.CSharp) {
                await AzExtFsExtra.writeFile(path.join(projectPath, 'sample.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
<ItemGroup><PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="1.0.0" /></ItemGroup>
</Project>`);
            }
            if (language === ProjectLanguage.Python) {
                await AzExtFsExtra.writeFile(path.join(projectPath, 'function_app.py'), 'import azure.functions as func\n\napp = func.FunctionApp()\n');
                await AzExtFsExtra.writeFile(path.join(projectPath, 'requirements.txt'), 'azure-functions==2.4.0b1\n');
            }
            const settingsPath = path.join(projectPath, 'local.settings.json');
            const settings = '{"IsEncrypted":false,"Values":{"CustomConfig":"configured"}}';
            await AzExtFsExtra.writeFile(settingsPath, settings);
            const selection = { connectorId: 'custom', operationIds: ['FirstEvent', 'SecondEvent', 'on-third', 'on_third'] };

            await ensureConnectorTriggerPollProjects(projectPath, language, selection);
            const bindings = await findPollingConnectorBindings(projectPath);
            const firstSettings = await AzExtFsExtra.readJSON<ILocalSettingsJson>(settingsPath);
            await ensureConnectorTriggerPollProjects(projectPath, language, selection);
            const retriedSettings = await AzExtFsExtra.readJSON<ILocalSettingsJson>(settingsPath);

            assert.deepStrictEqual(new Set(await findPollingConnectorBindings(projectPath)), new Set(bindings));
            assert.deepStrictEqual(bindings.map(binding => binding.functionName).sort(), selection.operationIds.sort());
            assert.strictEqual(new Set(bindings.map(binding => binding.triggerConfigSettingName)).size, 4);
            assert.deepStrictEqual(retriedSettings, firstSettings);
            assert.strictEqual(retriedSettings.Values?.CustomConfig, 'configured');
            assert.strictEqual(retriedSettings.IsEncrypted, false);
        });
    }

    test('copies transitive TypeScript helpers from the downloaded generic sample', async () => {
        const samplePath = path.join(sampleRoot, 'typescript');
        await writeConnectorPollSample(samplePath, ProjectLanguage.TypeScript);
        const handler = path.join(samplePath, 'src', 'functions', 'generic.ts');
        const source = await AzExtFsExtra.readFile(handler);
        await AzExtFsExtra.writeFile(handler, `const ignored = "import './not-a-file.js'";\nimport { marker } from '../shared/helper.js';\n${source.replace(
            "'Sample handler received a connector event.'", 'marker',
        )}`);
        await AzExtFsExtra.writeFile(path.join(samplePath, 'src', 'shared', 'helper.ts'),
            "import value from './config.json';\nexport const marker = value.message;\n");
        await AzExtFsExtra.writeFile(path.join(samplePath, 'src', 'shared', 'config.json'), '{"message":"sample-owned"}\n');
        const manifest = { dependencies: { '@azure/functions': '^4.17.1' } };
        await AzExtFsExtra.writeJSON(path.join(samplePath, 'package.json'), manifest);
        await AzExtFsExtra.writeJSON(path.join(projectPath, 'package.json'), manifest);

        const sample = await readConnectorPollSample(samplePath, ProjectLanguage.TypeScript);
        const handlerPath = await ensureFromSample(projectPath, ProjectLanguage.TypeScript, createSelection('rss', 'OnNewFeed'), undefined, sample);

        assert.ok(handlerPath);
        assert.match(await AzExtFsExtra.readFile(handlerPath), /from '\.\.\/shared\/helper\.js'/);
        for (const file of [path.join('src', 'shared', 'helper.ts'), path.join('src', 'shared', 'config.json')]) {
            assert.deepStrictEqual(await fs.promises.readFile(path.join(projectPath, file)), await fs.promises.readFile(path.join(samplePath, file)));
        }
    });

    test('rejects conflicting sample helpers without overwriting project files', async () => {
        const samplePath = path.join(sampleRoot, 'typescript');
        await writeConnectorPollSample(samplePath, ProjectLanguage.TypeScript);
        const handler = path.join(samplePath, 'src', 'functions', 'generic.ts');
        await AzExtFsExtra.writeFile(handler, `import '../shared/helper.js';\n${await AzExtFsExtra.readFile(handler)}`);
        const helper = path.join('src', 'shared', 'helper.ts');
        await AzExtFsExtra.writeFile(path.join(samplePath, helper), 'export const value = "sample";\n');
        await AzExtFsExtra.writeFile(path.join(projectPath, helper), 'export const value = "existing";\n');
        const sample = await readConnectorPollSample(samplePath, ProjectLanguage.TypeScript);

        await assert.rejects(ensureFromSample(projectPath, ProjectLanguage.TypeScript, createSelection('rss', 'OnNewFeed'), undefined, sample),
            /missing compatible files or dependencies/);
        assert.strictEqual(await AzExtFsExtra.readFile(path.join(projectPath, helper)), 'export const value = "existing";\n');
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(projectPath, 'src', 'functions', 'onNewFeedFunction.ts')), false);
    });

    test('rejects incompatible TypeScript sample dependencies before creating a handler', async () => {
        const samplePath = path.join(sampleRoot, 'typescript');
        await writeConnectorPollSample(samplePath, ProjectLanguage.TypeScript);
        await AzExtFsExtra.writeJSON(path.join(samplePath, 'package.json'), { dependencies: { '@azure/functions': '^4.17.1' } });
        await AzExtFsExtra.writeJSON(path.join(projectPath, 'package.json'), { dependencies: { '@azure/functions': '^3.0.0' } });
        const sample = await readConnectorPollSample(samplePath, ProjectLanguage.TypeScript);

        await assert.rejects(ensureFromSample(projectPath, ProjectLanguage.TypeScript, createSelection('rss', 'OnNewFeed'), undefined, sample),
            /missing compatible files or dependencies/);
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(projectPath, 'src', 'functions', 'onNewFeedFunction.ts')), false);
    });

    test('copies Python modules and imports used by the downloaded generic handler', async () => {
        const samplePath = path.join(sampleRoot, 'python');
        await writeConnectorPollSample(samplePath, ProjectLanguage.Python);
        const handler = path.join(samplePath, 'function_app.py');
        const source = await AzExtFsExtra.readFile(handler);
        await AzExtFsExtra.writeFile(handler, source.replace('import logging', 'import logging\nfrom sample_helpers import describe')
            .replace('len(payload)', 'describe(payload)'));
        await AzExtFsExtra.writeFile(path.join(samplePath, 'sample_helpers.py'), 'def describe(value):\n    return len(value)\n');
        await AzExtFsExtra.writeFile(path.join(projectPath, 'function_app.py'), 'import azure.functions as func\napp = func.FunctionApp()\n');
        await AzExtFsExtra.writeFile(path.join(projectPath, 'requirements.txt'), 'azure-functions>=2.2.0b4\n');
        const sample = await readConnectorPollSample(samplePath, ProjectLanguage.Python);

        await ensureFromSample(projectPath, ProjectLanguage.Python, createSelection('rss', 'OnNewFeed'), undefined, sample);

        const contents = await AzExtFsExtra.readFile(path.join(projectPath, 'function_app.py'));
        assert.match(contents, /from sample_helpers import describe/);
        assert.match(contents, /describe\(payload\)/);
        assert.strictEqual(await AzExtFsExtra.readFile(path.join(projectPath, 'sample_helpers.py')), 'def describe(value):\n    return len(value)\n');
    });

    test('copies C# helper files from a dependency-compatible sample', async () => {
        const samplePath = path.join(sampleRoot, 'csharp');
        await writeConnectorPollSample(samplePath, ProjectLanguage.CSharp);
        const project = '<Project><ItemGroup><PackageReference Include="Sample.Package" Version="1.0.0" /></ItemGroup></Project>';
        await AzExtFsExtra.writeFile(path.join(samplePath, 'sample.csproj'), project);
        await AzExtFsExtra.writeFile(path.join(samplePath, 'SampleHelper.cs'), 'public static class SampleHelper { }\n');
        await AzExtFsExtra.writeFile(path.join(projectPath, 'project.csproj'), project);
        const sample = await readConnectorPollSample(samplePath, ProjectLanguage.CSharp);

        await ensureFromSample(projectPath, ProjectLanguage.CSharp, createSelection('rss', 'OnNewFeed'), undefined, sample);

        assert.strictEqual(await AzExtFsExtra.readFile(path.join(projectPath, 'SampleHelper.cs')), 'public static class SampleHelper { }\n');
        assert.match(await AzExtFsExtra.readFile(path.join(projectPath, 'OnNewFeedFunction.cs')), /ConnectorEvent<string>/);
    });

    test('preflights the entire batch before writing any handler', async () => {
        await AzExtFsExtra.ensureDir(path.join(projectPath, 'src', 'functions'));
        const existing = "app.http('SecondEvent', { handler: async () => ({}) });";
        const existingPath = path.join(projectPath, 'src', 'functions', 'existing.ts');
        await AzExtFsExtra.writeFile(existingPath, existing);

        await assert.rejects(ensureConnectorTriggerPollProjects(projectPath, ProjectLanguage.TypeScript, {
            connectorId: 'custom', operationIds: ['FirstEvent', 'SecondEvent'],
        }), /already registered/);

        assert.strictEqual(await AzExtFsExtra.readFile(existingPath), existing);
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(projectPath, 'src', 'functions', 'firstEventFunction.ts')), false);
    });

    for (const language of [ProjectLanguage.CSharp, ProjectLanguage.TypeScript, ProjectLanguage.Python]) {
        test(`normalizes ${language} setting names independently of hyphenated function names and resolves collisions`, async () => {
            if (language === ProjectLanguage.CSharp) {
                await AzExtFsExtra.writeFile(path.join(projectPath, 'sample.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
<ItemGroup><PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="1.0.0" /></ItemGroup>
</Project>`);
            } else if (language === ProjectLanguage.Python) {
                await AzExtFsExtra.writeFile(path.join(projectPath, 'function_app.py'), 'import azure.functions as func\n\napp = func.FunctionApp()\n');
                await AzExtFsExtra.writeFile(path.join(projectPath, 'requirements.txt'), 'azure-functions==2.4.0b1\n');
            }
            const selection = { connectorId: 'custom', operationIds: ['Created-Lead-Submission', 'Created_Lead_Submission', 'Created_Lead_Submission2'] };

            await ensureConnectorTriggerPollProjects(projectPath, language, selection);
            const bindings = await findPollingConnectorBindings(projectPath);
            const byFunction = new Map(bindings.map(binding => [binding.functionName, binding.triggerConfigSettingName]));
            assert.deepStrictEqual([...byFunction.keys()].sort(), [...selection.operationIds].sort());
            assert.strictEqual(byFunction.get('Created-Lead-Submission'), 'Created_Lead_SubmissionTriggerConfigName');
            assert.strictEqual(byFunction.get('Created_Lead_Submission'), 'Created_Lead_Submission2TriggerConfigName');
            assert.strictEqual(byFunction.get('Created_Lead_Submission2'), 'Created_Lead_Submission22TriggerConfigName');
            assert.ok(bindings.every(binding => /^[A-Za-z0-9_]+$/.test(binding.triggerConfigSettingName)));
            assert.strictEqual(new Set(bindings.map(binding => binding.triggerConfigSettingName.toLowerCase())).size, 3);

            await ensureConnectorTriggerPollProjects(projectPath, language, selection);
            assert.deepStrictEqual(new Set(await findPollingConnectorBindings(projectPath)), new Set(bindings));
        });
    }

    test('rejects normalized registration collisions before writing and handles cancellation', async () => {
        assert.throws(() => validateConnectorTriggerSelections({
            connectorId: 'custom', operationIds: ['on/event', 'on.event'],
        }), /same function name/);
        const cancellation = new CancellationTokenSource();
        cancellation.cancel();
        try {
            await assert.rejects(ensureConnectorTriggerPollProjects(projectPath, ProjectLanguage.TypeScript, {
                connectorId: 'custom', operationIds: ['FirstEvent', 'SecondEvent'],
            }, undefined, cancellation.token), /cancel/i);
            assert.deepStrictEqual(await fs.promises.readdir(projectPath), []);
        } finally {
            cancellation.dispose();
        }
    });

    test('adds a raw C# Poll binding without inferring models from the Act schema', async () => {
        const projectFile = path.join(projectPath, 'sample.csproj');
        await AzExtFsExtra.writeFile(projectFile, `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="0.2.0-alpha" />
  </ItemGroup>
</Project>
`);
        await AzExtFsExtra.writeFile(
            path.join(projectPath, 'KeepMe.cs'),
            'public sealed class KeepMe { }\n',
        );

        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.CSharp,
            createSelection('act', 'TrigNewContact'),
            await readOutputMetadata('actTrigNewContactSwagger.json', 'TrigNewContact'),
        );

        const projectContents = (await AzExtFsExtra.readFile(projectFile)).toString();
        const functionContents = (await AzExtFsExtra.readFile(
            path.join(projectPath, 'TrigNewContactFunction.cs'),
        )).toString();
        assert.match(projectContents, /Version="0\.2\.0-alpha"/);
        assert.strictEqual(
            await AzExtFsExtra.pathExists(path.join(projectPath, 'KeepMe.cs')),
            true,
        );
        assert.match(functionContents, /DeliveryMode = ConnectorTriggerDeliveryMode\.Poll/);
        assert.match(functionContents, /Connection = "ConnectorNamespace"/);
        assert.match(functionContents, /TriggerConfigName = "%TrigNewContactTriggerConfigName%"/);
        assert.match(functionContents, /\[Function\("TrigNewContact"\)\]/);
        assert.match(functionContents, /\]\s*ConnectorEvent<string> connectorEvent\)/);
        assert.match(functionContents, /connectorEvent\.Data\.Length/);
        assert.doesNotMatch(functionContents, /JsonDocument|Deserialize|JsonPropertyName|Envelope|List<|catch|Azure\.Connectors\.Sdk/);
        assert.doesNotMatch(projectContents, /Include="Azure\.Connectors\.Sdk"/);
        assert.ok(!functionContents.includes('ConnectorTriggerFunction'));
        assert.deepStrictEqual(
            getPollingConnectorBindings(functionContents),
            [{
                connectionSettingName: 'ConnectorNamespace',
                functionName: 'TrigNewContact',
                triggerConfigSettingName: 'TrigNewContactTriggerConfigName',
            }],
        );
    });

    test('preserves an existing Connector Trigger and uses a collision-safe identity', async () => {
        await AzExtFsExtra.writeFile(
            path.join(projectPath, 'sample.csproj'),
            `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="1.0.0" />
  </ItemGroup>
</Project>
`,
        );
        const existingPath = path.join(
            projectPath,
            'TrigNewContactFunction.cs',
        );
        const existingContents = 'public sealed class ExistingContactHandler { }\n';
        await AzExtFsExtra.writeFile(existingPath, existingContents);

        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.CSharp,
            createSelection('act', 'TrigNewContact'),
            await readOutputMetadata('actTrigNewContactSwagger.json', 'TrigNewContact'),
        );

        assert.strictEqual(
            (await AzExtFsExtra.readFile(existingPath)).toString(),
            existingContents,
        );
        const generated = (await AzExtFsExtra.readFile(
            path.join(projectPath, 'TrigNewContact2Function.cs'),
        )).toString();
        assert.match(generated, /\[Function\("TrigNewContact"\)\]/);
        assert.match(
            generated,
            /TriggerConfigName = "%TrigNewContactTriggerConfigName%"/,
        );
        assert.match(generated, /public sealed class TrigNewContact2Function/);
        assert.match(generated, /ConnectorEvent<string> connectorEvent/);
    });

    test('keeps the canonical operation registration when the setting name collides', async () => {
        await AzExtFsExtra.writeFile(
            path.join(projectPath, 'sample.csproj'),
            `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="1.0.0" />
  </ItemGroup>
</Project>
`,
        );
        await AzExtFsExtra.writeFile(
            path.join(projectPath, 'Existing.cs'),
            `[Function("OtherEvent")]
public void Run(
    [ConnectorTrigger(
        DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
        Connection = "ConnectorNamespace",
        TriggerConfigName = "%TrigNewContactTriggerConfigName%")]
    string payload) { }
`,
        );

        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.CSharp,
            createSelection('act', 'TrigNewContact'),
            await readOutputMetadata('actTrigNewContactSwagger.json', 'TrigNewContact'),
        );

        const generated = (await AzExtFsExtra.readFile(
            path.join(projectPath, 'TrigNewContactFunction.cs'),
        )).toString();
        assert.match(generated, /\[Function\("TrigNewContact"\)\]/);
        assert.match(
            generated,
            /TriggerConfigName = "%TrigNewContact2TriggerConfigName%"/,
        );
        const settings = await AzExtFsExtra.readJSON<{ Values: Record<string, string> }>(
            path.join(projectPath, 'local.settings.json'),
        );
        assert.strictEqual(settings.Values.TrigNewContact2TriggerConfigName, '<trigger-configuration-name>');
        assert.ok(!Object.hasOwn(settings.Values, 'TrigNewContactTriggerConfigName'));
    });

    test('adds an untyped TypeScript Poll binding with the generic app.connectorTrigger API', async () => {
        const existingFunction = path.join(
            projectPath,
            'src',
            'functions',
            'keepMe.ts',
        );
        await AzExtFsExtra.ensureDir(path.dirname(existingFunction));
        const existingContents = `app.http('KeepMe', { handler: async () => ({ body: 'kept' }) });
// app.http('OnNewFeed', { handler: async () => ({}) });
const example = "app.http('OnNewFeed', {})";
`;
        await AzExtFsExtra.writeFile(
            existingFunction,
            existingContents,
        );
        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.TypeScript,
            createSelection('rss', 'OnNewFeed'),
            await readOutputMetadata('rssOnNewFeedSwagger.json', 'OnNewFeed'),
        );

        const functionContents = (await AzExtFsExtra.readFile(
            path.join(projectPath, 'src', 'functions', 'onNewFeedFunction.ts'),
        )).toString();
        assert.strictEqual(await AzExtFsExtra.pathExists(existingFunction), true);
        assert.strictEqual(
            (await AzExtFsExtra.readFile(existingFunction)).toString(),
            existingContents,
        );
        assert.match(functionContents, /deliveryMode: DeliveryMode\.Poll/);
        assert.match(functionContents, /connection: 'ConnectorNamespace'/);
        assert.match(functionContents, /triggerConfigName: '%OnNewFeedTriggerConfigName%'/);
        assert.match(functionContents, /^import \{ app, DeliveryMode \} from '@azure\/functions';$/m);
        assert.match(functionContents, /app\.connectorTrigger\('OnNewFeed'/);
        assert.match(functionContents, /handler: async \(_payload: unknown, invocationContext\)/);
        assert.doesNotMatch(functionContents, /import type|functions-extensions-connectors|JSON\.parse|interface |normalize|decodeJson|outputs/);
        assert.ok(!functionContents.includes('ConnectorTriggerFunction'));
        assert.deepStrictEqual(
            getPollingConnectorBindings(functionContents),
            [{
                connectionSettingName: 'ConnectorNamespace',
                functionName: 'OnNewFeed',
                triggerConfigSettingName: 'OnNewFeedTriggerConfigName',
            }],
        );
    });

    test('adds an idempotent raw Python Poll binding without inferring models from the Act schema', async () => {
        const functionAppPath = path.join(projectPath, 'function_app.py');
        const requirementsPath = path.join(projectPath, 'requirements.txt');
        await AzExtFsExtra.writeFile(functionAppPath, `from __future__ import annotations

import azure.functions as func
import logging

app = func.FunctionApp()

def keep_me() -> None:
    pass
`);
        await AzExtFsExtra.writeFile(requirementsPath, `azure-functions>=2.2.0b4
azurefunctions-extensions-connectors
`);

        const selection = createSelection('act', 'TrigNewContact');
        const outputMetadata = await readOutputMetadata(
            'actTrigNewContactSwagger.json',
            'TrigNewContact',
        );
        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.Python,
            selection,
            outputMetadata,
        );
        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.Python,
            selection,
            outputMetadata,
        );

        const functionContents = (await AzExtFsExtra.readFile(functionAppPath)).toString();
        const requirements = (await AzExtFsExtra.readFile(requirementsPath)).toString();
        assert.strictEqual(
            functionContents.match(/name="TrigNewContact"/g)?.length,
            1,
        );
        assert.match(functionContents, /def keep_me\(\) -> None:/);
        assert.match(
            functionContents,
            /^from __future__ import annotations\r?\n/,
        );
        assert.match(functionContents, /delivery_mode=func\.DeliveryMode\.POLL/);
        assert.match(functionContents, /trigger_config_name="%TrigNewContactTriggerConfigName%"/);
        assert.match(functionContents, /arg_name="payload"/);
        assert.match(functionContents, /payload: str/);
        assert.match(functionContents, /len\(payload\)/);
        assert.doesNotMatch(functionContents, /import json|from typing|cardinality|max_batch_size|json\.loads|azurefunctions\.extensions|dataclass|WIRE_PROPERTIES|_normalize|_decode|except/);
        assert.strictEqual(requirements, 'azure-functions>=2.2.0b4\nazurefunctions-extensions-connectors\n');
        assert.deepStrictEqual(
            getPollingConnectorBindings(functionContents),
            [{
                connectionSettingName: 'ConnectorNamespace',
                functionName: 'TrigNewContact',
                triggerConfigSettingName: 'TrigNewContactTriggerConfigName',
            }],
        );
    });

    const csharpProject = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="0.2.0-alpha" />
  </ItemGroup>
</Project>
`;
    for (const language of [ProjectLanguage.CSharp, ProjectLanguage.TypeScript, ProjectLanguage.Python]) {
        test(`generates an untyped ${language} handler and leaves template dependency versions unchanged`, async () => {
            const templateFiles: Record<string, string> = language === ProjectLanguage.CSharp ?
                { 'sample.csproj': csharpProject } :
                language === ProjectLanguage.TypeScript ?
                    { 'package.json': JSON.stringify({ dependencies: { '@azure/functions': '^4.16.0' }, engines: { node: '>=20' } }) } :
                    {
                        'function_app.py': 'import azure.functions as func\napp = func.FunctionApp()\n',
                        'requirements.txt': 'azure-functions>=2.2.0b4\n',
                    };
            await writeProjectFiles(projectPath, templateFiles);
            const selection = createSelection('office365', 'OnNewEmailV3');
            await ensureConnectorTriggerPollProject(projectPath, language, selection);
            const files = await readProjectFiles(projectPath);
            for (const name of ['sample.csproj', 'package.json', 'requirements.txt']) {
                assert.strictEqual(files[name], templateFiles[name]);
            }
            const source = Object.entries(files).find(([name]) =>
                language === ProjectLanguage.CSharp ? name.endsWith('Function.cs') :
                    language === ProjectLanguage.TypeScript ? name.endsWith('Function.ts') :
                        name === 'function_app.py')?.[1];
            assert.ok(source);
            assert.match(source, language === ProjectLanguage.CSharp ? /ConnectorEvent<string> connectorEvent\)/ :
                language === ProjectLanguage.TypeScript ? /app\.connectorTrigger\('OnNewEmailV3'/ :
                    /payload: str\)/);
            assert.doesNotMatch(source, /Azure\.Connectors\.Sdk|@azure\/connectors|functions-extensions-connectors|azurefunctions\.extensions|azure\.connectors/);
            assert.strictEqual((await findPollingConnectorBindings(projectPath)).length, 1);
            await ensureConnectorTriggerPollProject(projectPath, language, selection);
            assert.deepStrictEqual(await readProjectFiles(projectPath), files);
        });
    }

    const nonPollRegistrations: {
        name: string;
        language: ProjectLanguage;
        files: Record<string, string>;
    }[] = [
        {
            name: 'TypeScript HTTP',
            language: ProjectLanguage.TypeScript,
            files: {
                'src/functions/http.ts': "app.http('OnNewFeed', { handler: async () => ({}) });\n",
            },
        },
        {
            name: 'case-insensitive JavaScript HTTP',
            language: ProjectLanguage.TypeScript,
            files: {
                'src/functions/http.js': "app.http('onnewfeed', { handler: async () => ({}) });\n",
            },
        },
        {
            name: 'TypeScript timer',
            language: ProjectLanguage.TypeScript,
            files: {
                'src/functions/timer.ts': "app.timer('OnNewFeed', { schedule: '* * * * * *', handler: () => {} });\n",
            },
        },
        {
            name: 'TypeScript generic trigger',
            language: ProjectLanguage.TypeScript,
            files: {
                'src/functions/generic.ts': "app.generic('OnNewFeed', { trigger: { type: 'httpTrigger' }, handler: () => {} });\n",
            },
        },
        {
            name: 'C# HTTP',
            language: ProjectLanguage.CSharp,
            files: {
                'sample.csproj': csharpProject,
                'Existing.cs': '[Function("OnNewFeed")]\npublic void Existing([HttpTrigger] object request) {}\n',
            },
        },
        {
            name: 'C# in-process HTTP',
            language: ProjectLanguage.CSharp,
            files: {
                'sample.csproj': csharpProject,
                'Existing.cs': '[FunctionName("OnNewFeed")]\npublic void Existing([HttpTrigger] object request) {}\n',
            },
        },
        {
            name: 'C# nameof registration',
            language: ProjectLanguage.CSharp,
            files: {
                'sample.csproj': csharpProject,
                'Existing.cs': '[Microsoft.Azure.Functions.Worker.Function(nameof(OnNewFeed))]\npublic void OnNewFeed([HttpTrigger] object request) {}\n',
            },
        },
        {
            name: 'Python named HTTP',
            language: ProjectLanguage.Python,
            files: {
                'requirements.txt': 'azure-functions>=2.2.0b4\n',
                'function_app.py': `import azure.functions as func
app = func.FunctionApp()

@app.function_name(name="OnNewFeed")
@app.route(route="feed")
def http_handler(req):
    return func.HttpResponse("kept")
`,
            },
        },
        {
            name: 'Python default-name Blueprint HTTP',
            language: ProjectLanguage.Python,
            files: {
                'requirements.txt': 'azure-functions>=2.2.0b4\n',
                'function_app.py': `import azure.functions as func
from routes import blueprint
app = func.FunctionApp()
app.register_functions(blueprint)
`,
                'routes.py': `import azure.functions as func
blueprint = func.Blueprint()

@blueprint.route(route="feed")
async def OnNewFeed(req):
    return func.HttpResponse("kept")
`,
            },
        },
        {
            name: 'function.json HTTP',
            language: ProjectLanguage.TypeScript,
            files: {
                'OnNewFeed/function.json': JSON.stringify({
                    bindings: [{ type: 'httpTrigger', direction: 'in', name: 'req' }],
                }),
            },
        },
    ];

    for (const registration of nonPollRegistrations) {
        test(`rejects an existing ${registration.name} name before any project writes`, async () => {
            await writeProjectFiles(projectPath, registration.files);
            const before = await readProjectFiles(projectPath);

            await assert.rejects(
                ensureConnectorTriggerPollProject(
                    projectPath,
                    registration.language,
                    createSelection('rss', 'OnNewFeed'),
                ),
                /function with the selected event name is already registered/i,
            );

            assert.deepStrictEqual(await readProjectFiles(projectPath), before);
        });
    }

    for (const language of [ProjectLanguage.CSharp, ProjectLanguage.TypeScript, ProjectLanguage.Python]) {
        const projectFiles: Record<string, string> = language === ProjectLanguage.CSharp
            ? { 'sample.csproj': csharpProject }
            : language === ProjectLanguage.Python
                ? {
                    'function_app.py': 'import azure.functions as func\napp = func.FunctionApp()\n',
                    'requirements.txt': 'azure-functions>=2.2.0b4\n',
                }
                : {};
        const workerRuntime = language === ProjectLanguage.CSharp ? 'dotnet-isolated' :
            language === ProjectLanguage.TypeScript ? 'node' : 'python';

        test(`creates complete missing local settings and ignore rules for ${language}`, async () => {
            const preservedFiles = {
                'README.md': 'Existing project instructions.\n',
                'host.json': '{"version":"2.0"}\n',
                'unrelated.txt': 'Keep this file.\n',
            };
            await writeProjectFiles(projectPath, { ...projectFiles, ...preservedFiles });

            await ensureConnectorTriggerPollProject(
                projectPath, language, createSelection('rss', 'OnNewFeed'),
            );

            const settings = await AzExtFsExtra.readJSON(
                path.join(projectPath, 'local.settings.json'),
            );
            assert.deepStrictEqual(settings, {
                IsEncrypted: false,
                Values: {
                    AzureWebJobsStorage: 'UseDevelopmentStorage=true',
                    FUNCTIONS_WORKER_RUNTIME: workerRuntime,
                    ['ConnectorNamespace__pollingEndpoint']: 'https://<connector-namespace-host>',
                    OnNewFeedTriggerConfigName: '<trigger-configuration-name>',
                },
            });
            const bindings = await findPollingConnectorBindings(projectPath);
            assert.strictEqual(bindings.length, 1);
            assert.ok(Object.hasOwn(settings.Values, `${bindings[0].connectionSettingName}__pollingEndpoint`));
            assert.ok(Object.hasOwn(settings.Values, bindings[0].triggerConfigSettingName));
            const sourceFile = language === ProjectLanguage.CSharp ? 'OnNewFeedFunction.cs' :
                language === ProjectLanguage.TypeScript ? path.join('src', 'functions', 'onNewFeedFunction.ts') :
                    'function_app.py';
            const source = await fs.promises.readFile(path.join(projectPath, sourceFile), 'utf8');
            assert.doesNotMatch(source, /JsonDocument\.Parse|JSON\.parse|json\.loads|Output schema|normalize|Deserialize|dataclass/);
            for (const file of ['.gitignore', '.funcignore']) {
                const ignorePath = path.join(projectPath, file);
                if (language === ProjectLanguage.CSharp && file === '.funcignore') {
                    // .NET deployment publishes build output and doesn't read .funcignore.
                    assert.strictEqual(await AzExtFsExtra.pathExists(ignorePath), false);
                } else {
                    assert.strictEqual(await fs.promises.readFile(ignorePath, 'utf8'), 'local.settings.json\n');
                }
            }
            for (const [file, contents] of Object.entries(preservedFiles)) {
                assert.strictEqual(await fs.promises.readFile(path.join(projectPath, file), 'utf8'), contents);
            }
        });

        test(`preserves existing settings including empty values and other sections for ${language}`, async () => {
            const settings = {
                IsEncrypted: false,
                Values: {
                    AzureWebJobsStorage: '',
                    FUNCTIONS_WORKER_RUNTIME: '',
                    ['ConnectorNamespace__pollingEndpoint']: '',
                    OnNewFeedTriggerConfigName: '',
                    KeepSetting: 'keep-value',
                },
                Host: { LocalHttpPort: '7072' },
                ConnectionStrings: { ExistingDatabase: 'keep-connection' },
                CustomSection: { enabled: true },
            };
            await writeProjectFiles(projectPath, {
                ...projectFiles,
                'local.settings.json': JSON.stringify(settings),
            });

            await ensureConnectorTriggerPollProject(
                projectPath, language, createSelection('rss', 'OnNewFeed'),
            );

            assert.deepStrictEqual(
                await AzExtFsExtra.readJSON(path.join(projectPath, 'local.settings.json')),
                settings,
            );
        });

        const typedFile = language === ProjectLanguage.CSharp ? 'Existing.cs' :
            language === ProjectLanguage.TypeScript ? 'src/functions/existing.ts' : 'function_app.py';
        const typedContents = language === ProjectLanguage.CSharp ? `[Function("OnNewFeed")]
public void Run(
    [ConnectorTrigger(
        DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
        Connection = "ExistingNamespace",
        TriggerConfigName = "%ExistingConfig%")]
    Office365OnCalendarChangedItemsTriggerPayload payload) { }
` : language === ProjectLanguage.TypeScript ? `connectors.office365.onNewCalendarEvent('OnNewFeed', {
    deliveryMode: 'Poll',
    connection: 'ExistingNamespace',
    triggerConfigName: '%ExistingConfig%',
    handler: async (context: CalendarEventTriggerContext) => { processItems(context.calendarEvents); },
});
` : `import azure.functions as func
app = func.FunctionApp()

@app.function_name(name="OnNewFeed")
@app.connector_trigger(
    arg_name="payloads",
    delivery_mode=func.DeliveryMode.POLL,
    connection="ExistingNamespace",
    trigger_config_name="%ExistingConfig%",
    cardinality=func.Cardinality.MANY,
)
def existing_handler(payloads: List[GraphCalendarEventClientWithActionType]) -> None:
    process_items(payloads)
`;

        test(`uses the actual reused ${language} binding settings without rewriting its SDK-typed handler`, async () => {
            await writeProjectFiles(projectPath, {
                ...projectFiles,
                [typedFile]: typedContents,
                'local.settings.json': JSON.stringify({
                    Values: { ExistingConfig: '', KeepSetting: 'keep-value' },
                }),
            });

            await ensureConnectorTriggerPollProject(
                projectPath, language, createSelection('rss', 'OnNewFeed'),
                await readOutputMetadata('rssOnNewFeedSwagger.json', 'OnNewFeed'),
            );

            assert.strictEqual(await fs.promises.readFile(path.join(projectPath, typedFile), 'utf8'), typedContents);
            assert.deepStrictEqual(
                await AzExtFsExtra.readJSON(path.join(projectPath, 'local.settings.json')),
                {
                    IsEncrypted: false,
                    Values: {
                        AzureWebJobsStorage: 'UseDevelopmentStorage=true',
                        FUNCTIONS_WORKER_RUNTIME: workerRuntime,
                        ['ExistingNamespace__pollingEndpoint']: 'https://<connector-namespace-host>',
                        ExistingConfig: '',
                        KeepSetting: 'keep-value',
                    },
                },
            );
            const before = await readProjectFiles(projectPath);
            await ensureConnectorTriggerPollProject(
                projectPath, language, createSelection('rss', 'OnNewFeed'),
            );
            assert.deepStrictEqual(await readProjectFiles(projectPath), before);
        });

        const invalidSettings = [
            { name: 'malformed JSON', contents: '{"Values":{"Private":"private-setting-marker"},broken}' },
            { name: 'empty JSON', contents: ' \n' },
            { name: 'a null root', contents: 'null' },
            { name: 'an array root', contents: '[]' },
            { name: 'a string root', contents: '"private-setting-marker"' },
            { name: 'encrypted settings', contents: '{"IsEncrypted":true,"Values":{"Private":"private-setting-marker"}}' },
            { name: 'a non-boolean encryption flag', contents: '{"IsEncrypted":"false"}' },
            { name: 'null Values', contents: '{"Values":null}' },
            { name: 'array Values', contents: '{"Values":[]}' },
            { name: 'non-string Values', contents: '{"Values":{"Private":42}}' },
        ];
        for (const invalid of invalidSettings) {
            test(`rejects ${invalid.name} before any ${language} scaffold writes without disclosing values`, async () => {
                await writeProjectFiles(projectPath, {
                    ...projectFiles,
                    'local.settings.json': invalid.contents,
                    '.gitignore': 'keep-ignore-rule\n',
                    '.funcignore': 'keep-deploy-rule\n',
                });
                const before = await readProjectFiles(projectPath);

                await assert.rejects(
                    ensureConnectorTriggerPollProject(projectPath, language, createSelection('rss', 'OnNewFeed')),
                    (error: unknown) => {
                        assert.ok(error instanceof Error);
                        assert.ok(!error.message.includes('private-setting-marker'));
                        return true;
                    },
                );

                assert.deepStrictEqual(await readProjectFiles(projectPath), before);
            });
        }

        test(`rejects a conflicting HTTP registration even when the ${language} Poll function exists`, async () => {
            if (language === ProjectLanguage.CSharp) {
                await writeProjectFiles(projectPath, { 'sample.csproj': csharpProject });
            } else if (language === ProjectLanguage.Python) {
                await writeProjectFiles(projectPath, {
                    'function_app.py': 'import azure.functions as func\napp = func.FunctionApp()\n',
                    'requirements.txt': 'azure-functions>=2.2.0b4\n',
                });
            }
            const selection = createSelection('rss', 'OnNewFeed');
            await ensureConnectorTriggerPollProject(projectPath, language, selection);
            if (language === ProjectLanguage.Python) {
                const functionAppPath = path.join(projectPath, 'function_app.py');
                await fs.promises.appendFile(functionAppPath, `
@app.function_name(name="OnNewFeed")
@app.route(route="feed")
def http_handler(req):
    return func.HttpResponse("kept")
`);
            } else {
                const file = language === ProjectLanguage.CSharp ? 'Existing.cs' : 'src/functions/http.ts';
                const contents = language === ProjectLanguage.CSharp
                    ? '[Function("OnNewFeed")]\npublic void Existing([HttpTrigger] object request) {}\n'
                    : "app.http('OnNewFeed', { handler: async () => ({}) });\n";
                await writeProjectFiles(projectPath, { [file]: contents });
            }
            const before = await readProjectFiles(projectPath);

            await assert.rejects(
                ensureConnectorTriggerPollProject(projectPath, language, selection),
                /function with the selected event name is already registered/i,
            );

            assert.deepStrictEqual(await readProjectFiles(projectPath), before);
        });

        test(`keeps an existing ${language} Poll function idempotent`, async () => {
            if (language === ProjectLanguage.CSharp) {
                await writeProjectFiles(projectPath, { 'sample.csproj': csharpProject });
            } else if (language === ProjectLanguage.Python) {
                await writeProjectFiles(projectPath, {
                    'function_app.py': 'import azure.functions as func\napp = func.FunctionApp()\n',
                    'requirements.txt': 'azure-functions>=2.2.0b4\n',
                });
            }
            const selection = createSelection('rss', 'OnNewFeed');
            await ensureConnectorTriggerPollProject(projectPath, language, selection);
            const before = await readProjectFiles(projectPath);

            await ensureConnectorTriggerPollProject(projectPath, language, selection);

            assert.deepStrictEqual(await readProjectFiles(projectPath), before);
        });
    }

    test('keeps a Poll binding present in TypeScript and compiled JavaScript idempotent', async () => {
        const selection = createSelection('rss', 'OnNewFeed');
        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.TypeScript, selection);
        await writeProjectFiles(projectPath, {
            'lib/functions/onNewFeedFunction.js': `app.connectorTrigger('OnNewFeed', {
    connection: 'ConnectorNamespace',
    triggerConfigName: '%OnNewFeedTriggerConfigName%',
    deliveryMode: 'Poll',
    handler: () => {},
});
`,
        });
        const before = await readProjectFiles(projectPath);

        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.TypeScript, selection);

        assert.deepStrictEqual(await readProjectFiles(projectPath), before);
    });

    test('preserves JSONC settings and adds missing defaults without changing other sections', async () => {
        await writeProjectFiles(projectPath, {
            'local.settings.json': '\uFEFF{\n// Existing settings\n"Values":{"KeepSetting":""},\n"Host":{"LocalHttpPort":"7072"},\n}\n',
        });

        await ensureConnectorTriggerPollProject(
            projectPath, ProjectLanguage.TypeScript, createSelection('rss', 'OnNewFeed'),
        );

        const settings = await AzExtFsExtra.readJSON<ILocalSettingsJson>(path.join(projectPath, 'local.settings.json'));
        assert.strictEqual(settings.IsEncrypted, false);
        assert.ok(settings.Values);
        assert.strictEqual(settings.Values.KeepSetting, '');
        assert.strictEqual(settings.Values.FUNCTIONS_WORKER_RUNTIME, 'node');
        assert.strictEqual(settings.Values.OnNewFeedTriggerConfigName, '<trigger-configuration-name>');
        assert.deepStrictEqual(settings.Host, { LocalHttpPort: '7072' });
    });

    test('preserves ignore contents and appends an effective settings rule after negations only once', async () => {
        const ignoreFiles = {
            '.gitignore': '# local.settings.json must not be committed\r\nbin\r\n!*.json\r\n',
            '.funcignore': 'local.settings.json\r\n!local.settings.json',
        };
        await writeProjectFiles(projectPath, ignoreFiles);
        const selection = createSelection('rss', 'OnNewFeed');

        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.TypeScript, selection);

        for (const [file, contents] of Object.entries(ignoreFiles)) {
            const separator = contents.endsWith('\n') ? '' : '\r\n';
            assert.strictEqual(
                await fs.promises.readFile(path.join(projectPath, file), 'utf8'),
                `${contents}${separator}local.settings.json\r\n`,
            );
        }
        const before = await readProjectFiles(projectPath);
        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.TypeScript, selection);
        assert.deepStrictEqual(await readProjectFiles(projectPath), before);
    });

    test('uses the extension context without reparsing or logging the payload', async () => {
        await ensureConnectorTriggerPollProject(
            projectPath, ProjectLanguage.TypeScript, createSelection('rss', 'OnNewFeed'),
        );
        const source = await fs.promises.readFile(
            path.join(projectPath, 'src', 'functions', 'onNewFeedFunction.ts'), 'utf8',
        );
        type Handler = (payload: unknown, context: { log(...values: unknown[]): void }) => Promise<void>;
        const handlers: Handler[] = [];
        const logs: unknown[][] = [];
        const context = { log: (...values: unknown[]) => { logs.push(values); } };
        const compiled = await transform(source, { loader: 'ts', format: 'cjs' });
        runInNewContext(compiled.code, {
            require: (id: string) => {
                assert.strictEqual(id, '@azure/functions');
                return {
                    DeliveryMode: { Poll: 'Poll' },
                    app: {
                        connectorTrigger: (_name: string, options: { deliveryMode: string; handler: Handler }) => {
                            assert.strictEqual(options.deliveryMode, 'Poll');
                            handlers.push(options.handler);
                        },
                    },
                };
            },
        });
        assert.strictEqual(handlers.length, 1);
        const handler = handlers[0];
        await handler({ items: [{ private: 'private-payload-marker' }] }, context);
        assert.deepStrictEqual(logs, [['Sample handler received a connector event.']]);
        assert.ok(!JSON.stringify(logs).includes('private-payload-marker'));
        const loggingError = new Error('Test logging failure.');
        await assert.rejects(handler({ items: [] }, {
            log: () => { throw loggingError; },
        }), (error: unknown) => error === loggingError);
    });

    (buildAddProjectsEnabled ? test : test.skip)(
        'builds event-specific add-to-project scaffolds',
        async function (this: Mocha.Context): Promise<void> {
            this.timeout(5 * 60 * 1000);
            const typedSelections = [
                createSelection('office365', 'OnNewEmailV3'),
                createSelection('github', 'IssueOpened'),
                createSelection('onedrive', 'OnNewFilesV2'),
                createSelection('teams', 'OnNewChannelMessage'),
            ];
            const outputMetadata = await readOutputMetadata(
                'actTrigNewContactSwagger.json',
                'TrigNewContact',
            );
            const selection = createSelection('act', 'TrigNewContact');

            const csharpPath = path.join(projectPath, 'csharp');
            await AzExtFsExtra.ensureDir(csharpPath);
            await AzExtFsExtra.writeFile(
                path.join(csharpPath, 'sample.csproj'),
                `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <AzureFunctionsVersion>v4</AzureFunctionsVersion>
    <OutputType>Exe</OutputType>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="2.52.0" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="2.1.0" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="1.0.0" />
  </ItemGroup>
</Project>
`,
            );
            await AzExtFsExtra.writeFile(
                path.join(csharpPath, 'Program.cs'),
                `using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .Build();

host.Run();
`,
            );
            await ensureConnectorTriggerPollProject(
                csharpPath,
                ProjectLanguage.CSharp,
                selection,
                outputMetadata,
            );
            for (const typedSelection of typedSelections) {
                await ensureConnectorTriggerPollProject(csharpPath, ProjectLanguage.CSharp, typedSelection);
            }
            await cpUtils.executeCommand(
                undefined,
                csharpPath,
                'dotnet',
                ['build', '--nologo'],
            );

            const typescriptPath = path.join(projectPath, 'typescript');
            await AzExtFsExtra.ensureDir(typescriptPath);
            await AzExtFsExtra.writeJSON(path.join(typescriptPath, 'package.json'), {
                private: true,
                dependencies: { '@azure/functions': '^4.17.1' },
                devDependencies: { '@types/node': '^24.0.0' },
            });
            await AzExtFsExtra.writeFile(
                path.join(typescriptPath, 'tsconfig.json'),
                `{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "noEmit": true,
    "strict": true,
    "target": "ES2022",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
`,
            );
            await ensureConnectorTriggerPollProject(
                typescriptPath,
                ProjectLanguage.TypeScript,
                selection,
                outputMetadata,
            );
            for (const typedSelection of typedSelections) {
                await ensureConnectorTriggerPollProject(typescriptPath, ProjectLanguage.TypeScript, typedSelection);
            }
            await cpUtils.executeCommand(
                undefined, typescriptPath, 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
            );
            await cpUtils.executeCommand(
                undefined,
                typescriptPath,
                'node',
                [
                    require.resolve('typescript/bin/tsc'),
                    '--project',
                    'tsconfig.json',
                ],
            );

            const pythonPath = path.join(projectPath, 'python');
            await AzExtFsExtra.ensureDir(pythonPath);
            await AzExtFsExtra.writeFile(
                path.join(pythonPath, 'function_app.py'),
                `import azure.functions as func
import logging

app = func.FunctionApp()
`,
            );
            await AzExtFsExtra.writeFile(
                path.join(pythonPath, 'requirements.txt'),
                'azure-functions>=2.4.0b1\nazurefunctions-extensions-connectors\n',
            );
            await ensureConnectorTriggerPollProject(
                pythonPath,
                ProjectLanguage.Python,
                selection,
                outputMetadata,
            );
            for (const typedSelection of typedSelections) {
                await ensureConnectorTriggerPollProject(pythonPath, ProjectLanguage.Python, typedSelection);
            }
            await cpUtils.executeCommand(
                undefined,
                pythonPath,
                process.env.AZFUNC_TEST_PYTHON || 'python',
                ['-m', 'compileall', '-q', 'function_app.py'],
            );
            if (process.env.AZFUNC_TEST_PYTHON) {
                await AzExtFsExtra.writeFile(
                    path.join(pythonPath, 'verify_handler.py'),
                    'import function_app\nassert len(function_app.app.get_functions()) == 5\n',
                );
                await cpUtils.executeCommand(
                    undefined,
                    pythonPath,
                    process.env.AZFUNC_TEST_PYTHON,
                    ['verify_handler.py'],
                );
            }
        },
    );
});

async function writeProjectFiles(projectPath: string, files: Record<string, string>): Promise<void> {
    for (const [relativePath, contents] of Object.entries(files)) {
        const filePath = path.join(projectPath, ...relativePath.split('/'));
        await AzExtFsExtra.ensureDir(path.dirname(filePath));
        await AzExtFsExtra.writeFile(filePath, contents);
    }
}

async function readProjectFiles(projectPath: string): Promise<Record<string, string | undefined>> {
    const entries = await fs.promises.readdir(projectPath, { recursive: true });
    const files: Record<string, string | undefined> = {};
    for (const entry of entries.sort()) {
        const filePath = path.join(projectPath, entry);
        files[entry] = (await fs.promises.stat(filePath)).isFile()
            ? await fs.promises.readFile(filePath, 'utf8')
            : undefined;
    }
    return files;
}

function createSelection(
    connectorId: string,
    operationId: string,
): ConnectorTriggerSelection {
    return {
        connectorId,
        operationId,
    };
}

async function readOutputMetadata(
    fileName: string,
    operationId: string,
): Promise<ConnectorTriggerOutputMetadata> {
    return parseConnectorTriggerOutputMetadata(
        JSON.parse(await fs.promises.readFile(
            path.join(
                __dirname,
                '..',
                '..',
                'test',
                'fixtures',
                'connectorTriggerPicker',
                fileName,
            ),
            'utf8',
        )),
        operationId,
    );
}
