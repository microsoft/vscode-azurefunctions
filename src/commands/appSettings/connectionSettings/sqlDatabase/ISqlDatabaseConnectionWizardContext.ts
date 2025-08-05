/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Database, type Server } from '@azure/arm-sql';
import { type IResourceGroupWizardContext } from '@microsoft/vscode-azext-azureutils';
import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type SqlDbConnectionType, type StorageConnectionType } from '../IConnectionTypesContext';
import { type ISetConnectionSettingContext } from '../ISetConnectionSettingContext';

export interface ISqlDatabaseConnectionWizardContext extends IActionContext, ISetConnectionSettingContext {
    azureWebJobsStorageType?: StorageConnectionType;
    sqlDbConnectionType?: SqlDbConnectionType;

    suggestedSqlServerLocalSettings?: string;
    suggestedSqlDbLocalSettings?: string;

    // All properites from `ISqlDbConnectionSetSettingsContext` apply
}

export interface ISqlDatabaseAzureConnectionWizardContext extends IResourceGroupWizardContext, ISqlDatabaseConnectionWizardContext {
    newSqlServerName?: string;
    newSqlDatabaseName?: string;
    newSqlAdminUsername?: string;
    newSqlAdminPassword?: string;

    sqlServer?: Server;
    sqlDatabase?: Database;
}
