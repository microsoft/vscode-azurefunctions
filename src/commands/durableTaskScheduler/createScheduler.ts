/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ILocationWizardContext, type IResourceGroupWizardContext, LocationListStep, ResourceGroupCreateStep, ResourceGroupListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, createSubscriptionContext, type ExecuteActivityContext, type IActionContext, type ISubscriptionActionContext, subscriptionExperience } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { DurableTaskProvider, DurableTaskSchedulersResourceType } from "../../constants";
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type DurableTaskSchedulerDataBranchProvider } from "../../tree/durableTaskScheduler/DurableTaskSchedulerDataBranchProvider";
import { createActivityContext } from "../../utils/activityUtils";
import { withCancellation } from "../../utils/cancellation";
import { type Progress } from "vscode";

interface ICreateSchedulerContext extends ISubscriptionActionContext, ILocationWizardContext, IResourceGroupWizardContext, ExecuteActivityContext {
    subscription?: AzureSubscription;
    schedulerName?: string;
}

class SchedulerNamingStep extends AzureWizardPromptStep<ICreateSchedulerContext> {
    async prompt(wizardContext: ICreateSchedulerContext): Promise<void> {
        wizardContext.schedulerName = await wizardContext.ui.showInputBox({
            prompt: localize('schedulerNamingStepPrompt', 'Enter a name for the new scheduler')
        })
    }

    shouldPrompt(wizardContext: ICreateSchedulerContext): boolean {
        return !wizardContext.schedulerName;
    }
}

class SchedulerCreationStep extends AzureWizardExecuteStep<ICreateSchedulerContext> {
    priority: number = 1;

    constructor(private readonly schedulerClient: DurableTaskSchedulerClient) {
        super();
    }

    async execute(wizardContext: ICreateSchedulerContext, _: Progress<{ message?: string; increment?: number; }>): Promise<void> {
        const location = await LocationListStep.getLocation(wizardContext);

        const response = await this.schedulerClient.createScheduler(
            wizardContext.subscription as AzureSubscription,
            wizardContext.resourceGroup?.name as string,
            location.name,
            wizardContext.schedulerName as string
        );

        const status = await withCancellation(token => response.status.waitForCompletion(token), 1000 * 60 * 30);

        if (status !== true) {
            throw new Error(localize('schedulerCreationFailed', 'The scheduler could not be created.'));
        }
    }

    shouldExecute(wizardContext: ICreateSchedulerContext): boolean {
        return wizardContext.subscription !== undefined
            && wizardContext.resourceGroup !== undefined
            && wizardContext.schedulerName !== undefined;
    }
}

export function createSchedulerCommandFactory(dataBranchProvider: DurableTaskSchedulerDataBranchProvider, schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, node?: { subscription: AzureSubscription }): Promise<void> => {
        const subscription = node?.subscription ?? await subscriptionExperience(actionContext, ext.rgApiV2.resources.azureResourceTreeDataProvider);

        const wizardContext =
        {
            subscription,

            ...actionContext,
            ...createSubscriptionContext(subscription),
            ...await createActivityContext()
        };

        const promptSteps: AzureWizardPromptStep<ICreateSchedulerContext>[] = [
            new SchedulerNamingStep(),
            new ResourceGroupListStep()
        ];

        LocationListStep.addProviderForFiltering(wizardContext, DurableTaskProvider, DurableTaskSchedulersResourceType);
        LocationListStep.addStep(wizardContext, promptSteps);

        const wizard = new AzureWizard<ICreateSchedulerContext>(
            wizardContext,
            {
                hideStepCount: true,
                promptSteps,
                executeSteps: [
                    new ResourceGroupCreateStep(),
                    new SchedulerCreationStep(schedulerClient)
                ],
                title: localize('createSchedulerWizardTitle', 'Create Durable Task Scheduler')
            });

        await wizard.prompt();

        try {
            await wizard.execute();
        }
        finally {
            dataBranchProvider.refresh();
        }
    }
}
