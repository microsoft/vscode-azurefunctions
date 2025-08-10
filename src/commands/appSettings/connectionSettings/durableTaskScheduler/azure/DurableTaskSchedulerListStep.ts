/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocationListStep, parseAzureResourceId, type ILocationWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localSettingsDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerClient, type DurableTaskSchedulerResource } from '../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient';
import { type IDTSAzureConnectionWizardContext } from '../IDTSConnectionWizardContext';
import { DurableTaskHubListStep } from './DurableTaskHubListStep';
import { DurableTaskSchedulerCreateStep } from './DurableTaskSchedulerCreateStep';
import { DurableTaskSchedulerNameStep } from './DurableTaskSchedulerNameStep';

export class DurableTaskSchedulerListStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly _schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this._schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async prompt(context: T): Promise<void> {
        context.dts = (await context.ui.showQuickPick(await this.getPicks(context), {
            placeHolder: localize('selectTaskScheduler', 'Select a durable task scheduler'),
        })).data;

        if (context.dts) {
            context.valuesToMask.push(context.dts.name);
        }

        context.telemetry.properties.usedLocalDTSConnectionSettings = context.suggestedDTSEndpointLocalSettings ? String(context.dts?.properties.endpoint === context.suggestedDTSEndpointLocalSettings) : undefined;
    }

    public shouldPrompt(context: T): boolean {
        return !context.dts;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        if (!context.dts) {
            promptSteps.push(new DurableTaskSchedulerNameStep(this._schedulerClient));
            executeSteps.push(new DurableTaskSchedulerCreateStep(this._schedulerClient));
            LocationListStep.addStep(context, promptSteps as AzureWizardPromptStep<ILocationWizardContext>[]);
        }

        if (!context.dtsHub) {
            promptSteps.push(new DurableTaskHubListStep(this._schedulerClient));
        }

        return { promptSteps, executeSteps };
    }

    private async getPicks(context: T): Promise<IAzureQuickPickItem<DurableTaskSchedulerResource | undefined>[]> {
        const schedulers: DurableTaskSchedulerResource[] = await this._schedulerClient.getSchedulersBySubscription(nonNullProp(context, 'subscription'));

        const createPick = {
            label: localize('createTaskScheduler', '$(plus) Create new durable task scheduler'),
            data: undefined,
        };

        return [
            createPick,
            ...schedulers.map(s => {
                const resourceGroupName: string = parseAzureResourceId(s.id).resourceGroup;
                return {
                    label: s.name,
                    description: s.properties.endpoint === context.suggestedDTSEndpointLocalSettings ?
                        `${resourceGroupName} ${localSettingsDescription}` :
                        resourceGroupName,
                    data: s,
                };
            }),
        ];
    }
}
