/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureConnectorTriggerPollProject, ensureConnectorTriggerPollProjects, validateConnectorTriggerSelections } from '../../src/connectorTrigger/ensureConnectorTriggerPollProject';
import { ProjectLanguage } from '../../src/constants';
import { findPollingConnectorBindings, getPollingConnectorBindings } from '../../src/connectorTrigger/connectorTriggerBindings';
import { CancellationTokenSource } from 'vscode';
import {
    parseConnectorTriggerOutputMetadata,
    type ConnectorTriggerOutputMetadata,
} from '../../src/connectorTrigger/connectorTriggerOutputSchema';
import { type ConnectorTriggerSelection } from '../../src/connectorTrigger/connectorTriggerSelection';
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

    for (const language of [ProjectLanguage.CSharp, ProjectLanguage.TypeScript, ProjectLanguage.Python]) {
        test(`adds an idempotent ${language} batch without changing existing configured functions or settings`, async () => {
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
            await ensureConnectorTriggerPollProjects(projectPath, language, selection);

            assert.deepStrictEqual(new Set(await findPollingConnectorBindings(projectPath)), new Set(bindings));
            assert.deepStrictEqual(bindings.map(binding => binding.functionName).sort(), selection.operationIds.sort());
            assert.strictEqual(new Set(bindings.map(binding => binding.triggerConfigSettingName)).size, 4);
            assert.strictEqual(await AzExtFsExtra.readFile(settingsPath), settings);
        });
    }

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

    test('adds an event-specific C# Poll binding from the live Act schema', async () => {
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
        assert.match(functionContents, /List<ContactForTrigNewContact>/);
        assert.match(functionContents, /JsonPropertyName\("fullName"\)/);
        assert.match(
            functionContents,
            /Dictionary<string, string>\? CustomFields/,
        );
        assert.match(functionContents, /ValueKind == JsonValueKind\.Array/);
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
        assert.match(generated, /ContactForTrigNewContact2/);
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
    });

    test('adds an event-specific TypeScript Poll binding from the live RSS schema', async () => {
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
        assert.match(functionContents, /interface FeedItemForOnNewFeed/);
        assert.match(functionContents, /"title": string;/);
        assert.match(functionContents, /"links"\?: string\[\];/);
        assert.match(functionContents, /record\?\.value/);
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

    test('adds an idempotent event-specific Python Poll binding from the live Act schema', async () => {
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
        assert.match(functionContents, /class ContactForTrigNewContact:/);
        assert.match(functionContents, /full_name: Optional\[str\] = None/);
        assert.match(
            functionContents,
            /custom_fields: Optional\[Dict\[str, str\]\] = None/,
        );
        assert.match(functionContents, /if isinstance\(body, list\):/);
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
