/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CosmosDBManagementClient, DatabaseAccountGetResults, DatabaseAccountListKeysResult } from '@azure/arm-cosmosdb';
import { getResourceGroupFromId } from '@microsoft/vscode-azext-azureutils';
import { createCosmosDBClient } from '../../../../utils/azureClients';
import { nonNullProp } from '../../../../utils/nonNull';
import { IBindingWizardContext } from '../../IBindingWizardContext';
import { AzureConnectionCreateStepBase, IConnection } from '../AzureConnectionCreateStepBase';
import { ICosmosDBWizardContext } from './ICosmosDBWizardContext';

export class CosmosDBConnectionCreateStep extends AzureConnectionCreateStepBase<IBindingWizardContext & ICosmosDBWizardContext> {
    public async getConnection(context: ICosmosDBWizardContext): Promise<IConnection> {
        const databaseAccount: DatabaseAccountGetResults = nonNullProp(context, 'databaseAccount');
        const name: string = nonNullProp(databaseAccount, 'name');

        const client: CosmosDBManagementClient = await createCosmosDBClient(context);
        const resourceGroup: string = getResourceGroupFromId(nonNullProp(databaseAccount, 'id'));
        // NOTE: We have to generate the connection string ourselves rather than calling client.databaseAccounts.listConnectionStrings
        // (The runtime currently only handles Cosmos DB connection strings _not_ mongo connection strings)
        const keys: DatabaseAccountListKeysResult = await client.databaseAccounts.listKeys(resourceGroup, name);
        return {
            name: name,
            connectionString: `AccountEndpoint=${nonNullProp(databaseAccount, 'documentEndpoint')};AccountKey=${nonNullProp(keys, 'primaryMasterKey')};`
        };
    }

    public shouldExecute(context: ICosmosDBWizardContext): boolean {
        return !!context.databaseAccount;
    }
}
