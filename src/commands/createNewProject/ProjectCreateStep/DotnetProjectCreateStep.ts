/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { gitignoreFileName, hostFileName, localSettingsFileName, ProjectLanguage, ProjectRuntime } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import { executeDotnetTemplateCommand } from '../../../templates/executeDotnetTemplateCommand';
import { cpUtils } from '../../../utils/cpUtils';
import { dotnetUtils } from '../../../utils/dotnetUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { IProjectWizardContext } from '../IProjectWizardContext';
import { ProjectCreateStepBase } from './ProjectCreateStepBase';

export class DotnetProjectCreateStep extends ProjectCreateStepBase {
    private constructor() {
        super();
    }

    public static async createStep(actionContext: IActionContext): Promise<DotnetProjectCreateStep> {
        await dotnetUtils.validateDotnetInstalled(actionContext);
        return new DotnetProjectCreateStep();
    }

    public async executeCore(wizardContext: IProjectWizardContext): Promise<void> {
        const runtime: ProjectRuntime = nonNullProp(wizardContext, 'runtime');
        const language: ProjectLanguage = nonNullProp(wizardContext, 'language');

        const projectName: string = path.basename(wizardContext.projectPath);
        const projName: string = projectName + language === ProjectLanguage.FSharp ? '.fsproj' : '.csproj';
        await this.confirmOverwriteExisting(wizardContext.projectPath, projName);

        const templateLanguage: string = language === ProjectLanguage.FSharp ? 'FSharp' : 'CSharp';
        const identity: string = `Microsoft.AzureFunctions.ProjectTemplate.${templateLanguage}.${runtime === ProjectRuntime.v1 ? '1' : '2'}.x`;
        const functionsVersion: string = runtime === ProjectRuntime.v1 ? 'v1' : 'v2';
        await executeDotnetTemplateCommand(runtime, wizardContext.projectPath, 'create', '--identity', identity, '--arg:name', cpUtils.wrapArgInQuotes(projectName), '--arg:AzureFunctionsVersion', functionsVersion);
    }

    private async confirmOverwriteExisting(projectPath: string, projName: string): Promise<void> {
        const filesToCheck: string[] = [projName, gitignoreFileName, localSettingsFileName, hostFileName];
        const existingFiles: string[] = [];
        for (const fileName of filesToCheck) {
            if (await fse.pathExists(path.join(projectPath, fileName))) {
                existingFiles.push(fileName);
            }
        }

        if (existingFiles.length > 0) {
            const message: string = localize('overwriteExistingFiles', 'Overwrite existing files?: {0}', existingFiles.join(', '));
            await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes);
        }
    }
}
