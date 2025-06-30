/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StorageAccount, type StorageAccountListKeysResult, type StorageManagementClient } from "@azure/arm-storage";
import { getResourceGroupFromId, type IStorageAccountWizardContext } from "@microsoft/vscode-azext-azureutils";
import { nonNullProp, nonNullValue, randomUtils } from "@microsoft/vscode-azext-utils";
import { localStorageEmulatorConnectionString } from "../../../constants";
import { createStorageClient } from "../../../utils/azureClients";

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
