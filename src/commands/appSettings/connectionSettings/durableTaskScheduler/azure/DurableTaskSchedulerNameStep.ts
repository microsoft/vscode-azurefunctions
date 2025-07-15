/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp, nonNullValueAndProp, validationUtils } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../../../localize";
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerClient, type DurableTaskSchedulerResource } from "../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type IDTSAzureConnectionWizardContext } from "../IDTSConnectionWizardContext";

export class DurableTaskSchedulerNameStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly _schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this._schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async prompt(context: T): Promise<void> {
        context.newDTSName = (await context.ui.showInputBox({
            prompt: localize('taskSchedulerName', 'Enter a name for the durable task scheduler'),
            validateInput: this.validateInput,
            asyncValidationTask: (name: string) => this.validateNameAvailable(context, name),
        })).trim();
        context.valuesToMask.push(context.newDTSName);
    }

    public shouldPrompt(context: T): boolean {
        return !context.newDTSName;
    }

    private validateInput(schedulerName: string = ''): string | undefined {
        schedulerName = schedulerName.trim();

        const rc: validationUtils.RangeConstraints = { lowerLimitIncl: 3, upperLimitIncl: 64 };
        if (!validationUtils.hasValidCharLength(schedulerName, rc)) {
            return validationUtils.getInvalidCharLengthMessage(rc);
        }

        if (!/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(schedulerName)) {
            return localize('nameValidationMessage', 'Name may use alphanumeric characters as well as non-consecutive dashes ("-") in between.');
        }

        return undefined;
    }

    private async validateNameAvailable(context: T, schedulerName: string = ''): Promise<string | undefined> {
        schedulerName = schedulerName.trim();

        try {
            const resourceGroupName: string = nonNullValueAndProp(context.resourceGroup, 'name');
            const scheduler: DurableTaskSchedulerResource | undefined = await this._schedulerClient.getScheduler(nonNullProp(context, 'subscription'), resourceGroupName, schedulerName);

            if (scheduler) {
                return localize('schedulerAlreadyExists', 'A scheduler with name "{0}" already exists in resource group "{1}".', schedulerName, resourceGroupName);
            }
        } catch {
            // Do nothing
        }

        return undefined;
    }
}
