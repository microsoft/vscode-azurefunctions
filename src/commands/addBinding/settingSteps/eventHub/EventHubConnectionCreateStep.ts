/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AccessKeys, type EventHubManagementClient } from '@azure/arm-eventhub';
import { getResourceGroupFromId } from '@microsoft/vscode-azext-azureutils';
import { nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { createEventHubClient } from '../../../../utils/azureClients';
import { nonNullProp } from '../../../../utils/nonNull';
import { type IFunctionWizardContext } from '../../../createFunction/IFunctionWizardContext';
import { AzureConnectionCreateStepBase, type IConnection } from '../AzureConnectionCreateStepBase';
import { type IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubConnectionCreateStep extends AzureConnectionCreateStepBase<IEventHubWizardContext & IFunctionWizardContext> {
    public async getConnection(context: IEventHubWizardContext): Promise<IConnection> {
        const namespaceName: string = nonNullValueAndProp(context.eventHubsNamespace, 'name');
        const resourceGroupName: string = getResourceGroupFromId(nonNullValueAndProp(context.eventHubsNamespace, 'id'));
        const eventHubName: string = nonNullProp(context, 'eventhubname');
        const authRuleName: string = nonNullValueAndProp(context.authRule, 'name');

        const client: EventHubManagementClient = await createEventHubClient(context);
        let connectionString: string;
        if (context.isNamespaceAuthRule) {
            const keys: AccessKeys = await client.namespaces.listKeys(resourceGroupName, namespaceName, authRuleName);
            connectionString = `${nonNullProp(keys, 'primaryConnectionString')};EntityPath=${eventHubName}`;
        } else {
            const keys: AccessKeys = await client.eventHubs.listKeys(resourceGroupName, namespaceName, eventHubName, authRuleName);
            connectionString = nonNullProp(keys, 'primaryConnectionString');
        }

        return {
            name: `${namespaceName}_${authRuleName}`,
            connectionString
        };
    }

    public shouldExecute(context: IEventHubWizardContext): boolean {
        return !!context.eventHubsNamespace && !!context.eventhubname && !!context.authRule;
    }
}
