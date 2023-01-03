/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessKeys, AuthorizationRule, EventHubManagementClient, KnownAccessRights } from "@azure/arm-eventhub";
import type { StorageAccount, StorageAccountListKeysResult, StorageManagementClient } from "@azure/arm-storage";
import { getResourceGroupFromId, IStorageAccountWizardContext, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { ISubscriptionContext, nonNullProp, nonNullValue } from "@microsoft/vscode-azext-utils";
import { defaultDescription } from "../../../constants-nls";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { createEventHubClient, createStorageClient } from "../../../utils/azureClients";
import { createAndGetAuthRuleName } from "../../createFunction/durableSteps/netherite/createAndGetAuthRuleName";
import { IEventHubsConnectionWizardContext } from "./eventHubs/IEventHubsConnectionWizardContext";
import { ISqlDatabaseConnectionWizardContext } from "./sqlDatabase/ISqlDatabaseConnectionWizardContext";

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
    const rgName: string = getResourceGroupFromId(nonNullValue(context.eventHubsNamespace?.id));
    const namespaceName: string = nonNullValue(context.eventHubsNamespace?.name);

    const authRulesIterable = client.namespaces.listAuthorizationRules(rgName, namespaceName);
    const authRules: AuthorizationRule[] = await uiUtils.listAllIterator(authRulesIterable);
    const manageAccessRules: AuthorizationRule[] = authRules.filter(authRule => authRule.rights?.includes(KnownAccessRights.Manage));

    let authRuleName: string;
    if (!manageAccessRules.length) {
        authRuleName = await createAndGetAuthRuleName(context);
    } else if (manageAccessRules.length === 1) {
        authRuleName = nonNullProp(authRules[0], 'name');
    } else {
        const rootKeyName: string = 'RootManageSharedAccessKey';
        const placeHolder: string = localize('chooseSharedAccessPolicy', 'Choose a shared access policy.');

        authRuleName = (await context.ui.showQuickPick(manageAccessRules.map(authRule => {
            return { label: nonNullProp(authRule, 'name'), suppressPersistence: true, description: authRule.name === rootKeyName ? defaultDescription : '' };
        }), { placeHolder })).label;
    }

    const accessKeys: AccessKeys = await client.namespaces.listKeys(rgName, namespaceName, authRuleName);
    if (!accessKeys.primaryConnectionString && !accessKeys.secondaryConnectionString) {
        const learnMoreLink: string = 'https://aka.ms/event-hubs-connection-string';
        const message: string = localize('missingEventHubsConnectionString', 'There are no connection strings available on your namespace\'s shared access policy. Locate a valid access policy and add the connection string to "{0}".', 'local.settings.json');
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
