/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessKeys, EventHubManagementClient } from '@azure/arm-eventhub';
import { createEventHubClient } from '../../../../utils/azureClients';
import { nonNullProp } from '../../../../utils/nonNull';
import { IBindingWizardContext } from '../../IBindingWizardContext';
import { AzureConnectionCreateStepBase, IConnection } from '../AzureConnectionCreateStepBase';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubConnectionCreateStep extends AzureConnectionCreateStepBase<IEventHubWizardContext & IBindingWizardContext> {
    public async getConnection(context: IEventHubWizardContext): Promise<IConnection> {
        const namespaceName: string = nonNullProp(context, 'namespaceName');
        const resourceGroupName: string = nonNullProp(context, 'resourceGroupName');
        const eventHubName: string = nonNullProp(context, 'eventhubname');
        const authRuleName: string = nonNullProp(context, 'authRuleName');

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
        return !!context.namespaceName && !!context.eventhubname && !!context.authRuleName;
    }
}
