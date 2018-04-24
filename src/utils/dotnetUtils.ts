/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { MessageItem, OutputChannel, QuickPickItem, QuickPickOptions } from "vscode";
import { DialogResponses, IAzureUserInput } from 'vscode-azureextensionui';
import { isWindows, ProjectRuntime } from '../constants';
import { localize } from "../localize";
import { cpUtils } from "./cpUtils";
import * as fsUtil from './fs';

export namespace dotnetUtils {
    const projectPackageId: string = 'microsoft.azurefunctions.projecttemplates';
    const functionsPackageId: string = 'azure.functions.templates';
    const betaTemplateVersion: string = '2.0.0-beta-10167';
    const v1TemplateVersion: string = '1.0.3.10168';

    function getPackagesCsproj(version: string): string {
        // tslint:disable:no-multiline-string
        return `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="${projectPackageId}" Version="${version}" />
    <PackageReference Include="${functionsPackageId}" Version="${version}" />
  </ItemGroup>
</Project>
`;
    }

    async function validateDotnetInstalled(): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, undefined, 'dotnet', '--version');
        } catch (error) {
            throw new Error(localize('azFunc.dotnetNotInstalled', 'You must have the .NET CLI installed to perform this operation.'));
        }
    }

    export const funcProjectId: string = 'azureFunctionsProjectTemplates';

    export async function validateTemplatesInstalled(outputChannel: OutputChannel, ui: IAzureUserInput): Promise<void> {
        await validateDotnetInstalled();
        const listOutput: string = await cpUtils.executeCommand(undefined, undefined, 'dotnet', 'new', '--list');
        if (!listOutput.includes(funcProjectId) || !listOutput.includes('HttpTrigger')) {
            const installTemplates: MessageItem = { title: localize('installTemplates', 'Install Templates') };
            await ui.showWarningMessage(localize('noDotnetFuncTemplates', 'You must have the Azure Functions templates installed for the .NET CLI.'), installTemplates, DialogResponses.cancel);
            await installDotnetTemplates(ui, outputChannel);
        }
    }

    export async function uninstallDotnetTemplates(outputChannel: OutputChannel): Promise<void> {
        await validateDotnetInstalled();

        const tempFolder: string = os.tmpdir();

        outputChannel.show();
        outputChannel.appendLine(localize('uninstallFuncProject', 'Uninstalling "{0}"', projectPackageId));
        await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--uninstall', projectPackageId);
        outputChannel.appendLine(localize('uninstallFuncs', 'Uninstalling "{0}"', functionsPackageId));
        await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--uninstall', functionsPackageId);
        outputChannel.appendLine(localize('finishedUninstallingTemplates', 'Finished uninstalling Azure Functions templates.'));
    }

    export async function installDotnetTemplates(ui: IAzureUserInput, outputChannel: OutputChannel): Promise<void> {
        await validateDotnetInstalled();

        let templateVersion: string = betaTemplateVersion;

        if (isWindows) {
            const picks: QuickPickItem[] = [
                { label: ProjectRuntime.beta, description: '(.NET Core)' },
                { label: ProjectRuntime.one, description: '(.NET Framework)' }
            ];
            const options: QuickPickOptions = { placeHolder: localize('pickTemplateVersion', 'Select the template version to install') };
            const versionResult: QuickPickItem = await ui.showQuickPick(picks, options);
            if (versionResult.label === ProjectRuntime.one) {
                templateVersion = v1TemplateVersion;
            }
        }

        const packagesCsproj: string = getPackagesCsproj(templateVersion);

        const tempFolder: string = path.join(os.tmpdir(), fsUtil.getRandomHexString());
        await fse.ensureDir(tempFolder);
        try {
            await fse.writeFile(path.join(tempFolder, 'packages.csproj'), packagesCsproj);

            // 'dotnet new --install' doesn't allow you to specify a source when installing templates
            // Once these templates are published to Nuget.org, we can just call 'dotnet new --install' directly and skip all the tempFolder/restore stuff
            outputChannel.show();
            outputChannel.appendLine(localize('downloadingTemplates', 'Downloading .NET templates for Azure Functions...'));
            await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'restore', '--packages', '.', '--source', 'https://www.myget.org/F/azure-appservice/api/v3/index.json', '--source', 'https://api.nuget.org/v3/index.json');

            const fullProjectPackageId: string = `${projectPackageId}.${templateVersion}`;
            outputChannel.appendLine(localize('installFuncProject', 'Installing "{0}"', fullProjectPackageId));
            await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--install', path.join(projectPackageId, templateVersion, `${fullProjectPackageId}.nupkg`));

            const fullFunctionsPackageId: string = `${functionsPackageId}.${templateVersion}`;
            outputChannel.appendLine(localize('installFuncs', 'Installing "{0}"', fullFunctionsPackageId));
            await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--install', path.join(functionsPackageId, templateVersion, `${fullFunctionsPackageId}.nupkg`));

            outputChannel.appendLine(localize('finishedInstallingTemplates', 'Finished installing Azure Functions templates.'));
            outputChannel.appendLine(localize('howToUninstall', 'NOTE: You may uninstall or reinstall the templates with the following steps:'));
            outputChannel.appendLine(localize('howToUninstall1', '1. Open Command Palette (View -> Command Palette...)'));
            outputChannel.appendLine(localize('howToUninstall2', '2. Search for "Azure Functions" and "install" or "uninstall"'));
            outputChannel.appendLine(localize('howToUninstall3', '3. Run the corresponding command for .NET templates'));
        } finally {
            await fse.remove(tempFolder);
        }
    }
}
