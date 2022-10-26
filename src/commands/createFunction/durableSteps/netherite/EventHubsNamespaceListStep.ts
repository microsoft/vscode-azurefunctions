/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EHNamespace, EventHubManagementClient } from '@azure/arm-eventhub';
import { LocationListStep, ResourceGroupListStep, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions, ISubscriptionContext, IWizardOptions, nonNullProp } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { IEventHubsConnectionWizardContext } from '../../../appSettings/IEventHubsConnectionWizardContext';
import { EventHubsNamespaceCreateStep } from './EventHubsNamespaceCreateStep';
import { EventHubsNamespaceNameStep } from './EventHubsNamespaceNameStep';

export class EventHubsNamespaceListStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const client: EventHubManagementClient = await createEventHubClient(<T & ISubscriptionContext>context);

        const quickPickOptions: IAzureQuickPickOptions = { placeHolder: 'Select an event hubs namespace.' };
        const picksTask: Promise<IAzureQuickPickItem<EHNamespace | undefined>[]> = this._getQuickPicks(uiUtils.listAllIterator(client.namespaces.list()));

        const result: EHNamespace | undefined = (await context.ui.showQuickPick(picksTask, quickPickOptions)).data;
        context.eventHubsNamespace = result;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        if (context.eventHubsNamespace) {
            context.valuesToMask.push(nonNullProp(context.eventHubsNamespace, 'name'));
            return;
        }

        const promptSteps: AzureWizardPromptStep<T & ISubscriptionContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<T & ISubscriptionContext>[] = [];

        promptSteps.push(new EventHubsNamespaceNameStep());
        executeSteps.push(new EventHubsNamespaceCreateStep());

        LocationListStep.addStep(context, promptSteps);
        promptSteps.push(new ResourceGroupListStep());

        return { promptSteps, executeSteps };
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHubsNamespace;
    }

    private async _getQuickPicks(namespaceTask: Promise<EHNamespace[]>): Promise<IAzureQuickPickItem<EHNamespace | undefined>[]> {
        const picks: IAzureQuickPickItem<EHNamespace | undefined>[] = [{
            label: localize('newEventHubsNamespace', '$(plus) Create event hubs namespace'),
            description: '',
            data: undefined
        }];

        const eventHubNamespaces: EHNamespace[] = await namespaceTask;
        for (const namespace of eventHubNamespaces) {
            picks.push({
                id: namespace.id,
                label: namespace.name!,
                description: '',
                data: namespace
            });
        }

        return picks;
    }
}
