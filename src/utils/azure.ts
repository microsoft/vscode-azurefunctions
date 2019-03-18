/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageManagementClient, StorageManagementModels } from 'azure-arm-storage';
import { BaseResource } from 'ms-rest-azure';
import { isArray } from 'util';
import { AzureTreeItem, AzureWizard, createAzureClient, IActionContext, IAzureQuickPickItem, IStorageAccountFilters, IStorageAccountWizardContext, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication, SubscriptionTreeItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { nonNullProp, nonNullValue } from './nonNull';

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

export async function promptForResource<T extends IBaseResourceWithName>(placeHolder: string, resourcesTask: Promise<T[]>): Promise<T | undefined> {
    const picksTask: Promise<IAzureQuickPickItem<T | undefined>[]> = resourcesTask.then((resources: T[]) => {
        const picks: IAzureQuickPickItem<T | undefined>[] = !isArray(resources) ? [] : <IAzureQuickPickItem<T>[]>(resources
            .map((r: T) => r.name ? { data: r, label: r.name } : undefined)
            .filter((p: IAzureQuickPickItem<T> | undefined) => p));
        picks.push({
            label: localize('skipForNow', '$(clock) Skip for now'),
            data: undefined,
            suppressPersistence: true
        });
        return picks;
    });

    return (await ext.ui.showQuickPick(picksTask, { placeHolder })).data;
}

export interface IResourceResult {
    name: string;
    connectionString: string;
}

export async function promptForStorageAccount(actionContext: IActionContext, filterOptions: IStorageAccountFilters): Promise<IResourceResult> {
    const node: AzureTreeItem = await ext.tree.showTreeItemPicker(SubscriptionTreeItem.contextValue);

    const wizardContext: IStorageAccountWizardContext = Object.assign({}, node.root);
    const wizard: AzureWizard<IStorageAccountWizardContext> = new AzureWizard(wizardContext, {
        title: localize('selectStorageAccount', 'Select storage account'),
        promptSteps: [new StorageAccountListStep({ kind: StorageAccountKind.Storage, performance: StorageAccountPerformance.Standard, replication: StorageAccountReplication.LRS }, filterOptions)]
    });

    await wizard.prompt(actionContext);
    await wizard.execute(actionContext);

    const client: StorageManagementClient = createAzureClient(node.root, StorageManagementClient);
    const storageAccount: StorageManagementModels.StorageAccount = <StorageManagementModels.StorageAccount>nonNullProp(wizardContext, 'storageAccount');
    const name: string = nonNullProp(storageAccount, 'name');

    const resourceGroup: string = getResourceGroupFromId(nonNullProp(storageAccount, 'id'));
    const result: StorageManagementModels.StorageAccountListKeysResult = await client.storageAccounts.listKeys(resourceGroup, name);
    const key: string = nonNullProp(nonNullValue(nonNullProp(result, 'keys')[0], 'key[0]'), 'value');

    let endpointSuffix: string = nonNullProp(node.root.environment, 'storageEndpointSuffix');
    // https://github.com/Azure/azure-sdk-for-node/issues/4706
    if (endpointSuffix.startsWith('.')) {
        endpointSuffix = endpointSuffix.substr(1);
    }

    return {
        name: name,
        connectionString: `DefaultEndpointsProtocol=https;AccountName=${name};AccountKey=${key};EndpointSuffix=${endpointSuffix}`
    };
}
