/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { Progress } from 'vscode';
import { AzureWizardExecuteStep, callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { localize } from '../../../localize';
import { gitUtils } from '../../../utils/gitUtils';
import { IProjectWizardContext } from '../IProjectWizardContext';

export abstract class ProjectCreateStepBase extends AzureWizardExecuteStep<IProjectWizardContext> {
    public priority: number = 10;

    public abstract executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void>;

    public async execute(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        context.telemetry.properties.projectLanguage = context.language;
        context.telemetry.properties.projectRuntime = context.version;
        context.telemetry.properties.openBehavior = context.openBehavior;

        progress.report({ message: localize('creating', 'Creating new project...') });
        await fse.ensureDir(context.projectPath);

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
