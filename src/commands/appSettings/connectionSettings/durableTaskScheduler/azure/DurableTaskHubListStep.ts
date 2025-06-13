/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp, nonNullValueAndProp, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localSettingsDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { HttpDurableTaskSchedulerClient, type DurableTaskHubResource, type DurableTaskSchedulerClient } from '../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient';
import { type IDTSAzureConnectionWizardContext } from '../IDTSConnectionWizardContext';
import { DurableTaskHubCreateStep } from './DurableTaskHubCreateStep';
import { DurableTaskHubNameStep } from './DurableTaskHubNameStep';

export class DurableTaskHubListStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this.schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async prompt(context: T): Promise<void> {
        context.dtsHub = (await context.ui.showQuickPick(await this.getPicks(context), {
            placeHolder: localize('selectTaskScheduler', 'Select a Durable Task Scheduler'),
        })).data;
    }

    public shouldPrompt(context: T): boolean {
        return !context.dtsHub;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        if (context.dtsHub) {
            return undefined;
        }

        return {
            promptSteps: [new DurableTaskHubNameStep(this.schedulerClient)],
            executeSteps: [new DurableTaskHubCreateStep(this.schedulerClient)],
        };
    }

    private async getPicks(context: T): Promise<IAzureQuickPickItem<DurableTaskHubResource | undefined>[]> {
        const resourceGroupName: string = nonNullValueAndProp(context.resourceGroup, 'name');
        const taskHubs: DurableTaskHubResource[] = context.dts ?
            await this.schedulerClient.getSchedulerTaskHubs(nonNullProp(context, 'subscription'), resourceGroupName, context.dts.name) : [];

        const createPick = {
            label: localize('createTaskHub', '$(plus) Create new Durable Task Hub'),
            data: undefined,
        };

        return [
            createPick,
            ...taskHubs.map(h => {
                return {
                    label: h.name,
                    description: h.name === context.suggestedDTSHub ? localSettingsDescription : undefined,
                    data: h,
                };
            }),
        ];
    }
}
