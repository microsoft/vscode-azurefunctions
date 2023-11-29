/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type CosmosDBManagementClient } from '@azure/arm-cosmosdb';
import { uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { promptForResource } from '../../../../utils/azure';
import { createCosmosDBClient } from '../../../../utils/azureClients';
import { type ICosmosDBWizardContext } from './ICosmosDBWizardContext';

export class CosmosDBListStep extends AzureWizardPromptStep<ICosmosDBWizardContext> {
    public async prompt(context: ICosmosDBWizardContext): Promise<void> {
        const placeHolder: string = localize('placeHolder', 'Select a database account');
        const client: CosmosDBManagementClient = await createCosmosDBClient(context);
        context.databaseAccount = await promptForResource(context, placeHolder,
            uiUtils.listAllIterator(client.databaseAccounts.list()));
    }

    public shouldPrompt(context: ICosmosDBWizardContext): boolean {
        return !context.databaseAccount;
    }
}
