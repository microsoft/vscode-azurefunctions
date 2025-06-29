/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StorageAccount, type StorageAccountListKeysResult, type StorageManagementClient } from "@azure/arm-storage";
import { getResourceGroupFromId, type IStorageAccountWizardContext } from "@microsoft/vscode-azext-azureutils";
import { nonNullProp, nonNullValue, randomUtils } from "@microsoft/vscode-azext-utils";
import { localStorageEmulatorConnectionString } from "../../../constants";
import { localize } from "../../../localize";
import { createStorageClient } from "../../../utils/azureClients";
import { type ISqlDatabaseConnectionWizardContext } from "./sqlDatabase/ISqlDatabaseConnectionWizardContext";

export interface IResourceResult {
    name: string;
    connectionString: string;
}

export async function getStorageConnectionString(context: IStorageAccountWizardContext & { useStorageEmulator?: boolean }): Promise<IResourceResult> {
    if (context.useStorageEmulator) {
        return {
            name: randomUtils.getRandomHexString(6),
            connectionString: localStorageEmulatorConnectionString
        }
    }

    const client: StorageManagementClient = await createStorageClient(context);
    const storageAccount: StorageAccount = nonNullProp(context, 'storageAccount');
    const name: string = nonNullProp(storageAccount, 'name');
    const resourceGroup: string = getResourceGroupFromId(nonNullProp(storageAccount, 'id'));
    const result: StorageAccountListKeysResult = await client.storageAccounts.listKeys(resourceGroup, name);
    const key: string = nonNullProp(nonNullValue(nonNullProp(result, 'keys')[0], 'keys[0]'), 'value');

    let endpointSuffix: string = nonNullProp(context.environment, 'storageEndpointSuffix');
    // https://github.com/Azure/azure-sdk-for-node/issues/4706
    if (endpointSuffix.startsWith('.')) {
        endpointSuffix = endpointSuffix.substr(1);
    }

    return {
        name,
        connectionString: `DefaultEndpointsProtocol=https;AccountName=${name};AccountKey=${key};EndpointSuffix=${endpointSuffix}`
    };
}

export async function getSqlDatabaseConnectionString(context: ISqlDatabaseConnectionWizardContext): Promise<IResourceResult> {
    const serverName: string = nonNullValue(context.sqlServer?.name);
    const dbName: string = nonNullValue(context.sqlDatabase?.name);
    const username: string | undefined = context.sqlServer?.administratorLogin;

    if (!username) {
        throw new Error(localize('unableToDetermineSqlConnection', 'Unable to locate SQL server\'s admin user. Add these credentials to your resource to proceed.'));
    }

    let password: string | undefined = context.newSqlAdminPassword;  // password is never returned back to us on the sqlServer object
    if (!password) {
        password = (await context.ui.showInputBox({
            prompt: localize('sqlPasswordPrompt', 'Please enter your SQL server\'s admin password.'),
            password: true
        })).trim();
    }

    return {
        name: dbName,
        connectionString: `Server=${serverName}.database.windows.net,1433;Database=${dbName};User=${username};Password=${password}`
    };
}
