/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EHNamespace, EventHubManagementClient } from '@azure/arm-eventhub';
import { ext } from '@microsoft/vscode-azext-azureappservice/out/src/extensionVariables';
import { ILocationWizardContext, LocationListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, ISubscriptionContext, nonNullValue } from '@microsoft/vscode-azext-utils';
import { Progress } from 'vscode';
import { localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { IEventHubsConnectionWizardContext } from '../../../appSettings/IEventHubsConnectionWizardContext';

export class EventHubsNamespaceCreateStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 200;

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const rgName: string = nonNullValue(context.resourceGroup?.name);
        const newNamespaceName: string = nonNullValue(context.newEventHubsNamespaceName);
        const creating: string = localize('creatingEventHubsNamespace', 'Creating new event hubs namespace "{0}"...', newNamespaceName);
        const created: string = localize('createdEventHubsNamespace', 'Created new event hubs namespace "{0}"...', newNamespaceName);
        ext.outputChannel.appendLog(creating);
        progress.report({ message: creating });

        const client: EventHubManagementClient = await createEventHubClient(<T & ISubscriptionContext>context);
        const defaultParams: EHNamespace = {
            location: (await LocationListStep.getLocation(<ILocationWizardContext>context)).name,
            sku: {
                name: 'Standard',
                capacity: 1
            },
        };
        context.eventHubsNamespace = await client.namespaces.beginCreateOrUpdateAndWait(rgName, newNamespaceName, defaultParams);
        ext.outputChannel.appendLog(created);
    }

    public shouldExecute(context: T): boolean {
        return !context.eventHubsNamespace && !!context.resourceGroup && !!context.newEventHubsNamespaceName && LocationListStep.hasLocation(<ILocationWizardContext>context);
    }
}
