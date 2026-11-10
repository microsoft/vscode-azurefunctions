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
import { ensureConnectorTriggerPollProject } from '../../src/connectorTrigger/ensureConnectorTriggerPollProject';
import { ProjectLanguage } from '../../src/constants';
import { findPollingConnectorBindings, getPollingConnectorBindings } from '../../src/connectorTrigger/connectorTriggerBindings';
import {
    parseConnectorTriggerOutputMetadata,
    type ConnectorTriggerOutputMetadata,
} from '../../src/connectorTrigger/connectorTriggerOutputSchema';
import { type ConnectorTriggerSelection } from '../../src/connectorTrigger/connectorTriggerSelection';
import { type ILocalSettingsJson } from '../../src/funcConfig/local.settings';
import { cpUtils } from '../../src/utils/cpUtils';
import { envUtils } from '../../src/utils/envUtils';

const buildAddProjectsEnabled = envUtils.isEnvironmentVariableSet(
    process.env.AZFUNC_TEST_BUILD_CONNECTOR_ADD_PROJECTS,
);

suite('Connector trigger Poll project scaffolding', () => {
    let projectPath: string;

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), 'azfunc-connector-poll-project-'),
        );
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(
            projectPath,
            { recursive: true, useTrash: false },
        );
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
        assert.match(projectContents, /Version="1\.0\.0"/);
        assert.strictEqual(
            await AzExtFsExtra.pathExists(path.join(projectPath, 'KeepMe.cs')),
            true,
        );
        assert.match(functionContents, /DeliveryMode = ConnectorTriggerDeliveryMode\.Poll/);
        assert.match(functionContents, /Connection = "ConnectorNamespace"/);
        assert.match(functionContents, /TriggerConfigName = "%TrigNewContactTriggerConfigName%"/);
        assert.match(functionContents, /\[Function\("TrigNewContact"\)\]/);
        assert.match(functionContents, /\]\s*string payload\)/);
        assert.match(functionContents, /using var document = JsonDocument\.Parse\(payload\);/);
        assert.match(functionContents, /var data = document\.RootElement;/);
        assert.strictEqual(functionContents.match(/JsonDocument\.Parse/g)?.length, 1);
        assert.doesNotMatch(functionContents, /Deserialize|JsonPropertyName|Envelope|List<|catch/);
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
        assert.match(generated, /JsonDocument\.Parse\(payload\)/);
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

    test('adds a raw TypeScript Poll binding without inferring models from the RSS schema', async () => {
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
        assert.match(functionContents, /deliveryMode: 'Poll'/);
        assert.match(functionContents, /connection: 'ConnectorNamespace'/);
        assert.match(functionContents, /triggerConfigName: '%OnNewFeedTriggerConfigName%'/);
        assert.match(functionContents, /app\.connectorTrigger\('OnNewFeed'/);
        assert.match(functionContents, /payload: unknown, context: InvocationContext/);
        assert.match(functionContents, /let data: unknown = payload;/);
        assert.match(functionContents, /if \(typeof payload === 'string'\)/);
        assert.match(functionContents, /data = JSON\.parse\(payload\);/);
        assert.strictEqual(functionContents.match(/JSON\.parse/g)?.length, 1);
        assert.doesNotMatch(functionContents, /interface |normalize|decodeJson|outputs/);
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
        assert.match(functionContents, /^import json$/m);
        assert.match(functionContents, /^from typing import List$/m);
        assert.match(functionContents, /cardinality=func\.Cardinality\.MANY/);
        assert.match(functionContents, /max_batch_size=4/);
        assert.match(functionContents, /payloads: List\[str\]/);
        assert.match(functionContents, /for payload in payloads:\r?\n {8}data = json\.loads\(payload\)/);
        assert.strictEqual(functionContents.match(/json\.loads/g)?.length, 1);
        assert.doesNotMatch(functionContents, /dataclass|WIRE_PROPERTIES|_normalize|_decode|except/);
        assert.match(requirements, /^azure-functions>=2\.4\.0b1$/m);
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
            const parser = language === ProjectLanguage.CSharp ? /JsonDocument\.Parse/g :
                language === ProjectLanguage.TypeScript ? /JSON\.parse/g : /json\.loads/g;
            const source = await fs.promises.readFile(path.join(projectPath, sourceFile), 'utf8');
            assert.strictEqual(source.match(parser)?.length, 1);
            assert.doesNotMatch(source, /Output schema|normalize|Deserialize|dataclass/);
            for (const file of ['.gitignore', '.funcignore']) {
                assert.strictEqual(
                    await fs.promises.readFile(path.join(projectPath, file), 'utf8'),
                    'local.settings.json\n',
                );
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

    test('executes the raw TypeScript handler with parse-once shapes and rejects malformed JSON without reflecting payloads', async () => {
        await ensureConnectorTriggerPollProject(
            projectPath, ProjectLanguage.TypeScript, createSelection('rss', 'OnNewFeed'),
        );
        const source = await fs.promises.readFile(
            path.join(projectPath, 'src', 'functions', 'onNewFeedFunction.ts'), 'utf8',
        );
        type Handler = (payload: unknown, context: { log(...values: unknown[]): void }) => Promise<void>;
        const handlers: Handler[] = [];
        const parsedValues: unknown[] = [];
        let parseCalls = 0;
        const logs: unknown[][] = [];
        const context = { log: (...values: unknown[]) => { logs.push(values); } };
        const compiled = await transform(source, { loader: 'ts', format: 'cjs' });
        runInNewContext(compiled.code, {
            SyntaxError,
            require: (id: string) => {
                assert.strictEqual(id, '@azure/functions');
                return {
                    app: {
                        connectorTrigger: (_name: string, options: { handler: Handler }) => {
                            handlers.push(options.handler);
                        },
                    },
                };
            },
            JSON: {
                parse: (payload: string): unknown => {
                    parseCalls++;
                    const value: unknown = JSON.parse(payload);
                    parsedValues.push(value);
                    return value;
                },
            },
        });
        assert.strictEqual(handlers.length, 1);
        const handler = handlers[0];
        const payloads = [
            { outputs: { body: '[{"private":"private-payload-marker"}]' } },
            [1, { value: 'private-payload-marker' }],
            42,
            true,
            null,
            '{"nested":"private-payload-marker"}',
        ];
        for (const [index, value] of payloads.entries()) {
            await handler(JSON.stringify(value), context);
            assert.strictEqual(parsedValues.length, index + 1);
            assert.deepStrictEqual(parsedValues[index], value);
        }
        for (const value of payloads.filter(payload => typeof payload !== 'string')) {
            await handler(value, context);
        }
        assert.strictEqual(parsedValues.length, payloads.length);
        assert.strictEqual(parseCalls, payloads.length);
        const successfulLogs = logs.length;
        const invalidPayload = 'payload-secret';
        await assert.rejects(handler(invalidPayload, context), (error: unknown) => {
            assert.ok(error instanceof SyntaxError);
            assert.strictEqual(error.message, 'Invalid Connector Trigger JSON payload.');
            assert.ok(!String(error).includes(invalidPayload));
            assert.ok(!error.stack?.includes(invalidPayload));
            assert.ok(!('cause' in error));
            return true;
        });
        assert.strictEqual(parseCalls, payloads.length + 1);
        assert.strictEqual(logs.length, successfulLogs);
        assert.ok(!JSON.stringify(logs).includes('private-payload-marker'));
        assert.ok(!JSON.stringify(logs).includes(invalidPayload));
        const loggingError = new Error('Test logging failure.');
        await assert.rejects(handler('{}', {
            log: () => { throw loggingError; },
        }), (error: unknown) => error === loggingError);
    });

    (buildAddProjectsEnabled ? test : test.skip)(
        'builds event-specific add-to-project scaffolds',
        async function (this: Mocha.Context): Promise<void> {
            this.timeout(5 * 60 * 1000);
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
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="0.2.0-alpha" />
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
            await cpUtils.executeCommand(
                undefined,
                csharpPath,
                'dotnet',
                ['build', '--nologo'],
            );

            const typescriptPath = path.join(projectPath, 'typescript');
            const typesPath = path.join(
                typescriptPath,
                'node_modules',
                '@azure',
                'functions',
            );
            await AzExtFsExtra.ensureDir(typesPath);
            await AzExtFsExtra.writeFile(
                path.join(typesPath, 'package.json'),
                '{"types":"index.d.ts"}\n',
            );
            await AzExtFsExtra.writeFile(
                path.join(typesPath, 'index.d.ts'),
                `export interface InvocationContext {
    log(...values: unknown[]): void;
}

export const app: {
    connectorTrigger(
        name: string,
        options: {
            deliveryMode: 'Poll';
            connection: string;
            triggerConfigName: string;
            handler(payload: unknown, context: InvocationContext): Promise<void>;
        },
    ): void;
};
`,
            );
            await AzExtFsExtra.writeFile(
                path.join(typescriptPath, 'tsconfig.json'),
                `{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "noEmit": true,
    "strict": true,
    "target": "ES2022"
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
            await cpUtils.executeCommand(
                undefined,
                typescriptPath,
                'node',
                [
                    path.join(
                        __dirname,
                        '..',
                        '..',
                        'node_modules',
                        'typescript',
                        'bin',
                        'tsc',
                    ),
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
            await cpUtils.executeCommand(
                undefined,
                pythonPath,
                process.env.AZFUNC_TEST_PYTHON || 'python',
                ['-m', 'compileall', '-q', 'function_app.py'],
            );
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
