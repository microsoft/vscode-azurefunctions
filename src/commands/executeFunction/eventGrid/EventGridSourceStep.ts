/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { type EventGridExecuteFunctionContext } from "./EventGridExecuteFunctionContext";
import { supportedEventGridSourceLabels, supportedEventGridSources, type EventGridSource } from "./eventGridSources";

export class EventGridSourceStep extends AzureWizardPromptStep<EventGridExecuteFunctionContext> {
    public hideStepCount: boolean = false;

    public async prompt(context: EventGridExecuteFunctionContext): Promise<void> {
        // Prompt for event source
        const eventGridSourcePicks: IAzureQuickPickItem<EventGridSource | undefined>[] = supportedEventGridSources.map((source: EventGridSource) => {
            return {
                label: supportedEventGridSourceLabels.get(source) || source,
                data: source,
            };
        });
        const eventSource =
            (
                await context.ui.showQuickPick(eventGridSourcePicks, {
                    placeHolder: localize('selectEventSource', 'Select the event source'),
                    stepName: 'eventGridSource',
                })
            ).data;

        context.telemetry.properties.eventGridSource = eventSource;
        context.eventSource = eventSource;
    }

    public shouldPrompt(context: EventGridExecuteFunctionContext): boolean {
        return !context.eventSource;
    }
}
