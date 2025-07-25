/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EHNamespace, type EventHubManagementClient } from '@azure/arm-eventhub';
import { createResourceClient } from '@microsoft/vscode-azext-azureappservice';
import { ResourceGroupListStep, getResourceGroupFromId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IAzureQuickPickOptions, type ISubscriptionContext, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { type IEventHubsConnectionWizardContext } from '../../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext';
import { EventHubsNamespaceCreateStep } from './EventHubsNamespaceCreateStep';
import { EventHubsNamespaceNameStep } from './EventHubsNamespaceNameStep';

export class EventHubsNamespaceListStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const client: EventHubManagementClient = await createEventHubClient(<T & ISubscriptionContext>context);

        const quickPickOptions: IAzureQuickPickOptions = { placeHolder: localize('eventHubsNamespacePlaceholder', 'Select an event hubs namespace.') };
        const picksTask: Promise<IAzureQuickPickItem<EHNamespace | undefined>[]> = this.getQuickPicks(uiUtils.listAllIterator(client.namespaces.list()));

        const result: EHNamespace | undefined = (await context.ui.showQuickPick(picksTask, quickPickOptions)).data;
        context.eventHubsNamespace = result;
        if (result) {
            const rgClient = await createResourceClient(context);
            context.resourceGroup = await rgClient.resourceGroups.get(getResourceGroupFromId(nonNullProp(result, 'id')));
            context.valuesToMask.push(nonNullProp(result, 'name'));
        }
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T & ISubscriptionContext> | undefined> {
        if (context.eventHubsNamespace) {
            return undefined;
        }

        const promptSteps: AzureWizardPromptStep<T & ISubscriptionContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<T & ISubscriptionContext>[] = [];

        promptSteps.push(new EventHubsNamespaceNameStep());
        executeSteps.push(new EventHubsNamespaceCreateStep());

        promptSteps.push(new ResourceGroupListStep());

        return { promptSteps, executeSteps };
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHubsNamespace;
    }

    private async getQuickPicks(namespaceTask: Promise<EHNamespace[]>): Promise<IAzureQuickPickItem<EHNamespace | undefined>[]> {
        const picks: IAzureQuickPickItem<EHNamespace | undefined>[] = [{
            label: localize('newEventHubsNamespace', '$(plus) Create event hubs namespace'),
            description: '',
            data: undefined
        }];

        const eventHubNamespaces: EHNamespace[] = await namespaceTask;
        for (const namespace of eventHubNamespaces) {
            picks.push({
                id: namespace.id,
                label: nonNullProp(namespace, 'name'),
                description: '',
                data: namespace
            });
        }

        return picks;
    }
}
