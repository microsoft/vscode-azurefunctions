/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { localize } from '../../../localize';
import { gitUtils } from '../../../utils/gitUtils';
import { type IProjectWizardContext } from '../IProjectWizardContext';

export abstract class ProjectCreateStepBase extends AzureWizardExecuteStepWithActivityOutput<IProjectWizardContext> {
    public priority: number = 10;
    public stepName: string = 'ProjectCreateStepBase';
    public getTreeItemLabel(context: IProjectWizardContext): string {
        return localize('creatingProject', 'Create new {0} project in "{1}"', context.language, context.projectPath);
    }
    public getOutputLogSuccess(context: IProjectWizardContext): string {
        return localize('createdProject', 'Succesfully created new {0} project in "{1}".', context.language, context.projectPath);
    }
    public getOutputLogFail(context: IProjectWizardContext): string {
        return localize('failedToCreateProject', 'Failed to create new {0} project in "{1}".', context.language, context.projectPath);
    }
    public getOutputLogProgress(context: IProjectWizardContext): string {
        return localize('creatingProject', 'Creating new {0} project in "{1}"...', context.language, context.projectPath);
    }

    public abstract executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void>;

    public async execute(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        context.telemetry.properties.projectLanguage = context.language;
        context.telemetry.properties.projectRuntime = context.version;
        context.telemetry.properties.openBehavior = context.openBehavior;

        progress.report({ message: localize('creating', 'Creating new project...') });
        await AzExtFsExtra.ensureDir(context.projectPath);

        await this.executeCore(context, progress);

        if (await gitUtils.isGitInstalled(context.workspacePath) && !await gitUtils.isInsideRepo(context.workspacePath)) {
            await gitUtils.gitInit(context.workspacePath);
        }

        // OpenFolderStep sometimes restarts the extension host. Adding a second event here to see if we're losing any telemetry
        await callWithTelemetryAndErrorHandling('azureFunctions.createNewProjectStarted', (startedContext: IActionContext) => {
            Object.assign(startedContext, context);
        });
    }

    public shouldExecute(_context: IProjectWizardContext): boolean {
        return true;
    }
}
