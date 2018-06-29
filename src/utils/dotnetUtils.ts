/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { QuickPickOptions } from "vscode";
import { callWithTelemetryAndErrorHandling, IActionContext, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { tryGetLocalRuntimeVersion } from '../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from "../localize";
import { tryGetTemplateVersionSetting } from '../templates/TemplateData';
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

export namespace dotnetUtils {
    export const funcProjectId: string = 'azureFunctionsProjectTemplates';

    export async function validateTemplatesInstalled(): Promise<void> {
        await validateDotnetInstalled();

        const listOutput: string = await cpUtils.executeCommand(undefined, undefined, 'dotnet', 'new', '--list');
        const templatesInstalled: boolean = listOutput.includes(funcProjectId) && listOutput.includes('HttpTrigger');

        try {
            await callWithTelemetryAndErrorHandling('azureFunctions.validateDotnetTemplatesInstalled', async function (this: IActionContext): Promise<void> {
                this.rethrowError = true;
                this.suppressErrorDisplay = true;
                this.properties.templatesInstalled = String(templatesInstalled);

                const templatesVersion: string | undefined = templatesInstalled ? ext.context.globalState.get(templatesKey) : undefined;
                this.properties.installedVersion = <string>templatesVersion;
                const cliFeedJson: cliFeedJsonResponse | undefined = await tryGetCliFeedJson();
                if (!cliFeedJson) {
                    throw new Error(localize('retryInternet', 'There was an error in retrieving the templates.  Recheck your internet connection and try again.'));
                }

                let runtime: ProjectRuntime | undefined = await tryGetLocalRuntimeVersion();
                if (runtime === undefined) {
                    const picks: IAzureQuickPickItem<ProjectRuntime>[] = Object.keys(ProjectRuntime).map((key: string) => {
                        const val: ProjectRuntime = <ProjectRuntime>ProjectRuntime[key];
                        return {
                            label: cliFeedJson.tags[getFeedRuntime(val)].displayName,
                            description: '',
                            data: val
                        };
                    });
                    const options: QuickPickOptions = { placeHolder: localize('pickTemplateVersion', 'Select the template version to install') };
                    runtime = (await ext.ui.showQuickPick(picks, options)).data;
                }

                const latestRelease: string = await tryGetTemplateVersionSetting(this, cliFeedJson, runtime) || cliFeedJson.tags[getFeedRuntime(runtime)].release;
                this.properties.latestVersion = latestRelease;
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
                        const projectTemplatePath: string = path.join(tempFolder, `${projectPackageId}.nupkg`);
                        await fsUtil.downloadFile(cliFeedJson.releases[latestRelease].projectTemplates, projectTemplatePath);
                        await cpUtils.executeCommand(undefined, undefined, 'dotnet', 'new', '--install', projectTemplatePath);

                        ext.outputChannel.appendLine(localize('installFuncs', 'Installing "{0}"', functionsPackageId));
                        const functionsTemplatePath: string = path.join(tempFolder, `${functionsPackageId}.nupkg`);
                        await fsUtil.downloadFile(cliFeedJson.releases[latestRelease].itemTemplates, functionsTemplatePath);
                        await cpUtils.executeCommand(undefined, undefined, 'dotnet', 'new', '--install', functionsTemplatePath);

                        ext.context.globalState.update(templatesKey, latestRelease);
                    } finally {
                        await fse.remove(tempFolder);
                    }
                }
            });
        } catch (error) {
            if (templatesInstalled) {
                // If the user already has some version of the templates installed, ignore errors and let them continue
                return;
            } else {
                throw error;
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
