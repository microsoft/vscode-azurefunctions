/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventHubManagementClient, EventHubManagementModels } from 'azure-arm-eventhub';
import { createAzureClient } from 'vscode-azureextensionui';
import { nonNullProp } from '../../../../utils/nonNull';
import { IBindingWizardContext } from '../../IBindingWizardContext';
import { AzureConnectionCreateStepBase, IConnection } from '../AzureConnectionCreateStepBase';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubConnectionCreateStep extends AzureConnectionCreateStepBase<IEventHubWizardContext & IBindingWizardContext> {
    public async getConnection(wizardContext: IEventHubWizardContext): Promise<IConnection> {
        const namespaceName: string = nonNullProp(wizardContext, 'namespaceName');
        const resourceGroupName: string = nonNullProp(wizardContext, 'resourceGroupName');
        const eventHubName: string = nonNullProp(wizardContext, 'eventHubName');
        const authRuleName: string = nonNullProp(wizardContext, 'authRuleName');

        const client: EventHubManagementClient = createAzureClient(wizardContext, EventHubManagementClient);
        let connectionString: string;
        if (wizardContext.isNamespaceAuthRule) {
            const keys: EventHubManagementModels.AccessKeys = await client.namespaces.listKeys(resourceGroupName, namespaceName, authRuleName);
            connectionString = `${nonNullProp(keys, 'primaryConnectionString')};EntityPath=${eventHubName}`;
        } else {
            const keys: EventHubManagementModels.AccessKeys = await client.eventHubs.listKeys(resourceGroupName, namespaceName, eventHubName, authRuleName);
            connectionString = nonNullProp(keys, 'primaryConnectionString');
        }

        return {
            name: `${namespaceName}_${authRuleName}`,
            connectionString
        };
    }

    public shouldExecute(wizardContext: IEventHubWizardContext): boolean {
        return !!wizardContext.namespaceName && !!wizardContext.eventHubName && !!wizardContext.authRuleName;
    }
}
