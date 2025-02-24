/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { createResourceClient } from "@microsoft/vscode-azext-azureappservice";
import { CommonRoleDefinitions, createRoleId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { activitySuccessContext, activitySuccessIcon, AzExtFsExtra, AzureWizardExecuteStep, createUniversallyUniqueContextValue, GenericTreeItem, nonNullProp } from "@microsoft/vscode-azext-utils";
import { type ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { type IConvertConnectionsContext } from "./IConvertConnectionsContext";

export class ConvertSettingsStep extends AzureWizardExecuteStep<IConvertConnectionsContext> {
    public priority: number = 100;

    public async execute(context: IConvertConnectionsContext): Promise<void> {
        if (context.connections) {
            context.roles = [];
            context.convertedConnections = [];
            for (const connection of context.connections) {
                if (connection.name.includes('AzureWebJobsStorage')) {
                    const storageAccountName = connection.value.split(';')[1].split('=')[1];
                    context.convertedConnections?.push({
                        name: 'AzureWebJobsStorage__accountName',
                        value: storageAccountName,
                        originalValue: connection.name
                    });

                    // Add role assignments to context
                    context.roles?.push({
                        scopeId: await getScopeHelper(context, storageAccountName, `resourceType eq 'Microsoft.Storage/storageAccounts'`),
                        roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.storageBlobDataOwner.name),
                        roleDefinitionName: CommonRoleDefinitions.storageBlobDataOwner.name
                    })

                    context.activityChildren?.push(
                        new GenericTreeItem(undefined, {
                            contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                            label: localize('roleAssigned', `Role Assignment ${CommonRoleDefinitions.storageBlobDataOwner.roleName} created for ${storageAccountName}`),
                            iconPath: activitySuccessIcon
                        })
                    );
                } else if (connection.name.includes('STORAGE')) {
                    const storageAccountName = connection.value.split(';')[1].split('=')[1];

                    context.convertedConnections?.push(
                        {
                            name: `${storageAccountName}__blobServiceUri`,
                            value: `https://${storageAccountName}.blob.core.windows.net`,
                            originalValue: connection.name
                        },
                        {
                            name: `${storageAccountName}__queueServiceUri`,
                            value: `https://${storageAccountName}.queue.core.windows.net`,
                            originalValue: connection.name
                        }
                    );

                    // TODO: test these roles
                    const scope = await getScopeHelper(context, storageAccountName, `resourceType eq 'Microsoft.Storage/storageAccounts'`)
                    context.roles?.push(
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.storageBlobDataOwner.name),
                            roleDefinitionName: CommonRoleDefinitions.storageBlobDataOwner.name
                        },
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.storageQueueDataContributor.name),
                            roleDefinitionName: CommonRoleDefinitions.storageQueueDataContributor.name
                        }
                    )
                    context.activityChildren?.push(
                        new GenericTreeItem(undefined, {
                            contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                            label: localize('roleAssigned', `Role Assignment ${CommonRoleDefinitions.storageBlobDataOwner.roleName} created for ${storageAccountName}`),
                            iconPath: activitySuccessIcon
                        }),
                        new GenericTreeItem(undefined, {
                            contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                            label: localize('roleAssigned', `Role Assignment ${CommonRoleDefinitions.storageQueueDataContributor.roleName} created for ${storageAccountName}`),
                            iconPath: activitySuccessIcon
                        })
                    );
                } else if (connection.name.includes('DOCUMENTDB')) {
                    const cosmosDbAccountURI = connection.value.split(';')[0].split('=')[1];
                    const cosmosDbAccountName = connection.value.split(';')[0].split('/')[2].split('.')[0];

                    context.convertedConnections?.push({
                        name: `${cosmosDbAccountName}__accountEndpoint`,
                        value: cosmosDbAccountURI,
                        originalValue: connection.name
                    });

                    // TODO: test these roles
                    const scope = await getScopeHelper(context, cosmosDbAccountName, `resourceType eq  'Microsoft.DocumentDB/databaseAccounts'`);
                    context.roles?.push(
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.cosmosDBAccountReader.name),
                            roleDefinitionName: CommonRoleDefinitions.cosmosDBAccountReader.name
                        },
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.documentDBAccountContributor.name),
                            roleDefinitionName: CommonRoleDefinitions.documentDBAccountContributor.name
                        }
                    )

                    context.activityChildren?.push(
                        new GenericTreeItem(undefined, {
                            contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                            label: localize('roleAssigned', `Role Assignment ${CommonRoleDefinitions.cosmosDBAccountReader.roleName} created for ${cosmosDbAccountName}`),
                            iconPath: activitySuccessIcon
                        }),
                        new GenericTreeItem(undefined, {
                            contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                            label: localize('roleAssigned', `Role Assignment ${CommonRoleDefinitions.documentDBAccountContributor.roleName} created for ${cosmosDbAccountName}`),
                            iconPath: activitySuccessIcon
                        })
                    );
                } else if (connection.name.includes('EVENTHUB')) {
                    const eventHubNamespace = connection.value.split(';')[0].split('/')[2].split('.')[0];

                    context.convertedConnections?.push({
                        name: `${eventHubNamespace}__fullyQualifiedNamespace`,
                        value: `${eventHubNamespace}.servicebus.windows.net`,
                        originalValue: connection.name
                    });

                    // TODO: test these roles
                    const scope = await getScopeHelper(context, eventHubNamespace, `resourceType eq  'Microsoft.EventHub/Namespaces'`);
                    context.roles?.push(
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.azureEventHubsDataOwner.name),
                            roleDefinitionName: CommonRoleDefinitions.azureEventHubsDataOwner.name
                        },
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.azureEventHubsDataReceiver.name),
                            roleDefinitionName: CommonRoleDefinitions.azureEventHubsDataReceiver.name
                        }
                    );

                    context.activityChildren?.push(
                        new GenericTreeItem(undefined, {
                            contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                            label: localize('roleAssigned', `Role Assignment ${CommonRoleDefinitions.azureEventHubsDataOwner.roleName} created for ${eventHubNamespace}`),
                            iconPath: activitySuccessIcon
                        }),
                        new GenericTreeItem(undefined, {
                            contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                            label: localize('roleAssigned', `Role Assignment ${CommonRoleDefinitions.azureEventHubsDataReceiver.roleName} created for ${eventHubNamespace}`),
                            iconPath: activitySuccessIcon
                        })
                    );
                } else if (connection.name.includes('SERVICEBUS')) {
                    const serviceBusNamespace = connection.value.split(';')[0].split('/')[2].split('.')[0];

                    context.convertedConnections?.push({
                        name: `${serviceBusNamespace}__fullyQualifiedNamespace`,
                        value: `${serviceBusNamespace}.servicebus.windows.net`,
                        originalValue: connection.name
                    });

                    // TODO: test these roles
                    const scope = await getScopeHelper(context, serviceBusNamespace, `resourceType eq  'Microsoft.ServiceBus/Namespaces'`);
                    context.roles?.push(
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.azureServiceBusDataReceiver.name),
                            roleDefinitionName: CommonRoleDefinitions.azureServiceBusDataReceiver.name
                        },
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.azureServiceBusDataOwner.name),
                            roleDefinitionName: CommonRoleDefinitions.azureServiceBusDataOwner.name
                        }
                    );

                    context.activityChildren?.push(
                        new GenericTreeItem(undefined, {
                            contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                            label: localize('roleAssigned', `Role Assignment ${CommonRoleDefinitions.azureServiceBusDataReceiver.roleName} created for ${serviceBusNamespace}`),
                            iconPath: activitySuccessIcon
                        }),
                        new GenericTreeItem(undefined, {
                            contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                            label: localize('roleAssigned', `Role Assignment ${CommonRoleDefinitions.azureServiceBusDataOwner.roleName} created for ${serviceBusNamespace}`),
                            iconPath: activitySuccessIcon
                        })
                    );
                }
            }

            if (context.local) {
                const localSettings = await AzExtFsExtra.readJSON<ILocalSettingsJson>(nonNullProp(context, 'localSettingsPath'));
                if (localSettings.Values) {
                    for (const connection of context.convertedConnections) {
                        localSettings.Values[connection.name] = connection.value;
                        delete localSettings.Values[nonNullProp(connection, 'originalValue')];
                    }
                    await AzExtFsExtra.writeJSON(nonNullProp(context, 'localSettingsPath'), localSettings);
                }
            } else {
                if (context.functionapp) {
                    const client = await context.functionapp?.site.createClient(context);
                    const remoteSettings = await client.listApplicationSettings();
                    for (const connection of context.convertedConnections) {
                        if (remoteSettings.properties) {
                            remoteSettings.properties[connection.name] = connection.value;
                            delete remoteSettings.properties[nonNullProp(connection, 'originalValue')];
                        } else {
                            await client.updateApplicationSettings({ properties: { [connection.name]: connection.value } });
                        }
                    }
                    await client.updateApplicationSettings({ properties: remoteSettings.properties });
                }
            }
        }
    }

    public shouldExecute(context: IConvertConnectionsContext): boolean {
        return !!context.connections;
    }
}

async function getScopeHelper(context: IConvertConnectionsContext, accountName: string, filter: string): Promise<string> {
    const client = await createResourceClient(context);
    const resources = await uiUtils.listAllIterator(client.resources.list({ filter }));

    for await (const resource of resources) {
        if (resource.name === accountName) {
            return nonNullProp(resource, 'id');
        }
    }

    // If no resource is found default to the subscription scope
    // TODO: see if this is something we should do? Or should we throw an error if the resource is not found?
    return `/subscriptions/${context.subscriptionId}`;
}
