/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DatabaseAccountGetResults } from '@azure/arm-cosmosdb';
import { ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';

export interface ICosmosDBWizardContext extends ISubscriptionActionContext {
    databaseAccount?: DatabaseAccountGetResults;
}
