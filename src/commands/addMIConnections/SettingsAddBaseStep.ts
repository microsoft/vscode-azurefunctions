/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { createResourceClient } from "@microsoft/vscode-azext-azureappservice";
import { CommonRoleDefinitions, createRoleId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardExecuteStep, nonNullProp, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { type AddMIConnectionsContext } from "./AddMIConnectionsContext";
import { type Connection } from "./ConnectionsListStep";

export class SettingsAddBaseStep extends AzureWizardExecuteStep<AddMIConnectionsContext> {
    public priority: number = 150;

    public async execute(context: AddMIConnectionsContext): Promise<void> {
        context.roles = [];
        context.connectionsToAdd = [];
        for (const connection of nonNullProp(context, 'connections')) {
            if (connection.name.includes('AzureWebJobsStorage')) {
                await addStorageConnectionsAndRoles(context, connection, true);
            } else if ((/DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+;EndpointSuffix=[^;]+/).test(connection.value)) {
                await addStorageConnectionsAndRoles(context, connection);
            } else if ((/AccountEndpoint=https:\/\/[^;]+;AccountKey=[^;]+;/).test(connection.value)) {
                await addDocumentConnectionsAndRoles(context, connection);
            } else if ((/Endpoint=sb:\/\/[^;]+;SharedAccessKeyName=[^;]+;SharedAccessKey=[^;]+(?:;EntityPath=[^;]+)?/).test(connection.value)) {
                await addEventHubServiceBusConnectionsAndRoles(context, connection);
            }
        }
    }

    public shouldExecute(context: AddMIConnectionsContext): boolean {
        return !!context.connections;
    }
}

async function getScopeHelper(context: AddMIConnectionsContext, accountName: string, filter: string): Promise<string> {
    const client = await createResourceClient(context);
    const resources = await uiUtils.listAllIterator(client.resources.list({ filter: `resourceType eq '${filter}'` }));

    for await (const resource of resources) {
        if (resource.name === accountName) {
            return nonNullProp(resource, 'id');
        }
    }

    throw new Error(localize('noResourceFound', `No resource found with name "{0}" in subscription "{1}"`, accountName, context.subscriptionDisplayName));
}

function addRole(context: AddMIConnectionsContext, scope: string, roleDefinition: typeof CommonRoleDefinitions[keyof typeof CommonRoleDefinitions]): void {
    const role = {
        scopeId: scope,
        roleDefinitionId: createRoleId(context.subscriptionId, roleDefinition),
        roleDefinitionName: roleDefinition.roleName
    };

    context.roles?.push(role);
}

async function addStorageConnectionsAndRoles(context: AddMIConnectionsContext, connection: Connection, webJobsStorage?: boolean) {
    // Storage connection strings are of format: DefaultEndpointsProtocol=https;AccountName=storageAccountName;AccountKey=accountKey;EndpointSuffix=core.windows.net
    if (connection.value === '') {
        throw new Error(localize('emptyStorageConnectionString', 'Storage connection string is empty. Please provide a valid connection string.'));
    }
    try {
        const storageAccountName = connection.value.split(';')[1].split('=')[1];
        context.connectionsToAdd?.push(
            {
                name: webJobsStorage ? 'AzureWebJobsStorage__blobServiceUri' : `${storageAccountName}__blobServiceUri`,
                value: `https://${storageAccountName}.blob.core.windows.net`,
            },
            {
                name: webJobsStorage ? 'AzureWebJobsStorage__queueServiceUri' : `${storageAccountName}__queueServiceUri`,
                value: `https://${storageAccountName}.queue.core.windows.net`,
            },
            {
                name: webJobsStorage ? 'AzureWebJobsStorage__tableServiceUri' : `${storageAccountName}__tableServiceUri`,
                value: `https://${storageAccountName}.table.core.windows.net`,
            },
            ...getClientIdAndCredentialPropertiesForRemote(context, webJobsStorage ? 'AzureWebJobsStorage' : storageAccountName)
        );
        if (context.functionapp) {
            const scope = await getScopeHelper(context, storageAccountName, 'Microsoft.Storage/storageAccounts')
            addRole(context, scope, CommonRoleDefinitions.storageBlobDataOwner);
            addRole(context, scope, CommonRoleDefinitions.storageQueueDataContributor);
        }
    } catch (e) {
        throw new Error(localize('invalidStorageConnectionString', 'Unexpected storage connection string format: {0}', connection.value));
    }

}

async function addDocumentConnectionsAndRoles(context: AddMIConnectionsContext, connection: Connection) {
    // DocumentDB connection strings are of format: AccountEndpoint=https://<accountName>.documents.azure.com:443/;AccountKey=<accountKey>;
    if (connection.value === '') {
        throw new Error(localize('emptyCosmosDBConnectionString', 'Cosmos DB connection string is empty. Please provide a valid connection string.'));
    }
    try {
        const cosmosDbAccountURI = connection.value.split(';')[0].split('=')[1];
        const cosmosDbAccountName = connection.value.split(';')[0].split('/')[2].split('.')[0];

        context.connectionsToAdd?.push(
            {
                name: `${cosmosDbAccountName}__accountEndpoint`,
                value: cosmosDbAccountURI,
            },
            ...getClientIdAndCredentialPropertiesForRemote(context, cosmosDbAccountName)
        );
    } catch (e) {
        throw new Error(localize('invalidDocumentConnectionString', 'Unexpected DocumentDB connection string format: {0}', connection.value));
    }
}

async function addEventHubServiceBusConnectionsAndRoles(context: AddMIConnectionsContext, connection: Connection) {
    // EventHub connection strings are of format: Endpoint=sb://<eventHubNamespace>.servicebus.windows.net/;SharedAccessKeyName=<sharedAccessKeyName>;SharedAccessKey=<sharedAccessKey>;
    if (connection.value === '') {
        throw new Error(localize('emptyEventHubConnectionString', 'Connection string is empty. Please provide a valid connection string.'));
    }
    try {
        const namespace = connection.value.split(';')[0].split('/')[2].split('.')[0];

        context.connectionsToAdd?.push(
            {
                name: `${namespace}__fullyQualifiedNamespace`,
                value: `${namespace}.servicebus.windows.net`,
            },
            ...getClientIdAndCredentialPropertiesForRemote(context, namespace)
        );
        if (context.functionapp) {
            let scope = '';
            try {
                scope = await getScopeHelper(context, namespace, 'Microsoft.EventHub/Namespaces');
            } catch (e) {
                scope = await getScopeHelper(context, namespace, 'Microsoft.ServiceBus/Namespaces');
            }

            if (scope.includes('Microsoft.EventHub/Namespaces')) {
                addRole(context, scope, CommonRoleDefinitions.azureEventHubsDataOwner);
                addRole(context, scope, CommonRoleDefinitions.azureEventHubsDataReceiver);
            } else {
                addRole(context, scope, CommonRoleDefinitions.azureServiceBusDataOwner);
                addRole(context, scope, CommonRoleDefinitions.azureServiceBusDataReceiver);
            }
        }
    } catch (e) {
        throw new Error(localize('invalidEventHubConnectionString', 'Unexpected EventHub connection string format: {0}', connection.value));
    }
}

function getClientIdAndCredentialPropertiesForRemote(context: AddMIConnectionsContext, connectionName: string): Connection[] {
    const clientIdAndConfigurationProperties: Connection[] = [];
    // Only add these properties if adding remote settings
    if (context.functionapp) {
        clientIdAndConfigurationProperties.push(
            {
                name: `${connectionName}__clientId`,
                value: nonNullValueAndProp(context.managedIdentity, 'clientId')
            },
            {
                name: `${connectionName}__credential`,
                value: 'managedIdentity'
            }
        );
    }

    return clientIdAndConfigurationProperties;

}
