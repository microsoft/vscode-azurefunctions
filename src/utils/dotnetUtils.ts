/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { OutputChannel } from "vscode";
import * as vscode from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { DialogResponses } from '../DialogResponses';
import { IUserInterface, Pick } from '../IUserInterface';
import { localize } from "../localize";
import { ProjectRuntime } from '../ProjectSettings';
import { VSCodeUI } from '../VSCodeUI';
import { cpUtils } from "./cpUtils";
import * as fsUtil from './fs';

export namespace dotnetUtils {
    const projectPackageId: string = 'microsoft.azurefunctions.projecttemplates';
    const functionsPackageId: string = 'azure.functions.templates';
    const betaTemplateVersion: string = '2.0.0-beta-10153';
    const v1TemplateVersion: string = '1.0.3.10152';

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

    async function validateDotnetInstalled(workingDirectory: string): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, workingDirectory, 'dotnet', '--version');
        } catch (error) {
            throw new Error(localize('azFunc.dotnetNotInstalled', 'You must have the "dotnet" cli installed to perform this operation.'));
        }
    }

    export const funcProjectId: string = 'azureFunctionsProjectTemplates';

    export async function validateTemplatesInstalled(outputChannel: OutputChannel, workingDirectory: string, ui: IUserInterface): Promise<void> {
        await validateDotnetInstalled(workingDirectory);
        const listOutput: string = await cpUtils.executeCommand(undefined, workingDirectory, 'dotnet', 'new', '--list');
        if (!listOutput.includes(funcProjectId) || !listOutput.includes('HttpTrigger')) {
            const installTemplates: vscode.MessageItem = { title: localize('installTemplates', 'Install Templates') };
            const result: vscode.MessageItem | undefined = await vscode.window.showWarningMessage(localize('noDotnetFuncTemplates', 'You must have the Azure Functions templates installed for the dotnet cli.'), installTemplates, DialogResponses.cancel);
            if (result === installTemplates) {
                await installDotnetTemplates(outputChannel, ui);
            } else {
                throw new UserCancelledError();
            }
        }
    }

    export async function uninstallDotnetTemplates(outputChannel: OutputChannel): Promise<void> {
        const tempFolder: string = os.tmpdir();

        outputChannel.show();
        outputChannel.appendLine(localize('uninstallFuncProject', 'Uninstalling "{0}"', projectPackageId));
        await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--uninstall', projectPackageId);
        outputChannel.appendLine(localize('uninstallFuncs', 'Uninstalling "{0}"', functionsPackageId));
        await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--uninstall', functionsPackageId);
        outputChannel.appendLine(localize('finishedUninstallingTemplates', 'Finished uninstalling Azure Functions templates.'));
    }

    export async function installDotnetTemplates(outputChannel: OutputChannel, ui: IUserInterface = new VSCodeUI()): Promise<void> {
        let templateVersion: string = betaTemplateVersion;

        if (/^win/.test(process.platform)) {
            const picks: Pick[] = [
                new Pick(ProjectRuntime.beta, '(.NET Core)'),
                new Pick(ProjectRuntime.one, '(.NET Framework)')
            ];
            const placeholder: string = localize('pickTemplateVersion', 'Select the template version to install');
            const versionResult: Pick = await ui.showQuickPick(picks, placeholder);
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
            outputChannel.appendLine(localize('downloadingTemplates', 'Downloading dotnet templates for Azure Functions...'));
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
            outputChannel.appendLine(localize('howToUninstall3', '3. Run the corresponding command for dotnet templates'));
        } finally {
            await fse.remove(tempFolder);
        }
    }
}
