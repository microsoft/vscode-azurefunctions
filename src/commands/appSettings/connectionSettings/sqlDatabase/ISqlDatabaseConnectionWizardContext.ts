/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ResourceGroup } from '@azure/arm-resources';
import type { Database, Server } from '@azure/arm-sql';
import { ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { SqlDbConnectionTypeValues, StorageConnectionTypeValues } from "../../../../constants";
import { ISetConnectionSettingContext } from '../ISetConnectionSettingContext';

export interface ISqlDatabaseConnectionWizardContext extends ISetConnectionSettingContext, Partial<ISubscriptionContext> {
    resourceGroup?: ResourceGroup;

    // Connection Types
    azureWebJobsStorageType?: StorageConnectionTypeValues;
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
