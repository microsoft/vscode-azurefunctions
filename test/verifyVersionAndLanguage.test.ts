/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-dev';
import * as fse from 'fs-extra';
import * as path from 'path';
import { FuncVersion, getRandomHexString, ProjectLanguage, verifyVersionAndLanguage } from '../extension.bundle';
import { assertThrowsAsync } from './assertThrowsAsync';
import { testFolderPath } from './global.test';

suite('verifyVersionAndLanguage', () => {

    let net3Path: string;
    let net5Path: string;
    suiteSetup(async () => {
        net3Path = path.join(testFolderPath, getRandomHexString());
        const net3ProjPath = path.join(net3Path, 'test.csproj');
        await fse.ensureFile(net3ProjPath);
        await fse.writeFile(net3ProjPath, net3Proj);

        net5Path = path.join(testFolderPath, getRandomHexString());
        const net5ProjPath = path.join(net5Path, 'test.csproj');
        await fse.ensureFile(net5ProjPath);
        await fse.writeFile(net5ProjPath, net5Proj);
    });


    test('Local: ~1, Remote: none', async () => {
        const props: { [name: string]: string } = {};
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~1, Remote: ~1', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~1'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~1, Remote: 1.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '1.0.0'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~1, Remote: ~2', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2'
        };
        const context = await createTestActionContext();
        await context.ui.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage(context, undefined, 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~1, Remote: 2.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '2.0.0'
        };
        const context = await createTestActionContext();
        await context.ui.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage(context, undefined, 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~2, Remote: none', async () => {
        const props: { [name: string]: string } = {};
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2, Remote: ~2', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2, Remote: 2.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '2.0.0'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2, Remote: ~1', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~1'
        };
        const context = await createTestActionContext();
        await context.ui.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage(context, undefined, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~2, Remote: 1.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '1.0.0'
        };
        const context = await createTestActionContext();
        await context.ui.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage(context, undefined, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~2/node, Remote: ~2/node', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'node'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2/node, Remote: ~2/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await assertThrowsAsync(async () => await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props), /dotnet.*match.*node/i);
    });

    test('Local: ~2/node, Remote: ~1/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~1',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await assertThrowsAsync(async () => await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props), /dotnet.*match.*node/i);
    });

    test('Local: ~2/unknown, Remote: ~2/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v2, <ProjectLanguage>"unknown", props);
    });

    test('Local: ~2/C#, Remote: ~2/unknown', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'unknown'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v2, ProjectLanguage.CSharp, props);
    });

    test('Local: ~2/unknown, Remote: ~2/unknown', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'unknown'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v2, <ProjectLanguage>"unknown", props);
    });

    test('Local: ~3/dotnet, Remote: ~3/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~3',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), net3Path, 'testSite', FuncVersion.v3, ProjectLanguage.CSharp, props);
    });

    test('Local: ~3/dotnet, Remote: ~3/dotnet-isolated', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~3',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet-isolated'
        };
        await assertThrowsAsync(async () => await verifyVersionAndLanguage(await createTestActionContext(), net3Path, 'testSite', FuncVersion.v3, ProjectLanguage.CSharp, props), /dotnet-isolated.*match.*dotnet/i);
    });

    test('Local: ~3/dotnet-isolated, Remote: ~3/dotnet-isolated', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~3',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet-isolated'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), net5Path, 'testSite', FuncVersion.v3, ProjectLanguage.CSharp, props);
    });

    test('Local: ~3/dotnet-isolated, Remote: ~3/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~3',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await assertThrowsAsync(async () => await verifyVersionAndLanguage(await createTestActionContext(), net5Path, 'testSite', FuncVersion.v3, ProjectLanguage.CSharp, props), /dotnet.*match.*dotnet-isolated/i);
    });

    test('Local: ~3/dotnet (unknown projectPath), Remote: ~3/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~3',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await verifyVersionAndLanguage(await createTestActionContext(), undefined, 'testSite', FuncVersion.v3, ProjectLanguage.CSharp, props);
    });
});

const net3Proj: string = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netcoreapp3.1</TargetFramework>
    <AzureFunctionsVersion>v3</AzureFunctionsVersion>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Sdk.Functions" Version="3.0.13" />
  </ItemGroup>
  <ItemGroup>
    <None Update="host.json">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    </None>
    <None Update="local.settings.json">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
      <CopyToPublishDirectory>Never</CopyToPublishDirectory>
    </None>
  </ItemGroup>
</Project>
`;

const net5Proj: string = `<Project Sdk="Microsoft.NET.Sdk">
<PropertyGroup>
  <TargetFramework>net5.0</TargetFramework>
  <AzureFunctionsVersion>v3</AzureFunctionsVersion>
  <OutputType>Exe</OutputType>
</PropertyGroup>
<ItemGroup>
  <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Http" Version="3.0.12" />
  <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="1.0.3" OutputItemType="Analyzer" />
  <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="1.1.0" />
</ItemGroup>
<ItemGroup>
  <None Update="host.json">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
  </None>
  <None Update="local.settings.json">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    <CopyToPublishDirectory>Never</CopyToPublishDirectory>
  </None>
</ItemGroup>
</Project>
`;
