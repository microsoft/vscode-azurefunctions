/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageManagementClient, StorageManagementModels } from 'azure-arm-storage';
import { createAzureClient, IStorageAccountWizardContext } from 'vscode-azureextensionui';
import { getResourceGroupFromId } from '../../../utils/azure';
import { nonNullProp, nonNullValue } from '../../../utils/nonNull';
import { IBindingWizardContext } from '../IBindingWizardContext';
import { AzureConnectionCreateStepBase, IConnection } from './AzureConnectionCreateStepBase';

export class StorageConnectionCreateStep extends AzureConnectionCreateStepBase<IStorageAccountWizardContext & IBindingWizardContext> {
    public async getConnection(wizardContext: IStorageAccountWizardContext): Promise<IConnection> {
        const storageAccount: StorageManagementModels.StorageAccount = <StorageManagementModels.StorageAccount>nonNullProp(wizardContext, 'storageAccount');
        const name: string = nonNullProp(storageAccount, 'name');

        const client: StorageManagementClient = createAzureClient(wizardContext, StorageManagementClient);
        const resourceGroup: string = getResourceGroupFromId(nonNullProp(storageAccount, 'id'));
        const result: StorageManagementModels.StorageAccountListKeysResult = await client.storageAccounts.listKeys(resourceGroup, name);
        const key: string = nonNullProp(nonNullValue(nonNullProp(result, 'keys')[0], 'keys[0]'), 'value');

        let endpointSuffix: string = nonNullProp(wizardContext.environment, 'storageEndpointSuffix');
        // https://github.com/Azure/azure-sdk-for-node/issues/4706
        if (endpointSuffix.startsWith('.')) {
            endpointSuffix = endpointSuffix.substr(1);
        }

        return {
            name,
            connectionString: `DefaultEndpointsProtocol=https;AccountName=${name};AccountKey=${key};EndpointSuffix=${endpointSuffix}`
        };
    }

    public shouldExecute(wizardContext: IStorageAccountWizardContext): boolean {
        return !!wizardContext.storageAccount;
    }
}
