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
import { ensureConnectorTriggerPollProject, ensureConnectorTriggerPollProjects, validateConnectorTriggerSelections } from '../../src/connectorTrigger/ensureConnectorTriggerPollProject';
import { getConnectorTriggerSdkBinding } from '../../src/connectorTrigger/connectorTriggerSdkBindings';
import { ProjectLanguage } from '../../src/constants';
import { findPollingConnectorBindings, getPollingConnectorBindings } from '../../src/connectorTrigger/connectorTriggerBindings';
import { CancellationTokenSource } from 'vscode';
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

    for (const language of [ProjectLanguage.CSharp, ProjectLanguage.TypeScript, ProjectLanguage.Python]) {
        test(`adds an idempotent ${language} batch while preserving existing settings`, async () => {
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
            }, cancellation.token), /cancel/i);
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

    test('adds a generic TypeScript Poll binding with the declared RSS SDK item', async () => {
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
        assert.match(functionContents, /connectorTrigger<FeedItem>\('OnNewFeed'/);
        assert.match(functionContents, /import type \{ FeedItem \} from '@azure\/connectors\/generated\/RssExtensions'/);
        assert.match(functionContents, /handler: async \(event, invocationContext\)/);
        assert.match(functionContents, /event\.items\.length/);
        assert.doesNotMatch(functionContents, /app\.connectorTrigger|JSON\.parse|interface |normalize|decodeJson|outputs/);
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
        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.Python,
            selection,
        );
        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.Python,
            selection,
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
        assert.match(requirements, /^azure-functions>=2\.4\.0b1 ; python_version >= '3\.13'\r?$/m);
        assert.match(requirements, /^azure-functions>=1\.27\.0b1 ; python_version < '3\.13'\r?$/m);
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
    const sdkCases = [
        {
            connector: 'office365', operation: 'OnNewEmailV3',
            csharp: 'Office365OnNewEmailTriggerPayload',
            node: "connectors.office365.onNewEmail('OnNewEmailV3'",
            python: 'list[office365.GraphClientReceiveMessage]',
        },
        {
            connector: 'office365', operation: 'CalendarGetOnChangedItemsV3',
            csharp: 'Office365OnCalendarChangedItemsTriggerPayload',
            node: "connectors.office365.onCalendarChangedItems('CalendarGetOnChangedItemsV3'",
            python: 'list[office365.GraphCalendarEventClientWithActionType]',
        },
        {
            connector: 'github', operation: 'IssueOpened',
            csharp: 'GitHubOnIssueOpenedTriggerPayload',
            node: "connectorTrigger<IssueDetailsModel>('IssueOpened'",
            python: 'str',
        },
        {
            connector: 'office365', operation: 'UnsupportedEvent',
            csharp: 'ConnectorEvent<string>',
            node: "connectorTrigger('UnsupportedEvent'",
            python: 'str',
        },
        {
            connector: 'sharepointonline', operation: 'OnNewFile',
            csharp: 'ConnectorEvent<string>',
            node: "connectors.sharepoint.onNewFile('OnNewFile'",
            python: 'str',
        },
        {
            connector: 'sharepointonline', operation: 'GetOnDeletedItems',
            csharp: 'SharePointOnlineOnDeletedItemsTriggerPayload',
            node: "connectors.sharepoint.onDeletedItems('GetOnDeletedItems'",
            python: 'list[sharepointonline.DeletedItem]',
        },
        {
            connector: 'teams', operation: 'OnGroupMembershipAdd',
            csharp: 'TeamsOnTeamMemberAddedTriggerPayload',
            node: "connectors.teams.onTeamMemberAdded('OnGroupMembershipAdd'",
            python: 'list[teams.OnGroupMemberChangeResponse]',
        },
        {
            connector: 'teams', operation: 'OnNewChannelMessage',
            csharp: 'TeamsOnNewChannelMessageTriggerPayload',
            node: "connectors.teams.onNewChannelMessage('OnNewChannelMessage'",
            python: 'list[teams.ChatMessage]',
        },
        {
            connector: 'commondataservice', operation: 'GetOnDeletedItems_V2',
            csharp: 'CommondataserviceOnDeletedItemsTriggerPayload',
            node: "connectorTrigger('GetOnDeletedItems_V2'",
            python: 'list[commondataservice.Item]',
        },
        {
            connector: 'onedrive', operation: 'OnNewFilesV2',
            csharp: 'OneDriveOnNewFilesTriggerPayload',
            node: "connectorTrigger('OnNewFilesV2'",
            python: 'str',
        },
        {
            connector: 'customconnector', operation: 'OnNewEmailV3',
            csharp: 'ConnectorEvent<string>',
            node: "connectorTrigger('OnNewEmailV3'",
            python: 'str',
        },
    ];
    for (const sdkCase of sdkCases) {
        for (const language of [ProjectLanguage.CSharp, ProjectLanguage.TypeScript, ProjectLanguage.Python]) {
            test(`uses the exact ${language} SDK capability for ${sdkCase.connector}/${sdkCase.operation}`, async () => {
                if (language === ProjectLanguage.CSharp) {
                    await writeProjectFiles(projectPath, { 'sample.csproj': csharpProject });
                } else if (language === ProjectLanguage.Python) {
                    await writeProjectFiles(projectPath, {
                        'function_app.py': 'import azure.functions as func\napp = func.FunctionApp()\n',
                        'requirements.txt': 'azure-functions>=2.2.0b4\n',
                    });
                }
                const selection = createSelection(sdkCase.connector, sdkCase.operation);
                await ensureConnectorTriggerPollProject(projectPath, language, selection);
                const binding = getConnectorTriggerSdkBinding(sdkCase.connector, sdkCase.operation);
                const files = await readProjectFiles(projectPath);
                const source = Object.entries(files).find(([name]) =>
                    language === ProjectLanguage.CSharp ? name.endsWith('Function.cs') :
                        language === ProjectLanguage.TypeScript ? name.endsWith('Function.ts') :
                            name === 'function_app.py')?.[1];
                assert.ok(source);
                if (language === ProjectLanguage.CSharp) {
                    assert.ok(source.includes(sdkCase.csharp));
                    if (binding.csharp) {
                        assert.ok(source.includes(`using ${binding.csharp.namespace};`));
                        assert.match(files['sample.csproj'] ?? '', /Include="Azure\.Connectors\.Sdk" Version="0\.15\.0-preview\.1"/);
                    } else {
                        assert.doesNotMatch(source, /using Azure\.Connectors\.Sdk/);
                        assert.doesNotMatch(files['sample.csproj'] ?? '', /Include="Azure\.Connectors\.Sdk"/);
                    }
                } else if (language === ProjectLanguage.TypeScript) {
                    assert.ok(source.includes(sdkCase.node));
                    assert.doesNotMatch(source, /app\.connectorTrigger|JSON\.parse/);
                    if (binding.typescript.helper) {
                        assert.match(source, /import \{ connectors \}/);
                        assert.doesNotMatch(source, /import type/);
                    } else if (binding.typescript.importPath) {
                        assert.ok(source.includes(`import type { ${binding.typescript.itemType} } from '${binding.typescript.importPath}'`));
                    } else {
                        assert.doesNotMatch(source, /import type/);
                    }
                } else {
                    assert.ok(source.includes(`payload: ${sdkCase.python})`));
                    assert.doesNotMatch(source, /cardinality|max_batch_size|json\.loads/);
                    if (binding.python) {
                        assert.ok(source.includes(`import ${binding.python.importPath} as ${binding.python.moduleName}`));
                        assert.match(files['requirements.txt'] ?? '', /^azurefunctions-extensions-connectors>=1\.0\.0b4$/m);
                        assert.match(files['requirements.txt'] ?? '', /^azure-connectors>=0\.6\.0b1$/m);
                    } else {
                        assert.doesNotMatch(source, /azurefunctions\.extensions|azure\.connectors/);
                    }
                }
                await ensureConnectorTriggerPollProject(projectPath, language, selection);
                assert.deepStrictEqual(await readProjectFiles(projectPath), files);
            });
        }
    }

    test('preserves Node package scripts and newer compatible SDK and engine requirements', async () => {
        const packageJson = {
            type: 'module',
            scripts: { build: 'tsc', start: 'func start' },
            dependencies: {
                '@azure/functions': '^4.18.0',
                '@azure/functions-extensions-connectors': '^0.3.0',
                '@azure/connectors': '^0.5.0',
                other: '1.2.3',
            },
            engines: { node: '>=26.0.0', npm: '>=11' },
        };
        await writeProjectFiles(projectPath, { 'package.json': JSON.stringify(packageJson) });
        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.TypeScript, createSelection('github', 'IssueOpened'));
        assert.deepStrictEqual(await AzExtFsExtra.readJSON(path.join(projectPath, 'package.json')), packageJson);
    });

    test('upgrades Node template dependencies to the verified SDK APIs and Node 24', async () => {
        await writeProjectFiles(projectPath, {
            'package.json': JSON.stringify({
                scripts: { build: 'tsc' },
                dependencies: { '@azure/functions': '^4.16.0', '@azure/functions-extensions-connectors': '0.0.2-preview' },
                engines: { node: '>=20' },
            }),
        });
        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.TypeScript, createSelection('github', 'IssueOpened'));
        assert.deepStrictEqual(await AzExtFsExtra.readJSON(path.join(projectPath, 'package.json')), {
            scripts: { build: 'tsc' },
            dependencies: {
                '@azure/functions': '^4.17.0',
                '@azure/functions-extensions-connectors': '^0.2.0-preview',
                '@azure/connectors': '^0.4.0-preview',
            },
            engines: { node: '>=24.0.0' },
        });
    });

    test('does not interpret inherited object properties as SDK capabilities', () => {
        for (const name of ['constructor', 'toString', '__proto__']) {
            for (const connector of [name, 'office365']) {
                assert.deepStrictEqual(getConnectorTriggerSdkBinding(connector, name), {
                    csharp: undefined, python: undefined,
                    typescript: { helper: undefined, importPath: undefined, itemType: undefined },
                });
            }
        }
    });

    test('normalizes connector casing without treating different operation revisions as equivalent', () => {
        assert.deepStrictEqual(
            getConnectorTriggerSdkBinding('GitHub', 'IssueOpened'),
            getConnectorTriggerSdkBinding('github', 'IssueOpened'),
        );
        assert.strictEqual(getConnectorTriggerSdkBinding('github', 'issueopened').csharp, undefined);
        assert.strictEqual(getConnectorTriggerSdkBinding('office365', 'OnNewEmailV2').typescript.helper, undefined);
    });

    for (const range of ['*', '>=22 || >=26', '<25', 'invalid']) {
        test(`upgrades the unsupported Node engine range ${range}`, async () => {
            await writeProjectFiles(projectPath, {
                'package.json': JSON.stringify({ engines: { node: range } }),
            });
            await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.TypeScript, createSelection('github', 'IssueOpened'));
            const packageJson = await AzExtFsExtra.readJSON<{ engines: { node: string } }>(path.join(projectPath, 'package.json'));
            assert.strictEqual(packageJson.engines.node, '>=24.0.0');
        });
    }

    test('preserves Node OR ranges only when every alternative meets the required minimum', async () => {
        await writeProjectFiles(projectPath, {
            'package.json': JSON.stringify({
                dependencies: { '@azure/functions': '^4.18.0 || ^4.16.0' },
                engines: { node: '^24 || >=26' },
            }),
        });
        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.TypeScript, createSelection('github', 'IssueOpened'));
        const packageJson = await AzExtFsExtra.readJSON<{
            dependencies: Record<string, string>;
            engines: { node: string };
        }>(path.join(projectPath, 'package.json'));
        assert.strictEqual(packageJson.dependencies['@azure/functions'], '^4.17.0');
        assert.strictEqual(packageJson.engines.node, '^24 || >=26');
    });

    test('updates Python version markers once without leaving a conflicting requirement', async () => {
        await writeProjectFiles(projectPath, {
            'function_app.py': 'import azure.functions as func\napp = func.FunctionApp()\n',
            'requirements.txt': [
                '# Keep existing dependencies.',
                "azure-functions>=2.2.0b4 ; python_version >= '3.13'",
                "azure-functions>=1.26.0b1 ; python_version < '3.13'",
                'other-package==1.2.3',
                '',
            ].join('\r\n'),
        });
        const selection = createSelection('office365', 'OnNewEmailV3');
        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.Python, selection);
        const requirementsPath = path.join(projectPath, 'requirements.txt');
        const requirements = (await AzExtFsExtra.readFile(requirementsPath)).toString();
        assert.strictEqual(requirements.match(/^azure-functions[><=]/gm)?.length, 2);
        assert.match(requirements, /^azure-functions>=2\.4\.0b1 ; python_version >= '3\.13'\r?$/m);
        assert.match(requirements, /^azure-functions>=1\.27\.0b1 ; python_version < '3\.13'\r?$/m);
        assert.match(requirements, /^other-package==1\.2\.3\r?$/m);
        assert.match(requirements, /^# Keep existing dependencies\.\r?$/m);
        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.Python, selection);
        assert.strictEqual((await AzExtFsExtra.readFile(requirementsPath)).toString(), requirements);
    });

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
        type Handler = (event: { items: unknown[] }, context: { log(...values: unknown[]): void }) => Promise<void>;
        const handlers: Handler[] = [];
        const logs: unknown[][] = [];
        const context = { log: (...values: unknown[]) => { logs.push(values); } };
        const compiled = await transform(source, { loader: 'ts', format: 'cjs' });
        runInNewContext(compiled.code, {
            require: (id: string) => {
                assert.strictEqual(id, '@azure/functions-extensions-connectors');
                return {
                    connectorTrigger: (_name: string, options: { handler: Handler }) => {
                        handlers.push(options.handler);
                    },
                };
            },
        });
        assert.strictEqual(handlers.length, 1);
        const handler = handlers[0];
        await handler({ items: [{ private: 'private-payload-marker' }] }, context);
        await handler({ items: [] }, context);
        assert.deepStrictEqual(logs, [
            ['Received 1 item(s) in the polling event.'],
            ['Received 0 item(s) in the polling event.'],
        ]);
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
