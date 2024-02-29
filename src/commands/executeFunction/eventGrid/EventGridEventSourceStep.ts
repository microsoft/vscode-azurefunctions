import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { type ExecuteEventGridFunctionContext } from "./ExecuteEventGridFunctionContext";
import { supportedEventGridSourceLabels, supportedEventGridSources, type EventGridSource } from "./eventGridSources";

export class EventGridEventSourceStep extends AzureWizardPromptStep<ExecuteEventGridFunctionContext> {
    public hideStepCount: boolean = false;

    public async prompt(context: ExecuteEventGridFunctionContext): Promise<void> {
        // Prompt for event source
        const eventGridSourcePicks: IAzureQuickPickItem<EventGridSource | undefined>[] = supportedEventGridSources.map((source: EventGridSource) => {
            return {
                label: supportedEventGridSourceLabels.get(source) || source,
                data: source,
            };
        });
        const eventSource: EventGridSource =
            (
                await context.ui.showQuickPick(eventGridSourcePicks, {
                    placeHolder: localize('selectEventSource', 'Select the event source'),
                    stepName: 'eventGridSource',
                })
            ).data ?? 'Microsoft.Storage';

        context.eventSource = eventSource;
    }

    public shouldPrompt(context: ExecuteEventGridFunctionContext): boolean {
        return !context.eventSource;
    }
}
