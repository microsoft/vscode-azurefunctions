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
import { getPollingConnectorConnectionPrefixes } from '../../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';

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

    test('adds a C# Poll binding and updates the Connector extension', async () => {
        const projectFile = path.join(projectPath, 'sample.csproj');
        await AzExtFsExtra.writeFile(projectFile, `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Connector" Version="0.2.0-alpha" />
  </ItemGroup>
</Project>
`);

        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.CSharp);

        const projectContents = (await AzExtFsExtra.readFile(projectFile)).toString();
        const functionContents = (await AzExtFsExtra.readFile(
            path.join(projectPath, 'ConnectorTriggerFunction.cs'),
        )).toString();
        assert.match(projectContents, /Version="1\.0\.0"/);
        assert.match(functionContents, /DeliveryMode = ConnectorTriggerDeliveryMode\.Poll/);
        assert.match(functionContents, /Connection = "ConnectorNamespace"/);
        assert.match(functionContents, /TriggerConfigName = "%ConnectorTriggerConfigName%"/);
        assert.deepStrictEqual(
            getPollingConnectorConnectionPrefixes(functionContents),
            ['ConnectorNamespace'],
        );
    });

    test('adds a TypeScript Poll binding with stable setting references', async () => {
        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.TypeScript);

        const functionContents = (await AzExtFsExtra.readFile(
            path.join(projectPath, 'src', 'functions', 'connectorTriggerFunction.ts'),
        )).toString();
        assert.match(functionContents, /deliveryMode: 'Poll'/);
        assert.match(functionContents, /connection: 'ConnectorNamespace'/);
        assert.match(functionContents, /triggerConfigName: '%ConnectorTriggerConfigName%'/);
        assert.deepStrictEqual(
            getPollingConnectorConnectionPrefixes(functionContents),
            ['ConnectorNamespace'],
        );
    });

    test('adds an idempotent Python Poll binding and minimum SDK version', async () => {
        const functionAppPath = path.join(projectPath, 'function_app.py');
        const requirementsPath = path.join(projectPath, 'requirements.txt');
        await AzExtFsExtra.writeFile(functionAppPath, `import azure.functions as func
import logging

app = func.FunctionApp()
`);
        await AzExtFsExtra.writeFile(requirementsPath, `azure-functions>=2.2.0b4
azurefunctions-extensions-connectors
`);

        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.Python);
        await ensureConnectorTriggerPollProject(projectPath, ProjectLanguage.Python);

        const functionContents = (await AzExtFsExtra.readFile(functionAppPath)).toString();
        const requirements = (await AzExtFsExtra.readFile(requirementsPath)).toString();
        assert.strictEqual(
            functionContents.match(/name="ConnectorTriggerFunction"/g)?.length,
            1,
        );
        assert.match(functionContents, /delivery_mode=func\.DeliveryMode\.POLL/);
        assert.match(functionContents, /trigger_config_name="%ConnectorTriggerConfigName%"/);
        assert.match(requirements, /^azure-functions>=2\.4\.0b1$/m);
        assert.deepStrictEqual(
            getPollingConnectorConnectionPrefixes(functionContents),
            ['ConnectorNamespace'],
        );
    });
});
