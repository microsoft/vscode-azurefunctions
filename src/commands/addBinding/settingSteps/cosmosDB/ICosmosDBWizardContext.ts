/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DatabaseAccountGetResults } from '@azure/arm-cosmosdb';
import { type ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';

export interface ICosmosDBWizardContext extends ISubscriptionActionContext {
    databaseAccount?: DatabaseAccountGetResults;
}
