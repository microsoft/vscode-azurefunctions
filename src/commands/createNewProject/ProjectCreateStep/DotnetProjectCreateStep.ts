/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as fse from 'fs-extra';
import * as path from 'path';
import { gitignoreFileName, hostFileName, localSettingsFileName, ProjectLanguage } from '../../../constants';
import { azureWebJobsStorageKey, MismatchBehavior, setLocalAppSetting } from '../../../funcConfig/local.settings';
import { FuncVersion, getMajorVersion } from '../../../FuncVersion';
import { localize } from "../../../localize";
import { executeDotnetTemplateCommand, validateDotnetInstalled } from '../../../templates/dotnet/executeDotnetTemplateCommand';
import { cpUtils } from '../../../utils/cpUtils';
import { IProjectWizardContext } from '../IProjectWizardContext';
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
        await this.confirmOverwriteExisting(context, projName);

        const majorVersion: string = getMajorVersion(version);
        const workerRuntime = nonNullProp(context, 'workerRuntime');
        let identity: string = workerRuntime.projectTemplateId.csharp;
        if (language === ProjectLanguage.FSharp) {
            identity = identity.replace('CSharp', 'FSharp'); // they don't have FSharp in the feed yet
        }
        const functionsVersion: string = 'v' + majorVersion;
        const projTemplateKey = nonNullProp(context, 'projectTemplateKey');
        await executeDotnetTemplateCommand(context, version, projTemplateKey, context.projectPath, 'create', '--identity', identity, '--arg:name', cpUtils.wrapArgInQuotes(projectName), '--arg:AzureFunctionsVersion', functionsVersion);

        await setLocalAppSetting(context, context.projectPath, azureWebJobsStorageKey, '', MismatchBehavior.Overwrite);
    }

    private async confirmOverwriteExisting(context: IProjectWizardContext, projName: string): Promise<void> {
        const filesToCheck: string[] = [projName, gitignoreFileName, localSettingsFileName, hostFileName];
        const existingFiles: string[] = [];
        for (const fileName of filesToCheck) {
            if (await fse.pathExists(path.join(context.projectPath, fileName))) {
                existingFiles.push(fileName);
            }
        }

        if (existingFiles.length > 0) {
            const message: string = localize('overwriteExistingFiles', 'Overwrite existing files?: {0}', existingFiles.join(', '));
            await context.ui.showWarningMessage(message, { modal: true, stepName: 'overwriteExistingFiles' }, DialogResponses.yes);
        }
    }
}
