/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AccessKeys, AuthorizationRule, EventHubManagementClient } from '@azure/arm-eventhub';
import type { StorageAccount, StorageAccountListKeysResult, StorageManagementClient } from '@azure/arm-storage';
import { AppKind, IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { getResourceGroupFromId, IStorageAccountWizardContext, uiUtils, VerifyProvidersStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, AzureWizardExecuteStep, IActionContext, IAzureQuickPickItem, ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { isArray } from 'util';
import { IEventHubsConnectionWizardContext } from '../commands/appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext';
import { ISqlDatabaseConnectionWizardContext } from '../commands/appSettings/connectionSettings/sqlDatabase/ISqlDatabaseConnectionWizardContext';
import { IFunctionAppWizardContext } from '../commands/createFunctionApp/IFunctionAppWizardContext';
import { webProvider } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { ICreateFunctionAppContext, SubscriptionTreeItem } from '../tree/SubscriptionTreeItem';
import { createEventHubClient, createStorageClient } from './azureClients';
import { nonNullProp, nonNullValue } from './nonNull';

export interface IBaseResourceWithName {
    name?: string;
    _description?: string;
}

export async function promptForResource<T extends IBaseResourceWithName>(context: IActionContext, placeHolder: string, resourcesTask: Promise<T[]>): Promise<T | undefined> {
    const picksTask: Promise<IAzureQuickPickItem<T | undefined>[]> = resourcesTask.then((resources: T[]) => {
        const picks: IAzureQuickPickItem<T | undefined>[] = !isArray(resources) ? [] : <IAzureQuickPickItem<T>[]>(resources
            .map((r: T) => r.name ? { data: r, label: r.name, description: r._description } : undefined)
            .filter((p: IAzureQuickPickItem<T> | undefined) => p));
        picks.push({
            label: localize('skipForNow', '$(clock) Skip for now'),
            data: undefined,
            suppressPersistence: true
        });
        return picks;
    });

    const data: T | undefined = (await context.ui.showQuickPick(picksTask, { placeHolder })).data;
    if (data?.name) {
        context.valuesToMask.push(data.name);
    }
    return data;
}

export interface IResourceResult {
    name: string;
    connectionString: string;
}

export async function getStorageConnectionString(context: IStorageAccountWizardContext): Promise<IResourceResult> {
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

export async function getEventHubsConnectionString(context: IEventHubsConnectionWizardContext & ISubscriptionContext): Promise<IResourceResult> {
    const client: EventHubManagementClient = await createEventHubClient(context);
    const resourceGroupName: string = getResourceGroupFromId(nonNullValue(context.eventHubsNamespace?.id));
    const namespaceName: string = nonNullValue(context.eventHubsNamespace?.name);

    const authRulesIterable = client.namespaces.listAuthorizationRules(resourceGroupName, namespaceName);
    const authRules: AuthorizationRule[] = await uiUtils.listAllIterator(authRulesIterable);

    let authRule: string;
    if (!authRules.length) {
        throw new Error(localize('noAuthRules', 'Unable to locate a shared access policy for your event hub namespace.'));
    } else if (authRules.length === 1) {
        authRule = nonNullProp(authRules[0], 'name');
    } else {
        const rootKeyName: string = 'RootManageSharedAccessKey';
        const placeHolder: string = localize('chooseSharedAccessPolicy', 'Choose a shared access policy.');

        authRule = (await context.ui.showQuickPick(authRules.map(authRule => {
            return { label: nonNullProp(authRule, 'name'), description: authRule.name === rootKeyName ? localize('default', '(Default)') : '' };
        }), { placeHolder })).label;
    }

    const accessKeys: AccessKeys = await client.namespaces.listKeys(resourceGroupName, namespaceName, authRule);
    if (!accessKeys.primaryConnectionString && !accessKeys.secondaryConnectionString) {
        const learnMoreLink: string = 'https://aka.ms/event-hubs-connection-string';
        const message: string = localize('missingEventHubsConnectionString', 'There are no connection strings available on your namespace\'s shared access policy. Locate a valid access policy and add the connection string to "local.settings.json".');
        void context.ui.showWarningMessage(message, { learnMoreLink });
        ext.outputChannel.appendLog(message);
    }

    return {
        name: namespaceName,
        connectionString: accessKeys.primaryConnectionString || accessKeys.secondaryConnectionString || ''
    };
}

export async function getSqlDatabaseConnectionString(context: ISqlDatabaseConnectionWizardContext): Promise<IResourceResult> {
    const serverName: string = nonNullValue(context.sqlServer?.name);
    const dbName: string = nonNullValue(context.sqlDatabase?.name);
    const username: string | undefined = context.sqlServer?.administratorLogin;

    if (!username) {
        throw new Error(localize('unableToDetermineSqlConnection', 'We were unable to locate the admin user for this SQL server, please add these credentials to your resource to proceed.'));
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

export async function registerProviders(context: ICreateFunctionAppContext, subscription: SubscriptionTreeItem): Promise<void> {
    const providerContext: IAppServiceWizardContext = Object.assign(context, subscription.subscription, {
        newSiteKind: AppKind.functionapp,
    });

    const storageProvider = 'Microsoft.Storage';
    const providerExecuteSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] =
        [new VerifyProvidersStep([webProvider, storageProvider, 'Microsoft.Insights', 'Microsoft.OperationalInsights'])];
    const providerWizard: AzureWizard<IFunctionAppWizardContext> = new AzureWizard(providerContext, { executeSteps: providerExecuteSteps });

    await providerWizard.execute();
}
