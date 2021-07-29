/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CosmosDBManagementModels } from '@azure/arm-cosmosdb';
import { ISubscriptionActionContext } from 'vscode-azureextensionui';

export interface ICosmosDBWizardContext extends ISubscriptionActionContext {
    databaseAccount?: CosmosDBManagementModels.DatabaseAccountGetResults;
}
