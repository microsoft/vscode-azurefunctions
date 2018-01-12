/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { OutputChannel } from "vscode";
import { localize } from "../localize";
import { cpUtils } from "./cpUtils";
import * as fsUtil from './fs';

export namespace dotnetUtils {
    const projectPackageId: string = 'microsoft.azurefunctions.projecttemplates';
    const functionsPackageId: string = 'azure.functions.templates';
    const templateVersion: string = '2.0.0-beta-10138';

    // tslint:disable:no-multiline-string
    const packagesCsproj: string = `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="${projectPackageId}" Version="${templateVersion}" />
    <PackageReference Include="${functionsPackageId}" Version="${templateVersion}" />
  </ItemGroup>
</Project>
`;

    async function validateDotnetInstalled(workingDirectory: string): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, workingDirectory, 'dotnet', '--version');
        } catch (error) {
            throw new Error(localize('azFunc.dotnetNotInstalled', 'You must have the "dotnet" cli installed to perform this operation.'));
        }
    }

    export const funcProjectId: string = 'azureFunctionsProjectTemplates';

    export async function validateTemplatesInstalled(outputChannel: OutputChannel, workingDirectory: string): Promise<void> {
        await validateDotnetInstalled(workingDirectory);
        const listOutput: string = await cpUtils.executeCommand(undefined, workingDirectory, 'dotnet', 'new', '--list');
        if (!listOutput.includes(funcProjectId) || !listOutput.includes('HttpTrigger')) {
            const tempFolder: string = path.join(os.tmpdir(), fsUtil.getRandomHexString());
            await fse.ensureDir(tempFolder);
            try {
                await fse.writeFile(path.join(tempFolder, 'packages.csproj'), packagesCsproj);

                // 'dotnet new --install' doesn't allow you to specify a source when installing templates
                // Once these templates are published to Nuget.org, we can just call 'dotnet new --install' directly and skip all the tempFolder/restore stuff
                outputChannel.show();
                outputChannel.appendLine(localize('installingTemplates', 'Downloading dotnet templates for Azure Functions...'));
                await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'restore', '--packages', '.', '--source', 'https://www.myget.org/F/azure-appservice/api/v3/index.json', '--source', 'https://api.nuget.org/v3/index.json');

                const fullProjectPackageId: string = `${projectPackageId}.${templateVersion}`;
                outputChannel.appendLine(localize('projectPackageId', 'Installing  "{0}"', fullProjectPackageId));
                await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--install', path.join(projectPackageId, templateVersion, `${fullProjectPackageId}.nupkg`));

                const fullFunctionsPackageId: string = `${functionsPackageId}.${templateVersion}`;
                outputChannel.appendLine(localize('functionsPackageId', 'Installing  "{0}"', fullFunctionsPackageId));
                await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--install', path.join(functionsPackageId, templateVersion, `${fullFunctionsPackageId}.nupkg`));

                outputChannel.appendLine(localize('finishedInstallingTemplates', 'Finished installing Azure Functions templates.'));
            } finally {
                await fse.remove(tempFolder);
            }
        }
    }
}
