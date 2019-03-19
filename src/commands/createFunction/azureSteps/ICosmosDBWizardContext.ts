/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CosmosDBManagementModels } from 'azure-arm-cosmosdb';
import { ISubscriptionWizardContext } from 'vscode-azureextensionui';

export interface ICosmosDBWizardContext extends ISubscriptionWizardContext {
    databaseAccount?: CosmosDBManagementModels.DatabaseAccount;
}
