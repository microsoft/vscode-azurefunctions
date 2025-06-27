/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput, nonNullProp, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { localize } from "../../../../../localize";
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerClient } from "../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type IDTSAzureConnectionWizardContext } from "../IDTSConnectionWizardContext";

export class DurableTaskHubCreateStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 160;
    public stepName: string = 'durableTaskHubCreateStep';

    protected getOutputLogSuccess = (context: T) => localize('createTaskHubSuccess', 'Created durable task hub "{0}"', context.dtsHub?.name);
    protected getOutputLogFail = (context: T) => localize('createTaskHubFail', 'Failed to create durable task hub "{0}"', context.newDTSHubName);
    protected getTreeItemLabel = (context: T) => localize('createTaskHubLabel', 'Create durable task hub "{0}"', context.newDTSHubName);

    private readonly _schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this._schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number; }>): Promise<void> {
        progress.report({ message: localize('createTaskHub', 'Creating durable task hub...') });

        context.dtsHub = await this._schedulerClient.createTaskHub(
            nonNullProp(context, 'subscription'),
            nonNullValueAndProp(context.resourceGroup, 'name'),
            nonNullValueAndProp(context.dts, 'name'),
            nonNullProp(context, 'newDTSHubName'),
        );
        context.newDTSHubNameConnectionSetting = context.dtsHub.name;
    }

    public shouldExecute(context: T): boolean {
        return !context.dtsHub;
    }
}
