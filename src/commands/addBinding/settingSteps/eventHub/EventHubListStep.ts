/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EventHubManagementClient, type Eventhub } from '@azure/arm-eventhub';
import { getResourceGroupFromId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullValueAndProp, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { nonNullProp } from '../../../../utils/nonNull';
import { EventHubCreateStep } from './EventHubCreateStep';
import { type IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubListStep extends AzureWizardPromptStep<IEventHubWizardContext> {
    public async prompt(context: IEventHubWizardContext): Promise<void> {
        if (!context.eventHubsNamespace) {
            // if there is no event hub namespace, then we can't create an event hub but
            // getSubWizard only gets called if prompt does so we can't use shouldPrompt to stifle this prompt
            return;
        }

        const namespaceName: string = nonNullValueAndProp(context.eventHubsNamespace, 'name');
        const resourceGroupName: string = getResourceGroupFromId(nonNullValueAndProp(context.eventHubsNamespace, 'id'));

        const placeHolder: string = localize('placeHolder', 'Select an event hub');
        const picks: IAzureQuickPickItem<Eventhub | undefined>[] = [{
            label: localize('newEventHubsNamespace', '$(plus) Create new event hub'),
            description: '',
            data: undefined
        }];

        const client: EventHubManagementClient = await createEventHubClient(context);
        const eventHubs = await uiUtils.listAllIterator(client.eventHubs.listByNamespace(resourceGroupName, namespaceName));
        picks.push(...eventHubs.map((eb: Eventhub) => { return { data: eb, label: nonNullProp(eb, 'name') } }))

        const result: Eventhub | undefined = (await context.ui.showQuickPick(picks, { placeHolder })).data;

        if (result) {
            context.eventHub = result;
            context.eventhubname = nonNullProp(result, 'name');
        }
    }

    public shouldPrompt(context: IEventHubWizardContext): boolean {
        return !context.eventhubname;
    }

    public async getSubWizard(context: IEventHubWizardContext): Promise<IWizardOptions<IEventHubWizardContext> | undefined> {
        if (!context.eventhubname) {
            return { executeSteps: [new EventHubCreateStep()] };
        }

        return undefined;
    }
}
