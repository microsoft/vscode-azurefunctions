/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ResourceManagementModels } from '@azure/arm-resources';
import type { Database, Server } from '@azure/arm-sql';
import { IActionContext, ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { ConnectionTypeValues } from "../../../../constants";

export interface ISqlDatabaseConnectionWizardContext extends IActionContext, Partial<ISubscriptionContext> {
    projectPath: string;

    resourceGroup?: ResourceManagementModels.ResourceGroup;

    // Connection Types
    azureWebJobsStorageType?: ConnectionTypeValues;
    sqlDbConnectionType?: ConnectionTypeValues;

    // SQL
    newSqlServerName?: string;
    newSqlDatabaseName?: string;
    newSqlAdminUsername?: string;
    newSqlAdminPassword?: string;
    sqlServer?: Server;
    sqlDatabase?: Database;

    customSqlConnection?: string;
    sqlDbRemoteConnection?: string;
}
