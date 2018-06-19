/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
// tslint:disable-next-line:no-require-imports
import request = require('request-promise');
import { QuickPickOptions } from "vscode";
import { IActionContext, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from "../localize";
import { tryGetTemplateVersionSetting } from '../templates/TemplateData';
import { functionRuntimeUtils } from '../utils/functionRuntimeUtils';
import { cpUtils } from "./cpUtils";
import * as fsUtil from './fs';
import { cliFeedJsonResponse, getFeedRuntime, tryGetCliFeedJson } from './getCliFeedJson';

const projectPackageId: string = 'microsoft.azurefunctions.projecttemplates';
const functionsPackageId: string = 'azure.functions.templates';
const templatesKey: string = 'cSharpFunctionsTemplates';

async function validateDotnetInstalled(): Promise<void> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'dotnet', '--version');
    } catch (error) {
        throw new Error(localize('dotnetNotInstalled', 'You must have the .NET CLI installed to perform this operation.'));
    }
}

async function downloadDotnetTemplates(url: string, tempFolder: string, packageId: string): Promise<string> {
    const fullPath: string = path.join(tempFolder, `${packageId}.nupkg`);
    return new Promise(async (resolve: (fullPath: string) => void, reject: (e: Error) => void): Promise<void> => {
        const templateOptions: request.OptionsWithUri = {
            method: 'GET',
            uri: url
        };

        request(templateOptions, (err: Error) => {
            // tslint:disable-next-line:strict-boolean-expressions
            if (err) {
                reject(err);
            }
        }).pipe(fse.createWriteStream(fullPath).on('finish', () => {
            resolve(fullPath);
        }));
    });
}

export namespace dotnetUtils {
    export const funcProjectId: string = 'azureFunctionsProjectTemplates';

    export async function validateTemplatesInstalled(actionContext: IActionContext): Promise<void> {
        await validateDotnetInstalled();

        const listOutput: string = await cpUtils.executeCommand(undefined, undefined, 'dotnet', 'new', '--list');
        const templatesInstalled: boolean = listOutput.includes(funcProjectId) && listOutput.includes('HttpTrigger');

        const templatesVersion: string | undefined = templatesInstalled ? ext.context.globalState.get(templatesKey) : undefined;
        const cliFeedJson: cliFeedJsonResponse | undefined = await tryGetCliFeedJson();
        if (!cliFeedJson) {
            if (templatesInstalled) {
                return;
            } else {
                throw new Error(localize('retryInternet', 'There was an error in retrieving the templates.  Recheck your internet connection and try again.'));
            }
        }

        let runtime: ProjectRuntime | undefined = await functionRuntimeUtils.tryGetLocalRuntimeVersion();
        if (runtime === undefined) {
            const picks: IAzureQuickPickItem<ProjectRuntime>[] = [
                { label: ProjectRuntime.beta, description: '(.NET Core)', data: ProjectRuntime.beta },
                { label: ProjectRuntime.one, description: '(.NET Framework)', data: ProjectRuntime.one }
            ];
            const options: QuickPickOptions = { placeHolder: localize('pickTemplateVersion', 'Select the template version to install') };
            runtime = (await ext.ui.showQuickPick(picks, options)).data;
        }

        const latestRelease: string = await tryGetTemplateVersionSetting(actionContext, cliFeedJson, runtime) || cliFeedJson.tags[getFeedRuntime(runtime)].release;
        if (templatesVersion !== latestRelease) {
            ext.outputChannel.show();
            ext.outputChannel.appendLine(localize('updatingTemplates', 'Updating .NET templates for Azure Functions...'));
            if (templatesInstalled) {
                await uninstallTemplates();
            }

            const tempFolder: string = path.join(os.tmpdir(), fsUtil.getRandomHexString());
            await fse.ensureDir(tempFolder);
            try {
                ext.outputChannel.appendLine(localize('installFuncProject', 'Installing "{0}"', projectPackageId));
                const projectTemplatePath: string = await downloadDotnetTemplates(cliFeedJson.releases[latestRelease].projectTemplates, tempFolder, projectPackageId);
                await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--install', projectTemplatePath);

                ext.outputChannel.appendLine(localize('installFuncs', 'Installing "{0}"', functionsPackageId));
                const functionsTemplatePath: string = await downloadDotnetTemplates(cliFeedJson.releases[latestRelease].itemTemplates, tempFolder, functionsPackageId);
                await cpUtils.executeCommand(undefined, tempFolder, 'dotnet', 'new', '--install', functionsTemplatePath);

                ext.context.globalState.update(templatesKey, latestRelease);
            } finally {
                await fse.remove(tempFolder);
            }
        }
    }

    export async function uninstallTemplates(): Promise<void> {
        await validateDotnetInstalled();

        ext.outputChannel.show();
        ext.outputChannel.appendLine(localize('uninstallFuncProject', 'Uninstalling "{0}"', projectPackageId));
        await cpUtils.executeCommand(undefined, undefined, 'dotnet', 'new', '--uninstall', projectPackageId);
        ext.outputChannel.appendLine(localize('uninstallFuncs', 'Uninstalling "{0}"', functionsPackageId));
        await cpUtils.executeCommand(undefined, undefined, 'dotnet', 'new', '--uninstall', functionsPackageId);
        ext.outputChannel.appendLine(localize('finishedUninstallingTemplates', 'Finished uninstalling Azure Functions templates.'));
        ext.context.globalState.update(templatesKey, undefined);
    }
}
