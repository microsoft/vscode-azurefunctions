/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { createResourceClient } from "@microsoft/vscode-azext-azureappservice";
import { CommonRoleDefinitions, createRoleId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardExecuteStep, nonNullProp, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { type Connection } from "./ConnectionsListStep";
import { type IAddMIConnectionsContext } from "./IAddMIConnectionsContext";

export class SettingsAddBaseStep extends AzureWizardExecuteStep<IAddMIConnectionsContext> {
    public priority: number = 100;

    public async execute(context: IAddMIConnectionsContext): Promise<void> {
        context.roles = [];
        context.connectionsToAdd = [];
        for (const connection of nonNullProp(context, 'connections')) {
            if (connection.name.includes('AzureWebJobsStorage')) {
                await addStorageConnectionsAndRoles(context, connection, true);
            } else if (connection.name.includes('STORAGE')) {
                await addStorageConnectionsAndRoles(context, connection);
            } else if (connection.name.includes('DOCUMENTDB')) {
                await addDocumentConnectionsAndRoles(context, connection);
            } else if (connection.name.includes('EVENTHUB')) {
                await addEventHubConnectionsAndRoles(context, connection);
            } else if (connection.name.includes('SERVICEBUS')) {
                await addServiceBusConnectionsAndRoles(context, connection);
            }
        }
    }

    public shouldExecute(context: IAddMIConnectionsContext): boolean {
        return !!context.connections;
    }
}

async function getScopeHelper(context: IAddMIConnectionsContext, accountName: string, filter: string): Promise<string> {
    const client = await createResourceClient(context);
    const resources = await uiUtils.listAllIterator(client.resources.list({ filter: `resourceType eq '${filter}'` }));

    for await (const resource of resources) {
        if (resource.name === accountName) {
            return nonNullProp(resource, 'id');
        }
    }

    throw new Error(localize('noResourceFound', `No resource found with name "{0}" in subscription "{1}"`, accountName, context.subscriptionDisplayName));
}



function addRole(context: IAddMIConnectionsContext, scope: string, roleDefinition: typeof CommonRoleDefinitions[keyof typeof CommonRoleDefinitions]): void {
    // Only assign roles if adding remote settings
    if (context.functionapp) {
        const role = {
            scopeId: scope,
            roleDefinitionId: createRoleId(context.subscriptionId, roleDefinition),
            roleDefinitionName: roleDefinition.roleName
        };

        context.roles?.push(role);
    }
}

async function addStorageConnectionsAndRoles(context: IAddMIConnectionsContext, connection: Connection, webJobsStorage?: boolean) {
    // Storage connection strings are of format: DefaultEndpointsProtocol=https;AccountName=storageAccountName;AccountKey=accountKey;EndpointSuffix=core.windows.net
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
            ...getClientIdAndCredentialProperties(context, webJobsStorage ? 'AzureWebJobsStorage' : storageAccountName)
        );
        const scope = await getScopeHelper(context, storageAccountName, 'Microsoft.Storage/storageAccounts')
        addRole(context, scope, CommonRoleDefinitions.storageBlobDataOwner);
        addRole(context, scope, CommonRoleDefinitions.storageQueueDataContributor);
    } catch (e) {
        throw new Error(localize('invalidStorageConnectionString', 'Unexpected storage connection string format: {0}', connection.value));
    }

}

async function addDocumentConnectionsAndRoles(context: IAddMIConnectionsContext, connection: Connection) {
    // DocumentDB connection strings are of format: AccountEndpoint=https://<accountName>.documents.azure.com:443/;AccountKey=<accountKey>;
    try {
        const cosmosDbAccountURI = connection.value.split(';')[0].split('=')[1];
        const cosmosDbAccountName = connection.value.split(';')[0].split('/')[2].split('.')[0];

        context.connectionsToAdd?.push(
            {
                name: `${cosmosDbAccountName}__accountEndpoint`,
                value: cosmosDbAccountURI,
            },
            ...getClientIdAndCredentialProperties(context, cosmosDbAccountName)
        );
    } catch (e) {
        throw new Error(localize('invalidDocumentConnectionString', 'Unexpected DocumentDB connection string format: {0}', connection.value));
    }
}

async function addEventHubConnectionsAndRoles(context: IAddMIConnectionsContext, connection: Connection) {
    // EventHub connection strings are of format: Endpoint=sb://<eventHubNamespace>.servicebus.windows.net/;SharedAccessKeyName=<sharedAccessKeyName>;SharedAccessKey=<sharedAccessKey>;
    try {

        const eventHubNamespace = connection.value.split(';')[0].split('/')[2].split('.')[0];

        context.connectionsToAdd?.push(
            {
                name: `${eventHubNamespace}__fullyQualifiedNamespace`,
                value: `${eventHubNamespace}.servicebus.windows.net`,
            },
            ...getClientIdAndCredentialProperties(context, eventHubNamespace)
        );

        const scope = await getScopeHelper(context, eventHubNamespace, 'Microsoft.EventHub/Namespaces');

        addRole(context, scope, CommonRoleDefinitions.azureEventHubsDataOwner);
        addRole(context, scope, CommonRoleDefinitions.azureEventHubsDataReceiver);
    } catch (e) {
        throw new Error(localize('invalidEventHubConnectionString', 'Unexpected EventHub connection string format: {0}', connection.value));
    }
}

async function addServiceBusConnectionsAndRoles(context: IAddMIConnectionsContext, connection: Connection) {
    // ServiceBus connection strings are of format: Endpoint=sb://<serviceBusNamespace>.servicebus.windows.net/;SharedAccessKeyName=<sharedAccessKeyName>;SharedAccessKey=<sharedAccessKey>;
    try {
        const serviceBusNamespace = connection.value.split(';')[0].split('/')[2].split('.')[0];

        context.connectionsToAdd?.push(
            {
                name: `${serviceBusNamespace}__fullyQualifiedNamespace`,
                value: `${serviceBusNamespace}.servicebus.windows.net`,
            },
            ...getClientIdAndCredentialProperties(context, serviceBusNamespace)
        );

        const scope = await getScopeHelper(context, serviceBusNamespace, 'Microsoft.ServiceBus/Namespaces');
        addRole(context, scope, CommonRoleDefinitions.azureServiceBusDataOwner);
        addRole(context, scope, CommonRoleDefinitions.azureServiceBusDataReceiver);
    } catch (e) {
        throw new Error(localize('invalidServiceBusConnectionString', 'Unexpected ServiceBus connection string format: {0}', connection.value));
    }
}

function getClientIdAndCredentialProperties(context: IAddMIConnectionsContext, connectionName: string): Connection[] {
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
