import { createHttpHeaders, createPipelineRequest } from "@azure/core-rest-pipeline";
import { createGenericClient, type AzExtPipelineResponse } from "@microsoft/vscode-azext-azureutils";
import { openUrl, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type MessageItem } from "vscode";
import { localize } from "../../localize";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { listLocalFunctions } from "../../workspace/listLocalFunctions";
import { listLocalProjects, type LocalProjectInternal } from "../../workspace/listLocalProjects";

export async function hasEventSystemTopics(context: IActionContext, node: SlotTreeItem): Promise<boolean> {
    const client = await createGenericClient(context, node.subscription);
    const headers = createHttpHeaders({
        'Content-Type': 'application/json',
    });
    const options = createPipelineRequest({
        url: `/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01`,
        method: 'POST',
        headers,
        body: JSON.stringify({
            query: `where type =~ 'Microsoft.EventGrid/systemTopics' | where properties.topicType =~ 'Microsoft.Web.sites' | where properties.source =~ '${node.id}' | project id`,
            subscriptions: [node.subscription.subscriptionId]
        })
    });

    const response = await client.sendRequest(options) as AzExtPipelineResponse;
    const body = response.parsedBody as { count: number };
    if (body.count >= 1) {
        return true;
    }

    return false;
}

export async function hasLocalEventGridBlobTrigger(projectPath: string): Promise<boolean> {
    const projects = await listLocalProjects();
    const deployedProject = projects.initializedProjects.find(p => p.options.effectiveProjectPath === projectPath);
    if (deployedProject) {
        const functions = await listLocalFunctions(deployedProject as LocalProjectInternal);
        return functions.functions.some(f => f.triggerBindingType === 'blobTrigger');
    }

    return false;
}

export async function promptForEventGrid(context: IActionContext): Promise<void> {
    const eventGridWarning = localize('eventGridWarning', `Usage of Event Grid based blob trigger requires an Event Grid subscription created on an Azure Storage v2 account. If you don't already have a subscription created, create one before continuing with deployment.`);
    const btns: MessageItem[] = [{ title: localize('createSub', 'Create a subscription') }, { title: localize('continue', 'Continue with deployment') }];
    const result = await context.ui.showWarningMessage(eventGridWarning, { modal: true }, ...btns);

    if (result.title === btns[0].title) {
        await openUrl('https://learn.microsoft.com/en-us/azure/azure-functions/functions-event-grid-blob-trigger?tabs=isolated-process%2Cnodejs-v4&pivots=programming-language-csharp#create-the-event-subscription');
    }
}
