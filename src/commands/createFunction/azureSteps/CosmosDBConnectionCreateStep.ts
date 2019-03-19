/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CosmosDBManagementClient, CosmosDBManagementModels } from 'azure-arm-cosmosdb';
import { createAzureClient } from 'vscode-azureextensionui';
import { getResourceGroupFromId } from '../../../utils/azure';
import { nonNullProp, nonNullValue } from '../../../utils/nonNull';
import { IFunctionWizardContext } from '../IFunctionWizardContext';
import { AzureConnectionCreateStepBase, IConnection } from './AzureConnectionCreateStepBase';
import { ICosmosDBWizardContext } from './ICosmosDBWizardContext';

export class CosmosDBConnectionCreateStep extends AzureConnectionCreateStepBase<IFunctionWizardContext & ICosmosDBWizardContext> {
    public async getConnection(wizardContext: ICosmosDBWizardContext): Promise<IConnection> {
        const databaseAccount: CosmosDBManagementModels.DatabaseAccount = nonNullProp(wizardContext, 'databaseAccount');
        const name: string = nonNullProp(databaseAccount, 'name');

        const client: CosmosDBManagementClient = createAzureClient(wizardContext, CosmosDBManagementClient);
        const resourceGroup: string = getResourceGroupFromId(nonNullProp(databaseAccount, 'id'));
        const csListResult: CosmosDBManagementModels.DatabaseAccountListConnectionStringsResult = await client.databaseAccounts.listConnectionStrings(resourceGroup, name);
        const cs: CosmosDBManagementModels.DatabaseAccountConnectionString = nonNullValue(nonNullProp(csListResult, 'connectionStrings')[0], 'connectionStrings[0]');
        return {
            name,
            connectionString: nonNullProp(cs, 'connectionString')
        };
    }

    public shouldExecute(wizardContext: ICosmosDBWizardContext): boolean {
        return !!wizardContext.databaseAccount;
    }
}
