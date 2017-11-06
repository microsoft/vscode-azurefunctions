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
import { AzureAccount, AzureResourceFilter } from '../azure-account.api';
import { ArgumentError, NoSubscriptionError } from '../errors';
import { IUserInterface, PickWithData } from '../IUserInterface';
import { localize } from '../localize';
import { getResourceTypeLabel, ResourceType } from '../templates/ConfigSetting';

function getResourceGroupFromId(id: string): string {
    const matches: RegExpMatchArray | null = id.match(/\/subscriptions\/(.*)\/resourceGroups\/(.*)\/providers\/(.*)\/(.*)/);

    if (matches === null || matches.length < 3) {
        throw new Error(localize('azFunc.InvalidResourceId', 'Invalid Azure Resource Id'));
    }

    return matches[2];
}

interface IBaseResourceWithName extends BaseResource {
    name?: string;
}

async function promptForResource<T extends IBaseResourceWithName>(ui: IUserInterface, resourceType: string, resourcesTask: Promise<T[]>): Promise<T> {
    const picksTask: Promise<PickWithData<T>[]> = resourcesTask.then((resources: T[]) => {
        return <PickWithData<T>[]>(resources
            .map((br: T) => br.name ? new PickWithData(br, br.name) : undefined)
            .filter((p: PickWithData<T> | undefined) => p));
    });
    const prompt: string = localize('azFunc.resourcePrompt', 'Select a \'{0}\'', resourceType);

    return (await ui.showQuickPick<T>(picksTask, prompt)).data;
}

async function promptForSubscription(ui: IUserInterface, azureAccount: AzureAccount, resourceType: string): Promise<AzureResourceFilter> {
    if (azureAccount.filters.length === 0) {
        throw new NoSubscriptionError();
    } else if (azureAccount.filters.length === 1) {
        return azureAccount.filters[0];
    } else {
        const subscriptionPicks: PickWithData<AzureResourceFilter>[] = [];
        azureAccount.filters.forEach((f: AzureResourceFilter) => {
            const subscriptionId: string | undefined = f.subscription.subscriptionId;
            if (subscriptionId) {
                const label: string = f.subscription.displayName || subscriptionId;
                subscriptionPicks.push(new PickWithData<AzureResourceFilter>(f, label, subscriptionId));
            }
        });
        const placeHolder: string = localize('azFunc.selectSubscription', 'Select the Subscription containing your \'{0}\'', resourceType);

        return (await ui.showQuickPick<AzureResourceFilter>(subscriptionPicks, placeHolder)).data;
    }
}

export interface IResourceResult {
    name: string;
    connectionString: string;
}

export async function promptForCosmosDBAccount(ui: IUserInterface, azureAccount: AzureAccount): Promise<IResourceResult> {
    const resourceTypeLabel: string = getResourceTypeLabel(ResourceType.DocumentDB);
    const subscription: AzureResourceFilter = await promptForSubscription(ui, azureAccount, resourceTypeLabel);
    if (!subscription.subscription.subscriptionId) {
        throw new ArgumentError(subscription);
    }

    const client: CosmosDBManagementClient = new CosmosDBManagementClient(subscription.session.credentials, subscription.subscription.subscriptionId);
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

export async function promptForStorageAccount(ui: IUserInterface, azureAccount: AzureAccount): Promise<IResourceResult> {
    const resourceTypeLabel: string = getResourceTypeLabel(ResourceType.Storage);
    const subscription: AzureResourceFilter = await promptForSubscription(ui, azureAccount, resourceTypeLabel);
    if (!subscription.subscription.subscriptionId) {
        throw new ArgumentError(subscription);
    }

    const client: StorageClient = new StorageClient(subscription.session.credentials, subscription.subscription.subscriptionId);
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
