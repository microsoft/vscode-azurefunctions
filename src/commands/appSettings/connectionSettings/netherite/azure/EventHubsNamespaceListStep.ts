/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EHNamespace, type EventHubManagementClient } from '@azure/arm-eventhub';
import { LocationListStep, uiUtils, type ILocationWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localSettingsDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { createEventHubClient } from '../../../../../utils/azureClients';
import { type INetheriteAzureConnectionWizardContext } from '../INetheriteConnectionWizardContext';
import { EventHubListStep } from './EventHubListStep';
import { EventHubsNamespaceAuthRuleListStep } from './EventHubsNamespaceAuthRuleListStep';
import { EventHubsNamespaceCreateStep } from './EventHubsNamespaceCreateStep';
import { EventHubsNamespaceNameStep } from './EventHubsNamespaceNameStep';

export class EventHubsNamespaceListStep<T extends INetheriteAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const client: EventHubManagementClient = await createEventHubClient(context);
        const namespaces: EHNamespace[] = await uiUtils.listAllIterator(client.namespaces.list());

        context.eventHubsNamespace = (await context.ui.showQuickPick(await this.getPicks(context, namespaces), {
            placeHolder: localize('eventHubsNamespacePlaceholder', 'Select an event hubs namespace'),
        })).data;

        if (context.eventHubsNamespace?.name) {
            context.valuesToMask.push(context.eventHubsNamespace.name);
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHubsNamespace;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        if (!context.eventHubsNamespace) {
            promptSteps.push(new EventHubsNamespaceNameStep());
            executeSteps.push(new EventHubsNamespaceCreateStep());
            LocationListStep.addStep(context, promptSteps as AzureWizardPromptStep<ILocationWizardContext>[]);
        }

        if (!context.authRule) {
            promptSteps.push(new EventHubsNamespaceAuthRuleListStep());
        }

        if (!context.eventHub) {
            promptSteps.push(new EventHubListStep());
        }

        return { promptSteps, executeSteps };
    }

    private async getPicks(context: T, namespaces: EHNamespace[]): Promise<IAzureQuickPickItem<EHNamespace | undefined>[]> {
        const picks: IAzureQuickPickItem<EHNamespace | undefined>[] = [{
            label: localize('newEventHubsNamespace', '$(plus) Create event hubs namespace'),
            data: undefined
        }];

        for (const namespace of namespaces) {
            const namespaceName = nonNullProp(namespace, 'name');
            picks.push({
                id: namespace.id,
                label: namespaceName,
                description: namespaceName === context.suggestedNamespaceLocalSettings ? localSettingsDescription : undefined,
                data: namespace
            });
        }

        return picks;
    }
}
