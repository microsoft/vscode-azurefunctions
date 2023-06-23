/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { IFunctionWizardContext } from './IFunctionWizardContext';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
export class JobsListStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    public constructor(readonly isProjectWizard?: boolean) {
        super();
    }

    public async prompt(context: IFunctionWizardContext): Promise<void> {
        // TODO: come up with a better placeholder
        const placeHolder: string = localize('selectJob', 'Select a job');
        context.job = (await context.ui.showQuickPick(context.functionTemplateV2!.wizards.map((w) => { return { label: w.name, data: w } }), { placeHolder })).data;
    }

    public shouldPrompt(context: IFunctionWizardContext): boolean {
        return !context.job && !!context.functionTemplateV2;
    }

    public async getSubWizard(context: IFunctionWizardContext): Promise<IWizardOptions<IFunctionWizardContext> | undefined> {
        // create steps based on the job
        if (context.job) {
            const promptSteps: AzureWizardPromptStep<IFunctionWizardContext>[] = [];
            context.job.prompts.map(_p => {
                promptSteps.push();
            });

            const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];
            context.job.executes.map(_e => {
                executeSteps.push();
            });

            return { promptSteps, executeSteps };
        }

        return undefined;
    }

    public async configureBeforePrompt(context: IFunctionWizardContext): Promise<void> {
        // if this is a new project, we can default to the new project job
        if (this.isProjectWizard) {
            context.job = context.functionTemplateV2!.wizards.find(j => j.type === 'CreateNewApp');
        }
    }
}
