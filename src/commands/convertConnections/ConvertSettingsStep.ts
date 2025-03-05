/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { createResourceClient } from "@microsoft/vscode-azext-azureappservice";
import { CommonRoleDefinitions, createRoleId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { activitySuccessContext, activitySuccessIcon, AzExtFsExtra, AzureWizardExecuteStep, createUniversallyUniqueContextValue, GenericTreeItem, nonNullProp } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { type ILocalSettingsJson } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { getLocalSettingsFile } from "../appSettings/localSettings/getLocalSettingsFile";
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
                    context.convertedConnections?.push(
                        {
                            name: 'AzureWebJobsStorage__blobServiceUri',
                            value: storageAccountName,
                            originalValue: connection.name
                        },
                        {
                            name: 'AzureWebJobsStorage__queueServiceUri',
                            value: storageAccountName,
                            originalValue: connection.name
                        },
                        {
                            name: 'AzureWebJobsStorage__tableServiceUri',
                            value: storageAccountName,
                            originalValue: connection.name
                        }
                    );
                    context.roles?.push({
                        scopeId: await getScopeHelper(context, storageAccountName, `resourceType eq 'Microsoft.Storage/storageAccounts'`),
                        roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.storageBlobDataOwner),
                        roleDefinitionName: CommonRoleDefinitions.storageBlobDataOwner.roleName
                    });
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

                    const scope = await getScopeHelper(context, storageAccountName, `resourceType eq 'Microsoft.Storage/storageAccounts'`)
                    context.roles?.push(
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.storageBlobDataOwner),
                            roleDefinitionName: CommonRoleDefinitions.storageBlobDataOwner.roleName
                        },
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.storageQueueDataContributor),
                            roleDefinitionName: CommonRoleDefinitions.storageQueueDataContributor.roleName
                        }
                    );
                } else if (connection.name.includes('DOCUMENTDB')) {
                    const cosmosDbAccountURI = connection.value.split(';')[0].split('=')[1];
                    const cosmosDbAccountName = connection.value.split(';')[0].split('/')[2].split('.')[0];

                    context.convertedConnections?.push({
                        name: `${cosmosDbAccountName}__accountEndpoint`,
                        value: cosmosDbAccountURI,
                        originalValue: connection.name
                    });

                    const scope = await getScopeHelper(context, cosmosDbAccountName, `resourceType eq  'Microsoft.DocumentDB/databaseAccounts'`);
                    context.roles?.push(
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.cosmosDBAccountReader),
                            roleDefinitionName: CommonRoleDefinitions.cosmosDBAccountReader.roleName
                        },
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.documentDBAccountContributor),
                            roleDefinitionName: CommonRoleDefinitions.documentDBAccountContributor.roleName
                        }
                    );
                } else if (connection.name.includes('EVENTHUB')) {
                    const eventHubNamespace = connection.value.split(';')[0].split('/')[2].split('.')[0];

                    context.convertedConnections?.push({
                        name: `${eventHubNamespace}__fullyQualifiedNamespace`,
                        value: `${eventHubNamespace}.servicebus.windows.net`,
                        originalValue: connection.name
                    });

                    const scope = await getScopeHelper(context, eventHubNamespace, `resourceType eq  'Microsoft.EventHub/Namespaces'`);
                    context.roles?.push(
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.azureEventHubsDataOwner),
                            roleDefinitionName: CommonRoleDefinitions.azureEventHubsDataOwner.roleName
                        },
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.azureEventHubsDataReceiver),
                            roleDefinitionName: CommonRoleDefinitions.azureEventHubsDataReceiver.roleName
                        }
                    );
                } else if (connection.name.includes('SERVICEBUS')) {
                    const serviceBusNamespace = connection.value.split(';')[0].split('/')[2].split('.')[0];

                    context.convertedConnections?.push({
                        name: 'ServiceBusConnection__fullyQualifiedNamespace',
                        value: `${serviceBusNamespace}.servicebus.windows.net`,
                        originalValue: connection.name
                    });

                    const scope = await getScopeHelper(context, serviceBusNamespace, `resourceType eq  'Microsoft.ServiceBus/Namespaces'`);
                    context.roles?.push(
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.azureServiceBusDataReceiver),
                            roleDefinitionName: CommonRoleDefinitions.azureServiceBusDataReceiver.roleName
                        },
                        {
                            scopeId: scope,
                            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.azureServiceBusDataOwner),
                            roleDefinitionName: CommonRoleDefinitions.azureServiceBusDataOwner.roleName
                        }
                    );
                }
            }

            if (!context.localSettingsPath) {
                const message: string = localize('selectLocalSettings', 'Select the local settings to convert.');
                context.localSettingsPath = await getLocalSettingsFile(context, message);
            }

            if (context.local) {
                const localSettings = await AzExtFsExtra.readJSON<ILocalSettingsJson>(nonNullProp(context, 'localSettingsPath'));
                if (localSettings.Values) {
                    for (const connection of context.convertedConnections) {
                        localSettings.Values[connection.name] = connection.value;
                        if (localSettings.Values[nonNullProp(connection, 'originalValue')]) {
                            delete localSettings.Values[nonNullProp(connection, 'originalValue')];
                            context.activityChildren?.push(
                                new GenericTreeItem(undefined, {
                                    contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                                    label: localize('deletedSetting', `Delete local setting "${connection.originalValue}"`),
                                    iconPath: activitySuccessIcon
                                })
                            )
                        }
                        context.activityChildren?.push(
                            new GenericTreeItem(undefined, {
                                contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                                label: localize('addedSetting', `Add Local setting "${connection.name}"`),
                                iconPath: activitySuccessIcon
                            })
                        );
                    }
                    await AzExtFsExtra.writeJSON(nonNullProp(context, 'localSettingsPath'), localSettings);
                    await ext.rgApi.workspaceResourceTree.refresh(context);
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
                        context.activityChildren?.push(
                            new GenericTreeItem(undefined, {
                                contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                                label: localize('deletedSetting', `Delete app setting "${connection.originalValue}"`),
                                iconPath: activitySuccessIcon
                            }),
                            new GenericTreeItem(undefined, {
                                contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                                label: localize('addedSetting', `Add app setting "${connection.name}" `),
                                iconPath: activitySuccessIcon
                            })
                        );
                    }
                    //may need to add settings to include the clientId and configuration properties
                    await client.updateApplicationSettings({ properties: remoteSettings.properties });
                    await ext.rgApi.tree.refresh(context);
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

    throw new Error(localize('noResourceFound', `No resource found with name "${accountName}" in subscription "${context.subscriptionDisplayName}"`));
}
