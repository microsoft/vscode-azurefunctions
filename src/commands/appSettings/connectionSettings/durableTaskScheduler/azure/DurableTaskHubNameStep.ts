/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseAzureResourceId, type ParsedAzureResourceId } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardPromptStep, nonNullProp, validationUtils } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../../../localize";
import { HttpDurableTaskSchedulerClient, type DurableTaskHubResource, type DurableTaskSchedulerClient } from "../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type IDTSAzureConnectionWizardContext } from "../IDTSConnectionWizardContext";

export class DurableTaskHubNameStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly _schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this._schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async prompt(context: T): Promise<void> {
        context.newDTSHubName = (await context.ui.showInputBox({
            prompt: localize('taskSchedulerName', 'Enter a name for the durable task hub'),
            value: context.suggestedDTSHubNameLocalSettings ?? 'default',
            validateInput: this.validateInput,
            asyncValidationTask: (name: string) => this.validateNameAvailable(context, name),
        })).trim();

        context.telemetry.properties.usedDTSDefaultHub = 'true';

        if (context.newDTSHubName && context.newDTSHubName !== 'default') {
            context.telemetry.properties.usedDTSDefaultHub = 'false';
            context.valuesToMask.push(context.newDTSHubName);
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.newDTSHubName;
    }

    private validateInput(hubName: string = ''): string | undefined {
        hubName = hubName.trim();

        const rc: validationUtils.RangeConstraints = { lowerLimitIncl: 3, upperLimitIncl: 64 };
        if (!validationUtils.hasValidCharLength(hubName, rc)) {
            return validationUtils.getInvalidCharLengthMessage(rc);
        }

        if (!/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(hubName)) {
            return localize('nameValidationMessage', 'Name may use alphanumeric characters as well as non-consecutive dashes ("-") in between.');
        }

        return undefined;
    }

    private async validateNameAvailable(context: T, hubName: string = ''): Promise<string | undefined> {
        hubName = hubName.trim();

        try {
            const parsedScheduler: ParsedAzureResourceId = parseAzureResourceId(nonNullProp(context, 'dts').id);

            const hub: DurableTaskHubResource | undefined = await this._schedulerClient.getSchedulerTaskHub(
                nonNullProp(context, 'subscription'),
                parsedScheduler.resourceGroup,
                parsedScheduler.resourceName,
                hubName,
            );

            if (hub) {
                return localize('hubAlreadyExists', 'A task hub with name "{0}" already exists with scheduler "{1}".', hubName, parsedScheduler.resourceName);
            }
        } catch {
            // Do nothing
        }

        return undefined;
    }
}
