/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, DialogResponses, nonNullValueAndProp, type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg, withNamedArg } from '@microsoft/vscode-processutils';
import * as path from 'path';
import { getMajorVersion, type FuncVersion } from '../../../FuncVersion';
import { ConnectionKey, ProjectLanguage, gitignoreFileName, hostFileName, localSettingsFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { MismatchBehavior, setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from "../../../localize";
import { executeDotnetTemplateCommand, validateDotnetInstalled } from '../../../templates/dotnet/executeDotnetTemplateCommand';
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
        // For containerized function apps we need to call func init before intialization as we want the .csproj file to be overwritten with the correct version
        // currentely the version created by func init is behind the template version
        if (context.containerizedProject) {
            const runtime = context.workerRuntime?.capabilities.includes('isolated') ? 'dotnet-isolated' : 'dotnet';
            const args = composeArgs(
                withArg('init'),
                withNamedArg('--worker-runtime', runtime),
                withNamedArg('--target-framework', runtime === 'dotnet' ? undefined : nonNullValueAndProp(context.workerRuntime, 'targetFramework')), // targetFramework is only supported for dotnet-isolated projects // TODO: validate this is doing what I think it's doing
                withArg('--docker'),
            )();
            await cpUtils.executeCommand(ext.outputChannel, context.projectPath, "func", args);
        } else {
            await this.confirmOverwriteExisting(context, projName);
        }

        const majorVersion: string = getMajorVersion(version);
        let identity: string = workerRuntime.projectTemplateId.csharp;
        if (language === ProjectLanguage.FSharp) {
            identity = identity.replace('CSharp', 'FSharp'); // they don't have FSharp in the feed yet
        }
        const functionsVersion: string = 'v' + majorVersion;
        const projTemplateKey = nonNullProp(context, 'projectTemplateKey');

        const args = composeArgs(
            withNamedArg('--identity', identity),
            withNamedArg('--arg:name', projectName, { shouldQuote: true }),
            withNamedArg('--arg:AzureFunctionsVersion', functionsVersion),
            withNamedArg('--arg:Framework', context.workerRuntime?.targetFramework, { shouldQuote: true }), // defaults to net6.0 if there is no targetFramework
        )();

        await executeDotnetTemplateCommand(context, version, projTemplateKey, context.projectPath, 'create', args);

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
