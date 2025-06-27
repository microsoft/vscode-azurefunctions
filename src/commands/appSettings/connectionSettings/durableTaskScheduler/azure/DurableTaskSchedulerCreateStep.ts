/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocationListStep } from "@microsoft/vscode-azext-azureutils";
import { ActivityChildItem, ActivityChildType, activityProgressContext, activityProgressIcon, AzureWizardExecuteStepWithActivityOutput, createContextValue, nonNullProp, nonNullValueAndProp, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { localize } from "../../../../../localize";
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerClient } from "../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { withCancellation } from "../../../../../utils/cancellation";
import { getSchedulerConnectionString, SchedulerAuthenticationType } from "../../../../durableTaskScheduler/copySchedulerConnectionString";
import { type IDTSAzureConnectionWizardContext } from "../IDTSConnectionWizardContext";

export class DurableTaskSchedulerCreateStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 150;
    public stepName: string = 'durableTaskSchedulerCreateStep';

    protected getOutputLogSuccess = (context: T) => localize('createTaskSchedulerSuccess', 'Created durable task scheduler "{0}"', context.dts?.name);
    protected getOutputLogFail = (context: T) => localize('createTaskSchedulerFail', 'Failed to create durable task scheduler "{0}"', context.newDTSName);
    protected getTreeItemLabel = (context: T) => localize('createTaskSchedulerLabel', 'Create durable task scheduler "{0}"', context.newDTSName);

    private readonly _schedulerClient: DurableTaskSchedulerClient;

    public constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this._schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number; }>): Promise<void> {
        progress.report({ message: localize('createTaskScheduler', 'Creating durable task scheduler...') });

        const response = (await this._schedulerClient.createScheduler(
            nonNullProp(context, 'subscription'),
            nonNullValueAndProp(context.resourceGroup, 'name'),
            (await LocationListStep.getLocation(context)).name,
            nonNullProp(context, 'newDTSName'),
        ));

        const status = await withCancellation(token => response.status.waitForCompletion(token), 1000 * 60 * 30);

        if (status !== true) {
            throw new Error(localize('schedulerCreationFailed', 'The scheduler could not be created.'));
        }

        context.dts = response.scheduler;
        context.newDTSConnectionSetting = getSchedulerConnectionString(context.dts?.properties.endpoint ?? '', SchedulerAuthenticationType.UserAssignedIdentity);
    }

    public shouldExecute(context: T): boolean {
        return !context.dts;
    }

    public createProgressOutput(context: T): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: this.getTreeItemLabel(context),
                description: localize('dtsCreateWarning', 'This could take a while...'),
                contextValue: createContextValue([`${this.stepName}Item`, activityProgressContext]),
                activityType: ActivityChildType.Progress,
                iconPath: activityProgressIcon,
            }),
        };
    }
}
