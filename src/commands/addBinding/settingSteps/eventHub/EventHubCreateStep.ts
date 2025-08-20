/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AuthorizationRule, type EventHubManagementClient } from '@azure/arm-eventhub';
import { getResourceGroupFromId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { createEventHubClient } from '../../../../utils/azureClients';
import { getRandomHexString } from '../../../../utils/fs';
import { type IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubCreateStep extends AzureWizardExecuteStep<IEventHubWizardContext> {
    // EventHubsNamespaceCreateStep has a priority number of 190, so has to be after that
    public priority: number = 191;
    public async execute(context: IEventHubWizardContext): Promise<void> {
        const namespaceName: string = nonNullValueAndProp(context.eventHubsNamespace, 'name');
        const resourceGroupName: string = getResourceGroupFromId(nonNullValueAndProp(context.eventHubsNamespace, 'id'));

        const client: EventHubManagementClient = await createEventHubClient(context);
        // TODO: use randomUtils when the utils package is updated
        const eventHubName = `${namespaceName}-${getRandomHexString()}`
        // don't bother prompting the user-- just create one with a default name and properties
        context.eventhubname = (await client.eventHubs.createOrUpdate(resourceGroupName, namespaceName, eventHubName, {})).name;
        // it won't have any auth rules since it was just created so just use root namespace rule
        const namespaceRules: AuthorizationRule[] = await uiUtils.listAllIterator(client.namespaces.listAuthorizationRules(resourceGroupName, namespaceName));
        context.authRule = namespaceRules[0];
        context.isNamespaceAuthRule = true;
    }

    public shouldExecute(context: IEventHubWizardContext): boolean {
        return !!context.eventHubsNamespace;
    }
}
