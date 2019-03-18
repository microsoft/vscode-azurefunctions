/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceBusManagementClient, ServiceBusManagementModels } from 'azure-arm-sb';
import { createAzureClient } from 'vscode-azureextensionui';
import { localize } from '../../../localize';
import { getResourceGroupFromId } from '../../../utils/azure';
import { nonNullProp } from '../../../utils/nonNull';
import { IFunctionWizardContext } from '../IFunctionWizardContext';
import { AzureConnectionCreateStepBase, IConnection } from './AzureConnectionCreateStepBase';
import { IServiceBusWizardContext } from './IServiceBusWizardContext';

export class ServiceBusConnectionCreateStep extends AzureConnectionCreateStepBase<IServiceBusWizardContext & IFunctionWizardContext> {
    public async getConnection(wizardContext: IServiceBusWizardContext): Promise<IConnection> {
        const sbNamespace: ServiceBusManagementModels.SBNamespace = nonNullProp(wizardContext, 'sbNamespace');
        const id: string = nonNullProp(sbNamespace, 'id');
        const name: string = nonNullProp(sbNamespace, 'name');

        const resourceGroup: string = getResourceGroupFromId(id);
        const client: ServiceBusManagementClient = createAzureClient(wizardContext, ServiceBusManagementClient);
        const authRules: ServiceBusManagementModels.SBAuthorizationRule[] = await client.namespaces.listAuthorizationRules(resourceGroup, name);
        const authRule: ServiceBusManagementModels.SBAuthorizationRule | undefined = authRules.find(ar => ar.rights.some(r => r.toLowerCase() === 'listen'));
        if (!authRule) {
            throw new Error(localize('noAuthRule', 'Failed to get connection string for service bus namespace "{0}".', name));
        }
        const keys: ServiceBusManagementModels.AccessKeys = await client.namespaces.listKeys(resourceGroup, name, nonNullProp(authRule, 'name'));
        return {
            name: name,
            connectionString: nonNullProp(keys, 'primaryConnectionString')
        };
    }

    public shouldExecute(wizardContext: IServiceBusWizardContext): boolean {
        return !!wizardContext.sbNamespace;
    }
}
