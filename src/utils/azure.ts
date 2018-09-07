/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CosmosDBManagementClient } from 'azure-arm-cosmosdb';
import { DatabaseAccount, DatabaseAccountListKeysResult } from 'azure-arm-cosmosdb/lib/models';
// tslint:disable-next-line:no-require-imports
import StorageClient = require('azure-arm-storage');
import { StorageAccount, StorageAccountListKeysResult } from 'azure-arm-storage/lib/models';
import { BaseResource } from 'ms-rest-azure';
import { QuickPickOptions } from 'vscode';
import { addExtensionUserAgent, AzureTreeDataProvider, AzureWizard, IActionContext, IAzureNode, IAzureQuickPickItem, IAzureUserInput, IStorageAccountFilters, IStorageAccountWizardContext, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication } from 'vscode-azureextensionui';
import { ArgumentError } from '../errors';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getResourceTypeLabel, ResourceType } from '../templates/IFunctionSetting';

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
    const node: IAzureNode = await ext.tree.showNodePicker(AzureTreeDataProvider.subscriptionContextValue);

    const client: CosmosDBManagementClient = new CosmosDBManagementClient(node.credentials, node.subscriptionId, node.environment.resourceManagerEndpointUrl);
    addExtensionUserAgent(client);
    const dbAccount: DatabaseAccount = await promptForResource<DatabaseAccount>(ext.ui, resourceTypeLabel, client.databaseAccounts.list());

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

export async function promptForStorageAccount(actionContext: IActionContext, filterOptions: IStorageAccountFilters): Promise<IResourceResult> {
    const node: IAzureNode = await ext.tree.showNodePicker(AzureTreeDataProvider.subscriptionContextValue);

    const wizardContext: IStorageAccountWizardContext = {
        credentials: node.credentials,
        subscriptionId: node.subscriptionId,
        subscriptionDisplayName: node.subscriptionDisplayName,
        environment: node.environment
    };
    const wizard: AzureWizard<IStorageAccountWizardContext> = new AzureWizard(
        [new StorageAccountListStep({ kind: StorageAccountKind.Storage, performance: StorageAccountPerformance.Standard, replication: StorageAccountReplication.LRS }, filterOptions)],
        [],
        wizardContext
    );

    await wizard.prompt(actionContext);
    await wizard.execute(actionContext);

    const client: StorageClient = new StorageClient(node.credentials, node.subscriptionId, node.environment.resourceManagerEndpointUrl);
    addExtensionUserAgent(client);
    // tslint:disable-next-line:no-non-null-assertion
    const storageAccount: StorageAccount = wizardContext.storageAccount!;

    if (!storageAccount.id || !storageAccount.name) {
        throw new ArgumentError(storageAccount);
    } else {
        const resourceGroup: string = getResourceGroupFromId(storageAccount.id);
        const result: StorageAccountListKeysResult = await client.storageAccounts.listKeys(resourceGroup, storageAccount.name);
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
