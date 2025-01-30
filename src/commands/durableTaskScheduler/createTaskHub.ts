/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from '../../localize';
import { type DurableTaskSchedulerResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerResourceModel";
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { type Progress } from "vscode";

interface ICreateTaskHubContext extends IActionContext {
    readonly subscription: AzureSubscription;
    readonly resourceGroup: string;
    readonly schedulerName: string;
    taskHubName?: string;
}

class TaskHubNamingStep extends AzureWizardPromptStep<ICreateTaskHubContext> {
    async prompt(wizardContext: ICreateTaskHubContext): Promise<void> {
        wizardContext.taskHubName = await wizardContext.ui.showInputBox({
            prompt: localize('taskHubNamingStepPrompt', 'Enter a name for the new task hub')
        })
    }

    shouldPrompt(wizardContext: ICreateTaskHubContext): boolean {
        return !wizardContext.taskHubName;
    }
}

class TaskHubCreationStep extends AzureWizardExecuteStep<ICreateTaskHubContext> {
    priority: number = 1;

    constructor(private readonly schedulerClient: DurableTaskSchedulerClient) {
        super();
    }

    async execute(wizardContext: ICreateTaskHubContext, _: Progress<{ message?: string; increment?: number; }>): Promise<void> {
        await this.schedulerClient.createTaskHub(
            wizardContext.subscription,
            wizardContext.resourceGroup,
            wizardContext.schedulerName,
            wizardContext.taskHubName as string
        );
    }

    shouldExecute(wizardContext: ICreateTaskHubContext): boolean {
        return wizardContext.taskHubName !== undefined;
    }
}

export function createTaskHubCommandFactory(schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, scheduler: DurableTaskSchedulerResourceModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        const wizardContext: ICreateTaskHubContext =
            {
                ...actionContext,
                subscription: scheduler.subscription,
                resourceGroup: scheduler.resourceGroup,
                schedulerName: scheduler.name
            };

        const wizard = new AzureWizard<ICreateTaskHubContext>(
            wizardContext,
            {
                promptSteps: [new TaskHubNamingStep()],
                executeSteps: [new TaskHubCreationStep(schedulerClient)],
                title: localize('createTaskHubWizardTitle', 'Create Task Hub')
            });

        await wizard.prompt();

        try {
            await wizard.execute();
        }
        finally {
            scheduler.refresh();
        }
    }
}
