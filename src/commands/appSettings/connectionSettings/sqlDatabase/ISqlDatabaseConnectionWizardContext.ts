/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceGroup } from '@azure/arm-resources';
import { type Database, type Server } from '@azure/arm-sql';
import { type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type SqlDbConnectionTypeValues, type StorageConnectionType } from "../../../../constants";
import { type ISetConnectionSettingContext } from '../ISetConnectionSettingContext';

export interface ISqlDatabaseConnectionWizardContext extends ISetConnectionSettingContext, Partial<ISubscriptionContext> {
    resourceGroup?: ResourceGroup;

    // Connection Types
    azureWebJobsStorageType?: StorageConnectionType;
    sqlDbConnectionType?: SqlDbConnectionTypeValues;

    // SQL
    newSqlServerName?: string;
    newSqlDatabaseName?: string;
    newSqlAdminUsername?: string;
    newSqlAdminPassword?: string;
    sqlServer?: Server;
    sqlDatabase?: Database;

    customSqlConnection?: string;
}
