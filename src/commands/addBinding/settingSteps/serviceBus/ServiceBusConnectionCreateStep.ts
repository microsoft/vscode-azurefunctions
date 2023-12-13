/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AccessKeys, type SBAuthorizationRule, type SBNamespace, type ServiceBusManagementClient } from '@azure/arm-servicebus';
import { getResourceGroupFromId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { localize } from '../../../../localize';
import { createServiceBusClient } from '../../../../utils/azureClients';
import { nonNullProp } from '../../../../utils/nonNull';
import { type IBindingWizardContext } from '../../IBindingWizardContext';
import { AzureConnectionCreateStepBase, type IConnection } from '../AzureConnectionCreateStepBase';
import { type IServiceBusWizardContext } from './IServiceBusWizardContext';

export class ServiceBusConnectionCreateStep extends AzureConnectionCreateStepBase<IServiceBusWizardContext & IBindingWizardContext> {
    public async getConnection(context: IServiceBusWizardContext): Promise<IConnection> {
        const sbNamespace: SBNamespace = nonNullProp(context, 'sbNamespace');
        const id: string = nonNullProp(sbNamespace, 'id');
        const name: string = nonNullProp(sbNamespace, 'name');

        const resourceGroup: string = getResourceGroupFromId(id);
        const client: ServiceBusManagementClient = await createServiceBusClient(context);
        const authRules: SBAuthorizationRule[] = await uiUtils.listAllIterator(client.namespaces.listAuthorizationRules(resourceGroup, name));
        const authRule: SBAuthorizationRule | undefined = authRules.find(ar => ar.rights && ar.rights.some(r => r.toLowerCase() === 'listen'));
        if (!authRule) {
            throw new Error(localize('noAuthRule', 'Failed to get connection string for service bus namespace "{0}".', name));
        }
        const keys: AccessKeys = await client.namespaces.listKeys(resourceGroup, name, nonNullProp(authRule, 'name'));
        return {
            name: name,
            connectionString: nonNullProp(keys, 'primaryConnectionString')
        };
    }

    public shouldExecute(context: IServiceBusWizardContext): boolean {
        return !!context.sbNamespace;
    }
}
