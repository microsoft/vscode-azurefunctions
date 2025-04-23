/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { JobType, type ParsedJob } from '../../templates/script/parseScriptTemplatesV2';
import { assertTemplateIsV2 } from '../../utils/templateVersionUtils';
import { isFunctionProject } from '../createNewProject/verifyIsProject';
import { type FunctionV2WizardContext, type IFunctionWizardContext } from './IFunctionWizardContext';
import { actionStepFactory } from './actionStepsV2/actionStepFactory';
import { promptStepFactory } from './promptStepsV2/promptStepFactory';

export class JobsListStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    public constructor(readonly isProjectWizard?: boolean) {
        super();
    }

    public async prompt(context: FunctionV2WizardContext): Promise<void> {
        const placeHolder: string = localize('selectJob', 'Select template creation type');
        context.job = (await context.ui.showQuickPick(this.getPicks(context), { placeHolder })).data;
    }

    public shouldPrompt(context: FunctionV2WizardContext): boolean {
        return !context.job && !!context.functionTemplate;
    }

    public async getSubWizard(context: FunctionV2WizardContext): Promise<IWizardOptions<FunctionV2WizardContext> | undefined> {
        if (context.job) {
            const promptSteps: AzureWizardPromptStep<FunctionV2WizardContext>[] = [];
            context.job.parsedInputs.map(pi => {
                promptSteps.push(promptStepFactory(pi));
            });

            const executeSteps: AzureWizardExecuteStep<FunctionV2WizardContext>[] = [];
            context.activityTitle = context.job.name;
            context.job.parsedActions.map((pa, index) => {
                // add index to increment the priority number; start at 500 so other execute steps can be injected
                executeSteps.push(actionStepFactory(pa, index + 1 + 500));
            });

            return { promptSteps, executeSteps };
        }

        return undefined;
    }

    public async configureBeforePrompt(context: FunctionV2WizardContext): Promise<void> {
        // if this is a new project, we can default to the new project job
        if (this.isProjectWizard && !!context.functionTemplate) {
            assertTemplateIsV2(context.functionTemplate);
            context.job = context.functionTemplate.wizards.find(j => j.type === JobType.CreateNewApp);
        }
    }

    private async getPicks(context: FunctionV2WizardContext): Promise<IAzureQuickPickItem<ParsedJob>[]> {
        assertTemplateIsV2(context.functionTemplate);
        let picks = context.functionTemplate.wizards.map((w) => { return { label: w.name, data: w } });
        // verify if this is a function project-- if so, remove the createNewApp job
        if (await isFunctionProject(context.projectPath)) {
            picks = picks.filter(p => p.data.type !== JobType.CreateNewApp);
        }

        return picks;
    }
}
