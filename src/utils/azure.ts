/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CosmosDBManagementClient, CosmosDBManagementModels } from 'azure-arm-cosmosdb';
import { ServiceBusManagementClient, ServiceBusManagementModels } from 'azure-arm-sb';
import { StorageManagementClient, StorageManagementModels } from 'azure-arm-storage';
import { BaseResource } from 'ms-rest-azure';
import { QuickPickOptions } from 'vscode';
import { AzureTreeItem, AzureWizard, createAzureClient, IActionContext, IAzureQuickPickItem, IAzureUserInput, IStorageAccountFilters, IStorageAccountWizardContext, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication, SubscriptionTreeItem } from 'vscode-azureextensionui';
import { ArgumentError } from '../errors';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getResourceTypeLabel, ResourceType } from '../templates/IFunctionSetting';
import { nonNullProp } from './nonNull';

function parseResourceId(id: string): RegExpMatchArray {
    const matches: RegExpMatchArray | null = id.match(/\/subscriptions\/(.*)\/resourceGroups\/(.*)\/providers\/(.*)\/(.*)/);

    if (matches === null || matches.length < 3) {
        throw new Error(localize('azFunc.InvalidResourceId', 'Invalid Azure Resource Id'));
    }

    return matches;
}

export function getResourceGroupFromId(id: string): string {
    return parseResourceId(id)[2];
}

export function getSubscriptionFromId(id: string): string {
    return parseResourceId(id)[1];
}

export function getNameFromId(id: string): string {
    return parseResourceId(id)[4];
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
    id?: string;
}

export async function promptForCosmosDBAccount(): Promise<IResourceResult> {
    const resourceTypeLabel: string = getResourceTypeLabel(ResourceType.DocumentDB);
    const node: AzureTreeItem = await ext.tree.showTreeItemPicker(SubscriptionTreeItem.contextValue);

    const client: CosmosDBManagementClient = createAzureClient(node.root, CosmosDBManagementClient);
    const dbAccount: CosmosDBManagementModels.DatabaseAccount = await promptForResource<CosmosDBManagementModels.DatabaseAccount>(ext.ui, resourceTypeLabel, client.databaseAccounts.list());

    if (!dbAccount.id || !dbAccount.name) {
        throw new ArgumentError(dbAccount);
    } else {
        const resourceGroup: string = getResourceGroupFromId(dbAccount.id);
        const keys: CosmosDBManagementModels.DatabaseAccountListKeysResult = await client.databaseAccounts.listKeys(resourceGroup, dbAccount.name);
        return {
            name: dbAccount.name,
            connectionString: `AccountEndpoint=${dbAccount.documentEndpoint};AccountKey=${keys.primaryMasterKey};`
        };
    }
}

export async function promptForStorageAccount(actionContext: IActionContext, filterOptions: IStorageAccountFilters): Promise<IResourceResult> {
    const node: AzureTreeItem = await ext.tree.showTreeItemPicker(SubscriptionTreeItem.contextValue);

    const wizardContext: IStorageAccountWizardContext = Object.assign({}, node.root);
    const wizard: AzureWizard<IStorageAccountWizardContext> = new AzureWizard(
        [new StorageAccountListStep({ kind: StorageAccountKind.Storage, performance: StorageAccountPerformance.Standard, replication: StorageAccountReplication.LRS }, filterOptions)],
        [],
        wizardContext
    );

    await wizard.prompt(actionContext);
    await wizard.execute(actionContext);

    const client: StorageManagementClient = createAzureClient(node.root, StorageManagementClient);
    // tslint:disable-next-line:no-non-null-assertion
    const storageAccount: StorageManagementModels.StorageAccount = <StorageManagementModels.StorageAccount>wizardContext.storageAccount!;

    if (!storageAccount.id || !storageAccount.name) {
        throw new ArgumentError(storageAccount);
    } else {
        const resourceGroup: string = getResourceGroupFromId(storageAccount.id);
        const result: StorageManagementModels.StorageAccountListKeysResult = await client.storageAccounts.listKeys(resourceGroup, storageAccount.name);
        if (!result.keys || result.keys.length === 0) {
            throw new ArgumentError(result);
        }
        return {
            name: storageAccount.name,
            connectionString: `DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${result.keys[0].value}`,
            id: storageAccount.id
        };
    }
}

export async function promptForServiceBus(): Promise<IResourceResult> {
    const resourceTypeLabel: string = getResourceTypeLabel(ResourceType.ServiceBus);
    const node: AzureTreeItem = await ext.tree.showTreeItemPicker(SubscriptionTreeItem.contextValue);

    const client: ServiceBusManagementClient = createAzureClient(node.root, ServiceBusManagementClient);
    const resource: ServiceBusManagementModels.SBNamespace = await promptForResource<ServiceBusManagementModels.SBNamespace>(ext.ui, resourceTypeLabel, client.namespaces.list());
    const id: string = nonNullProp(resource, 'id');
    const name: string = nonNullProp(resource, 'name');

    const resourceGroup: string = getResourceGroupFromId(id);
    const authRules: ServiceBusManagementModels.SBAuthorizationRule[] = await client.namespaces.listAuthorizationRules(resourceGroup, name);
    const authRule: ServiceBusManagementModels.SBAuthorizationRule | undefined = authRules.find((ar: ServiceBusManagementModels.SBAuthorizationRule) => ar.rights.some((r: string) => r.toLowerCase() === 'listen'));
    if (!authRule) {
        throw new Error(localize('noAuthRule', 'Failed to get connection string for Service Bus namespace "{0}".', name));
    }
    const keys: ServiceBusManagementModels.AccessKeys = await client.namespaces.listKeys(resourceGroup, name, nonNullProp(authRule, 'name'));
    return {
        name: name,
        connectionString: nonNullProp(keys, 'primaryConnectionString')
    };
}
