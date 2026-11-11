/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type CancellationToken, type Progress } from 'vscode';
import { ProjectLanguage, requirementsFileName } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { cpUtils } from '../../utils/cpUtils';
import { installNodeDependencies } from '../../utils/nodeJsUtils';
import { venvUtils } from '../../utils/venvUtils';

export interface IProjectPrepareContext extends IActionContext {
    projectPath: string;
    language: ProjectLanguage;
    venvName?: string;
    cancellationToken: CancellationToken;
    projectPrepared?: boolean;
}

export class ProjectPrepareStep extends AzureWizardExecuteStep<IProjectPrepareContext> {
    public priority = 20;

    public async execute(context: IProjectPrepareContext, progress: Progress<{ message?: string }>): Promise<void> {
        this.checkCancellation(context);
        progress.report({ message: localize('installingProjectDependencies', 'Installing project dependencies...') });
        switch (context.language) {
            case ProjectLanguage.JavaScript:
            case ProjectLanguage.TypeScript:
                await installNodeDependencies(context.projectPath);
                this.checkCancellation(context);
                if (context.language === ProjectLanguage.TypeScript) {
                    progress.report({ message: localize('buildingNewProject', 'Building the project...') });
                    await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'npm', ['run', 'build']);
                }
                break;
            case ProjectLanguage.CSharp:
                progress.report({ message: localize('restoringAndBuildingNewProject', 'Restoring dependencies and building the project...') });
                await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'dotnet', ['build']);
                break;
            case ProjectLanguage.Python:
                if (!context.venvName) {
                    try {
                        await context.ui.showWarningMessage(localize(
                            'connectorProjectNoVenv',
                            'Project files were created, but dependencies have not been installed. Select a Python virtual environment and install requirements.txt before running the project.',
                        ), { title: localize('ok', 'OK') });
                    } catch (error) {
                        // Dismissing this warning does not cancel the user's choice to skip the environment.
                        if (!isUserCancelledError(error)) {
                            throw error;
                        }
                    }
                    return;
                }
                await cpUtils.executeCommand(ext.outputChannel, context.projectPath,
                    venvUtils.getVenvPythonPath(context.projectPath, context.venvName),
                    ['-m', 'pip', 'install', '-r', requirementsFileName]);
                break;
        }
        this.checkCancellation(context);
        context.projectPrepared = true;
    }

    public shouldExecute(context: IProjectPrepareContext): boolean {
        return !context.projectPrepared && [ProjectLanguage.JavaScript, ProjectLanguage.TypeScript,
            ProjectLanguage.CSharp, ProjectLanguage.Python].includes(context.language);
    }

    private checkCancellation(context: IProjectPrepareContext): void {
        if (context.cancellationToken.isCancellationRequested) {
            throw new UserCancelledError('projectPreparation');
        }
    }
}
