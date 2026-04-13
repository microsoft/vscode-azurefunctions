/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, DialogResponses, nonNullValueAndProp, randomUtils, type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg, withNamedArg } from '@microsoft/vscode-processutils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getMajorVersion, type FuncVersion } from '../../../FuncVersion';
import { ConnectionKey, ProjectLanguage, gitignoreFileName, hostFileName, localSettingsFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { MismatchBehavior, setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from "../../../localize";
import { executeDotnetTemplateCreate, validateDotnetInstalled } from '../../../templates/dotnet/executeDotnetTemplateCommand';
import { cpUtils } from '../../../utils/cpUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { type IProjectWizardContext } from '../IProjectWizardContext';
import { ProjectCreateStepBase } from './ProjectCreateStepBase';

export class DotnetProjectCreateStep extends ProjectCreateStepBase {
    private constructor() {
        super();
    }

    public static async createStep(context: IActionContext): Promise<DotnetProjectCreateStep> {
        await validateDotnetInstalled(context);
        return new DotnetProjectCreateStep();
    }

    public async executeCore(context: IProjectWizardContext): Promise<void> {
        const version: FuncVersion = nonNullProp(context, 'version');
        const language: ProjectLanguage = nonNullProp(context, 'language');

        const projectName: string = path.basename(context.projectPath);
        const projName: string = projectName + language === ProjectLanguage.FSharp ? '.fsproj' : '.csproj';

        const workerRuntime = nonNullProp(context, 'workerRuntime');
        if (!context.containerizedProject) {
            await this.confirmOverwriteExisting(context, projName);
        }

        const majorVersion: string = getMajorVersion(version);
        let identity: string = workerRuntime.projectTemplateId.csharp;
        if (language === ProjectLanguage.FSharp) {
            identity = identity.replace('CSharp', 'FSharp'); // they don't have FSharp in the feed yet
        }
        const functionsVersion: string = 'v' + majorVersion;
        const projTemplateKey = nonNullProp(context, 'projectTemplateKey');

        const templateArgs: Record<string, string> = {
            name: projectName,
            AzureFunctionsVersion: functionsVersion,
        };
        if (context.workerRuntime?.targetFramework) {
            templateArgs.Framework = context.workerRuntime.targetFramework;
        }

        // Create the project from the .NET template first so files are written into a clean directory
        await executeDotnetTemplateCreate(context, version, projTemplateKey, context.projectPath, identity, templateArgs);

        // For containerized projects, generate the Dockerfile by running func init --docker in an
        // isolated temp directory, then copy only the Dockerfile into the project. This avoids
        // func init's internal dotnet new conflicting with files already created by the template.
        if (context.containerizedProject) {
            const runtime = context.workerRuntime?.capabilities.includes('isolated') ? 'dotnet-isolated' : 'dotnet';
            const tempDir = path.join(os.tmpdir(), `azfunc-docker-${randomUtils.getRandomHexString()}`);
            try {
                await fs.promises.mkdir(tempDir, { recursive: true });
                const args = composeArgs(
                    withArg('init'),
                    withNamedArg('--worker-runtime', runtime),
                    withNamedArg('--target-framework', runtime === 'dotnet' ? undefined : nonNullValueAndProp(context.workerRuntime, 'targetFramework')),
                    withArg('--docker'),
                )();
                await cpUtils.executeCommand(ext.outputChannel, tempDir, "func", args);

                // Copy only the Dockerfile (and .dockerignore if present) into the project
                for (const file of ['Dockerfile', '.dockerignore']) {
                    const src = path.join(tempDir, file);
                    const dest = path.join(context.projectPath, file);
                    try {
                        await fs.promises.copyFile(src, dest);
                    } catch {
                        // .dockerignore may not exist, that's fine
                    }
                }
            } finally {
                await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
            }
        }

        await setLocalAppSetting(context, context.projectPath, ConnectionKey.Storage, '', MismatchBehavior.Overwrite);
    }

    private async confirmOverwriteExisting(context: IProjectWizardContext, projName: string): Promise<void> {
        const filesToCheck: string[] = [projName, gitignoreFileName, localSettingsFileName, hostFileName];
        const existingFiles: string[] = [];
        for (const fileName of filesToCheck) {
            if (await AzExtFsExtra.pathExists(path.join(context.projectPath, fileName))) {
                existingFiles.push(fileName);
            }
        }

        if (existingFiles.length > 0) {
            const message: string = localize('overwriteExistingFiles', 'Overwrite existing files?: {0}', existingFiles.join(', '));
            await context.ui.showWarningMessage(message, { modal: true, stepName: 'overwriteExistingFiles' }, DialogResponses.yes);
        }
    }
}
