/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp, nonNullValueAndProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localSettingsDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerClient, type DurableTaskSchedulerResource } from '../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient';
import { type IDTSAzureConnectionWizardContext } from '../IDTSConnectionWizardContext';
import { DurableTaskHubListStep } from './DurableTaskHubListStep';
import { DurableTaskSchedulerCreateStep } from './DurableTaskSchedulerCreateStep';
import { DurableTaskSchedulerNameStep } from './DurableTaskSchedulerNameStep';

export class DurableTaskSchedulerListStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this.schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async prompt(context: T): Promise<void> {
        context.dts = (await context.ui.showQuickPick(await this.getPicks(context), {
            placeHolder: localize('selectTaskScheduler', 'Select a Durable Task Scheduler'),
        })).data;

        context.telemetry.properties.usedLocalDTSConnectionSettings = context.suggestedDTSEndpointLocalSettings ? String(context.dts?.properties.endpoint === context.suggestedDTSEndpointLocalSettings) : undefined;
    }

    public shouldPrompt(context: T): boolean {
        return !context.dts;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        if (!context.dts) {
            promptSteps.push(new DurableTaskSchedulerNameStep(this.schedulerClient));
            executeSteps.push(new DurableTaskSchedulerCreateStep(this.schedulerClient));
        }

        promptSteps.push(new DurableTaskHubListStep(this.schedulerClient));
        return { promptSteps, executeSteps };
    }

    private async getPicks(context: T): Promise<IAzureQuickPickItem<DurableTaskSchedulerResource | undefined>[]> {
        const resourceGroupName: string = nonNullValueAndProp(context.resourceGroup, 'name');
        const schedulers: DurableTaskSchedulerResource[] = await this.schedulerClient.getSchedulers(nonNullProp(context, 'subscription'), resourceGroupName) ?? [];

        const createPick = {
            label: localize('createTaskScheduler', '$(plus) Create new Durable Task Scheduler'),
            data: undefined,
        };

        return [
            createPick,
            ...schedulers.map(s => {
                return {
                    label: s.name,
                    description: s.properties.endpoint === context.suggestedDTSEndpointLocalSettings ? localSettingsDescription : undefined,
                    data: s,
                };
            }),
        ];
    }
}
