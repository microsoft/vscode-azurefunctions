/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../../../localize";
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerClient } from "../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type IDTSAzureConnectionWizardContext } from "../IDTSConnectionWizardContext";

export class DurableTaskHubNameStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this.schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async prompt(context: T): Promise<void> {
        context.newDTSHubName = await context.ui.showInputBox({
            prompt: localize('taskSchedulerName', 'Enter a name for the durable task hub'),
            value: context.suggestedDTSHubNameLocalSettings,
            // Todo: validation
        });

        context.telemetry.properties.usedDTSDefaultHub = 'true';

        if (context.newDTSHubName && context.newDTSHubName !== 'default') {
            context.telemetry.properties.usedDTSDefaultHub = 'false';
            context.valuesToMask.push(context.newDTSHubName);
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.newDTSHubName;
    }
}
