/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import CosmosDBManagementClient = require('azure-arm-cosmosdb');
import { DatabaseAccount, DatabaseAccountListKeysResult } from 'azure-arm-cosmosdb/lib/models';
// tslint:disable-next-line:no-require-imports
import StorageClient = require('azure-arm-storage');
import { StorageAccount, StorageAccountListKeysResult } from 'azure-arm-storage/lib/models';
import { BaseResource } from 'ms-rest-azure';
import { QuickPickOptions } from 'vscode';
import { AzureTreeDataProvider, IAzureNode, IAzureQuickPickItem, IAzureUserInput } from 'vscode-azureextensionui';
import { ArgumentError } from '../errors';
import { localize } from '../localize';
import { getResourceTypeLabel, ResourceType } from '../templates/ConfigSetting';

function parseResourceId(id: string): RegExpMatchArray {
    const matches: RegExpMatchArray | null = id.match(/\/subscriptions\/(.*)\/resourceGroups\/(.*)\/providers\/(.*)\/(.*)/);

    if (matches === null || matches.length < 3) {
        throw new Error(localize('azFunc.InvalidResourceId', 'Invalid Azure Resource Id'));
    }

    return matches;
}

function getResourceGroupFromId(id: string): string {
    return parseResourceId(id)[2];
}

export function getSubscriptionFromId(id: string): string {
    return parseResourceId(id)[1];
}

interface IBaseResourceWithName extends BaseResource {
    name?: string;
}

async function promptForResource<T extends IBaseResourceWithName>(ui: IAzureUserInput, resourceType: string, resourcesTask: Promise<T[]>): Promise<T> {
    const picksTask: Promise<IAzureQuickPickItem<T>[]> = resourcesTask.then((resources: T[]) => {
        return <IAzureQuickPickItem<T>[]>(resources
            .map((r: T) => r.name ? { data: r, label: r.name } : undefined)
            .filter((p: IAzureQuickPickItem<T> | undefined) => p));
    });

    const options: QuickPickOptions = { placeHolder: localize('azFunc.resourcePrompt', 'Select a \'{0}\'', resourceType) };

    return (await ui.showQuickPick(picksTask, options)).data;
}

export interface IResourceResult {
    name: string;
    connectionString: string;
}

export async function promptForCosmosDBAccount(ui: IAzureUserInput, tree: AzureTreeDataProvider): Promise<IResourceResult> {
    const resourceTypeLabel: string = getResourceTypeLabel(ResourceType.DocumentDB);
    const node: IAzureNode = await tree.showNodePicker(AzureTreeDataProvider.subscriptionContextValue);

    // tslint:disable-next-line:no-non-null-assertion
    const client: CosmosDBManagementClient = new CosmosDBManagementClient(node.credentials, node.subscription.subscriptionId!);
    const dbAccount: DatabaseAccount = await promptForResource<DatabaseAccount>(ui, resourceTypeLabel, client.databaseAccounts.list());

    if (!dbAccount.id || !dbAccount.name) {
        throw new ArgumentError(dbAccount);
    } else {
        const resourceGroup: string = getResourceGroupFromId(dbAccount.id);
        const keys: DatabaseAccountListKeysResult = await client.databaseAccounts.listKeys(resourceGroup, dbAccount.name);
        return {
            name: dbAccount.name,
            connectionString: `AccountEndpoint=${dbAccount.documentEndpoint};AccountKey=${keys.primaryMasterKey};`
        };
    }
}

export async function promptForStorageAccount(ui: IAzureUserInput, tree: AzureTreeDataProvider): Promise<IResourceResult> {
    const resourceTypeLabel: string = getResourceTypeLabel(ResourceType.Storage);
    const node: IAzureNode = await tree.showNodePicker(AzureTreeDataProvider.subscriptionContextValue);

    // tslint:disable-next-line:no-non-null-assertion
    const client: StorageClient = new StorageClient(node.credentials, node.subscription.subscriptionId!);
    const storageAccount: StorageAccount = await promptForResource<StorageAccount>(ui, resourceTypeLabel, client.storageAccounts.list());

    if (!storageAccount.id || !storageAccount.name) {
        throw new ArgumentError(storageAccount);
    } else {
        const resourceGroup: string = getResourceGroupFromId(storageAccount.id);
        const result: StorageAccountListKeysResult = await client.storageAccounts.listKeys(resourceGroup, storageAccount.name);
        if (!result.keys || result.keys.length === 0) {
            throw new ArgumentError(result);
        } else {
            return {
                name: storageAccount.name,
                connectionString: `DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${result.keys[0].value}`
            };
        }
    }
}
