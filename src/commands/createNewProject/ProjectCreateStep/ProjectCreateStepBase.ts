/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { Progress } from 'vscode';
import { AzureWizardExecuteStep, callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { gitUtils } from '../../../utils/gitUtils';
import { IProjectWizardContext } from '../IProjectWizardContext';

export abstract class ProjectCreateStepBase extends AzureWizardExecuteStep<IProjectWizardContext> {
    public abstract async executeCore(wizardContext: IProjectWizardContext): Promise<void>;

    public async execute(wizardContext: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        wizardContext.actionContext.properties.projectLanguage = wizardContext.language;
        wizardContext.actionContext.properties.projectRuntime = wizardContext.runtime;
        wizardContext.actionContext.properties.openBehavior = wizardContext.openBehavior;

        progress.report({ message: localize('creating', 'Creating new project...') });
        await fse.ensureDir(wizardContext.projectPath);

        await this.executeCore(wizardContext);

        if (await gitUtils.isGitInstalled(wizardContext.workspacePath) && !await gitUtils.isInsideRepo(wizardContext.workspacePath)) {
            await gitUtils.gitInit(ext.outputChannel, wizardContext.workspacePath);
        }

        // OpenFolderStep sometimes restarts the extension host. Adding a second event here to see if we're losing any telemetry
        await callWithTelemetryAndErrorHandling('azureFunctions.createNewProjectStarted', function (this: IActionContext): void {
            Object.assign(this, wizardContext.actionContext);
        });
    }

    public shouldExecute(_wizardContext: IProjectWizardContext): boolean {
        return true;
    }
}
