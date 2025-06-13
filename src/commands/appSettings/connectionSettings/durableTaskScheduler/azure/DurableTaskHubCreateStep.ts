/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullProp, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { localize } from "../../../../../localize";
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerClient } from "../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type IDTSAzureConnectionWizardContext } from "../IDTSConnectionWizardContext";

export class DurableTaskHubCreateStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    priority: number = 160;
    private readonly schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this.schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number; }>): Promise<void> {
        progress.report({ message: localize('createTaskHub', 'Creating durable task hub...') });

        context.dtsHub = await this.schedulerClient.createTaskHub(
            nonNullProp(context, 'subscription'),
            nonNullValueAndProp(context.resourceGroup, 'name'),
            nonNullValueAndProp(context.dts, 'name'),
            nonNullProp(context, 'newDTSHubName'),
        );
    }

    public shouldExecute(context: T): boolean {
        return !context.dtsHub;
    }
}
