/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureConnectorTriggerPollProject } from '../../src/connectorTrigger/ensureConnectorTriggerPollProject';
import { ProjectLanguage } from '../../src/constants';
import {
    getPollingConnectorBindings,
    selectPollingConnectorBinding,
} from '../../src/connectorTrigger/connectorTriggerBindings';
import {
    connectorTriggerProjectMetadataVersion,
    type ConnectorTriggerProjectMetadata,
} from '../../src/connectorTrigger/connectorTriggerProjectMetadata';
import {
    parseConnectorTriggerOutputMetadata,
    type ConnectorTriggerOutputMetadata,
} from '../../src/connectorTrigger/connectorTriggerOutputSchema';
import { getPollingConnectorConnectionPrefixes } from '../../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';
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
            createMetadata('act', 'TrigNewContact'),
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
            getPollingConnectorConnectionPrefixes(functionContents),
            ['ConnectorNamespace'],
        );
        assert.deepStrictEqual(
            selectPollingConnectorBinding(
                getPollingConnectorBindings(functionContents),
                'TrigNewContact',
            ),
            {
                connectionSettingName: 'ConnectorNamespace',
                functionName: 'TrigNewContact',
                triggerConfigSettingName: 'TrigNewContactTriggerConfigName',
            },
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
            createMetadata('act', 'TrigNewContact'),
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
            createMetadata('act', 'TrigNewContact'),
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
        await AzExtFsExtra.writeFile(
            existingFunction,
            'export const keepMe = true;\n',
        );
        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.TypeScript,
            createMetadata('rss', 'OnNewFeed'),
            await readOutputMetadata('rssOnNewFeedSwagger.json', 'OnNewFeed'),
        );

        const functionContents = (await AzExtFsExtra.readFile(
            path.join(projectPath, 'src', 'functions', 'onNewFeedFunction.ts'),
        )).toString();
        assert.strictEqual(await AzExtFsExtra.pathExists(existingFunction), true);
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
            getPollingConnectorConnectionPrefixes(functionContents),
            ['ConnectorNamespace'],
        );
        assert.deepStrictEqual(
            selectPollingConnectorBinding(
                getPollingConnectorBindings(functionContents),
                'OnNewFeed',
            ),
            {
                connectionSettingName: 'ConnectorNamespace',
                functionName: 'OnNewFeed',
                triggerConfigSettingName: 'OnNewFeedTriggerConfigName',
            },
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

        const metadata = createMetadata('act', 'TrigNewContact');
        const outputMetadata = await readOutputMetadata(
            'actTrigNewContactSwagger.json',
            'TrigNewContact',
        );
        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.Python,
            metadata,
            outputMetadata,
        );
        await ensureConnectorTriggerPollProject(
            projectPath,
            ProjectLanguage.Python,
            metadata,
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
            getPollingConnectorConnectionPrefixes(functionContents),
            ['ConnectorNamespace'],
        );
        assert.deepStrictEqual(
            selectPollingConnectorBinding(
                getPollingConnectorBindings(functionContents),
                'TrigNewContact',
            ),
            {
                connectionSettingName: 'ConnectorNamespace',
                functionName: 'TrigNewContact',
                triggerConfigSettingName: 'TrigNewContactTriggerConfigName',
            },
        );
    });

    (buildAddProjectsEnabled ? test : test.skip)(
        'builds event-specific add-to-project scaffolds',
        async function (this: Mocha.Context): Promise<void> {
            this.timeout(5 * 60 * 1000);
            const outputMetadata = await readOutputMetadata(
                'actTrigNewContactSwagger.json',
                'TrigNewContact',
            );
            const metadata = createMetadata('act', 'TrigNewContact');

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
                metadata,
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
                metadata,
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
                metadata,
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

function createMetadata(
    connectorId: string,
    operationId: string,
): ConnectorTriggerProjectMetadata {
    return {
        version: connectorTriggerProjectMetadataVersion,
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
