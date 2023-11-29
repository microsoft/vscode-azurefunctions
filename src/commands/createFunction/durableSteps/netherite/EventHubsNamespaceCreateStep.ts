/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EHNamespace, type EventHubManagementClient } from '@azure/arm-eventhub';
import { LocationListStep, type AzExtLocation } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullProp, nonNullValue, nonNullValueAndProp, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { type IEventHubsConnectionWizardContext } from '../../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext';

export class EventHubsNamespaceCreateStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 190;

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const rgName: string = nonNullValueAndProp(context.resourceGroup, 'name');
        const newNamespaceName: string = nonNullValue(context.newEventHubsNamespaceName);
        const creating: string = localize('creatingEventHubsNamespace', 'Creating new event hubs namespace "{0}"...', newNamespaceName);
        ext.outputChannel.appendLog(creating);
        progress.report({ message: creating });

        const client: EventHubManagementClient = await createEventHubClient(<T & ISubscriptionContext>context);
        const location: AzExtLocation = await LocationListStep.getLocation(<T & ISubscriptionContext>context);
        const defaultParams: EHNamespace = {
            location: nonNullProp(location, 'name'),
            sku: {
                name: 'Standard',
                capacity: 1
            },
        };
        context.eventHubsNamespace = await client.namespaces.beginCreateOrUpdateAndWait(rgName, newNamespaceName, defaultParams);
    }

    public shouldExecute(context: T): boolean {
        return !context.eventHubsNamespace;
    }
}
