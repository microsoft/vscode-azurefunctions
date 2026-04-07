/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceManagementClient } from '@azure/arm-resources';
import { type AzExtClientContext, createAzureClient, type ILocationWizardContext, type IResourceGroupWizardContext, LocationListStep, parseClientContext, ResourceGroupCreateStep, ResourceGroupListStep, VerifyProvidersStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, AzureWizardExecuteStepWithActivityOutput, AzureWizardPromptStep, createSubscriptionContext, type ExecuteActivityContext, type IActionContext, type IAzureQuickPickItem, type ISubscriptionActionContext, subscriptionExperience } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { type Progress } from "vscode";
import { DurableTaskProvider, DurableTaskSchedulersResourceType } from "../../constants";
import { defaultDescription } from "../../constants-nls";
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type DurableTaskSchedulerClient, DurableTaskSchedulerSku } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type DurableTaskSchedulerDataBranchProvider } from "../../tree/durableTaskScheduler/DurableTaskSchedulerDataBranchProvider";
import { createActivityContext } from "../../utils/activityUtils";
import { withCancellation } from "../../utils/cancellation";

interface ICreateSchedulerContext extends ISubscriptionActionContext, ILocationWizardContext, IResourceGroupWizardContext, ExecuteActivityContext {
    subscription?: AzureSubscription;
    schedulerSku?: DurableTaskSchedulerSku;
    schedulerName?: string;
}

const schedulerNameRegex = /^[a-zA-Z0-9-]{3,64}$/;

class SchedulerNamingStep extends AzureWizardPromptStep<ICreateSchedulerContext> {
    async prompt(wizardContext: ICreateSchedulerContext): Promise<void> {
        wizardContext.schedulerName = await wizardContext.ui.showInputBox({
            prompt: localize('schedulerNamingStepPrompt', 'Enter a name for the new scheduler'),
            validateInput: (value: string) => {
                if (!schedulerNameRegex.test(value)) {
                    return localize('invalidSchedulerName', 'Name must be 3-64 characters and contain only letters, numbers, and hyphens.');
                }
                return undefined;
            }
        });
    }

    shouldPrompt(wizardContext: ICreateSchedulerContext): boolean {
        return !wizardContext.schedulerName;
    }
}

class SchedulerSkuStep extends AzureWizardPromptStep<ICreateSchedulerContext> {
    async prompt(wizardContext: ICreateSchedulerContext): Promise<void> {
        const picks: IAzureQuickPickItem<DurableTaskSchedulerSku>[] = [
            { label: localize('dtsSkuConsumption', 'Consumption'), description: defaultDescription, data: DurableTaskSchedulerSku.Consumption },
            { label: localize('dtsSkuDedicated', 'Dedicated'), data: DurableTaskSchedulerSku.Dedicated },
        ];
        wizardContext.schedulerSku = (await wizardContext.ui.showQuickPick(picks, {
            placeHolder: localize('schedulerSkuPrompt', 'Select a plan for the scheduler'),
        })).data;
    }

    shouldPrompt(wizardContext: ICreateSchedulerContext): boolean {
        return !wizardContext.schedulerSku;
    }
}

class SchedulerCreationStep extends AzureWizardExecuteStepWithActivityOutput<ICreateSchedulerContext> {
    priority: number = 110;
    readonly stepName: string = 'schedulerCreationStep';

    protected getTreeItemLabel = (context: ICreateSchedulerContext) => localize('createSchedulerLabel', 'Create Durable Task Scheduler "{0}"', context.schedulerName);
    protected getOutputLogSuccess = (context: ICreateSchedulerContext) => localize('createSchedulerSuccess', 'Successfully created Durable Task Scheduler "{0}".', context.schedulerName);
    protected getOutputLogFail = (context: ICreateSchedulerContext) => localize('createSchedulerFail', 'Failed to create Durable Task Scheduler "{0}".', context.schedulerName);

    constructor(private readonly schedulerClient: DurableTaskSchedulerClient) {
        super();
    }

    async execute(wizardContext: ICreateSchedulerContext, progress: Progress<{ message?: string; increment?: number; }>): Promise<void> {
        progress.report({ message: localize('creatingScheduler', 'Creating Durable Task Scheduler...') });

        const location = await LocationListStep.getLocation(wizardContext);
        const response = await this.schedulerClient.createScheduler(
            wizardContext.subscription as AzureSubscription,
            wizardContext.resourceGroup?.name as string,
            location.name,
            wizardContext.schedulerName as string,
            wizardContext.schedulerSku
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

export async function createResourcesClient(context: AzExtClientContext): Promise<ResourceManagementClient> {
    if (parseClientContext(context).isCustomCloud) {
        return <ResourceManagementClient><unknown>createAzureClient(context, (await import('@azure/arm-resources-profile-2020-09-01-hybrid')).ResourceManagementClient);
    } else {
        return createAzureClient(context, (await import('@azure/arm-resources')).ResourceManagementClient);
    }
}

export async function isDtsProviderRegistered(context: AzExtClientContext): Promise<boolean> {
    const resourcesClient = await createResourcesClient(context);

    const provider = await resourcesClient.providers.get(DurableTaskProvider);

    return provider.registrationState?.toLocaleLowerCase() === "registered";
}

export function createSchedulerCommandFactory(dataBranchProvider: DurableTaskSchedulerDataBranchProvider, schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, node?: { subscription: AzureSubscription }): Promise<void> => {
        const subscription = node?.subscription ?? await subscriptionExperience(actionContext, ext.rgApiV2.resources.azureResourceTreeDataProvider);

        const wizardContext: ICreateSchedulerContext =
        {
            subscription,

            ...actionContext,
            ...createSubscriptionContext(subscription),
            ...await createActivityContext({ withChildren: true }),
        };

        if (!await isDtsProviderRegistered(wizardContext)) {
            await actionContext.ui.showWarningMessage(
                localize('dtsProviderNotRegistered', 'The Durable Task Scheduler provider ({0}) is not registered for the subscription ({1}).', DurableTaskProvider, subscription.subscriptionId),
                {
                    learnMoreLink: 'https://aka.ms/dts-preview-info'
                });

            return;
        }

        const promptSteps: AzureWizardPromptStep<ICreateSchedulerContext>[] = [
            new SchedulerNamingStep(),
            new SchedulerSkuStep(),
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
                    new VerifyProvidersStep([DurableTaskProvider]),
                    new ResourceGroupCreateStep(),
                    new SchedulerCreationStep(schedulerClient)
                ],
                title: localize('createSchedulerWizardTitle', 'Create Durable Task Scheduler')
            });

        await wizard.prompt();

        wizardContext.activityTitle = localize('createSchedulerActivityTitle', 'Create Durable Task Scheduler \'{0}\'', wizardContext.schedulerName);

        try {
            await wizard.execute();
        }
        finally {
            dataBranchProvider.refresh();
        }
    };
}
