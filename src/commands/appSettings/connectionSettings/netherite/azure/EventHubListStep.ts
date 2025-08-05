/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EventHubManagementClient, type Eventhub } from '@azure/arm-eventhub';
import { parseAzureResourceId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, nonNullValueAndProp, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localSettingsDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { createEventHubClient } from '../../../../../utils/azureClients';
import { type INetheriteAzureConnectionWizardContext } from '../INetheriteConnectionWizardContext';
import { EventHubCreateStep } from './EventHubCreateStep';
import { EventHubNameStep } from './EventHubNameStep';

export class EventHubListStep<T extends INetheriteAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        if (!context.eventHubsNamespace) {
            return;
        }

        const client: EventHubManagementClient = await createEventHubClient(context);
        const parsedResource = parseAzureResourceId(nonNullValueAndProp(context.eventHubsNamespace, 'id'));
        const eventHubs = await uiUtils.listAllIterator(client.eventHubs.listByNamespace(parsedResource.resourceGroup, parsedResource.resourceName));

        context.eventHub = (await context.ui.showQuickPick(await this.getPicks(context, eventHubs), {
            placeHolder: localize('selectEventHub', 'Select an event hub'),
        })).data;

        if (context.eventHub?.name) {
            context.valuesToMask.push(context.eventHub.name);
            context.newEventHubConnectionSettingValue = context.eventHub.name;
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHub;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        if (context.eventHub) {
            return;
        }

        return {
            promptSteps: [new EventHubNameStep()],
            executeSteps: [new EventHubCreateStep()],
        };
    }

    private async getPicks(context: T, eventHubs: Eventhub[]): Promise<IAzureQuickPickItem<Eventhub | undefined>[]> {
        const picks: IAzureQuickPickItem<Eventhub | undefined>[] = [{
            label: localize('createEventHub', '$(plus) Create new event hub'),
            data: undefined,
        }];

        for (const eh of eventHubs) {
            const eventHubName: string = nonNullProp(eh, 'name');
            picks.push({
                label: eventHubName,
                description: eventHubName === context.suggestedEventHubLocalSettings ? localSettingsDescription : undefined,
                data: eh,
            });
        }

        return picks;
    }
}
