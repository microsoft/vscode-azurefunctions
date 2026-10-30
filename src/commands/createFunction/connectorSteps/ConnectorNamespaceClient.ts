/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GenericResource } from '@azure/arm-resources';
import {
    AzureConnectorGatewayClient,
    type ConnectorGatewayClientContext,
    type ConnectorGatewayResourcesClient,
    type ConnectorGatewayResourcesClientFactory,
} from './ConnectorGatewayClient';

export type ConnectorNamespaceResourcesClient = ConnectorGatewayResourcesClient;
export type ConnectorNamespaceResourcesClientFactory = ConnectorGatewayResourcesClientFactory;

export interface ConnectorNamespaceClient {
    isNameAvailable(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string): Promise<boolean>;
    create(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, location: string): Promise<GenericResource>;
}

export class AzureConnectorNamespaceClient implements ConnectorNamespaceClient {
    private readonly gatewayClient: AzureConnectorGatewayClient;

    public constructor(resourcesClientFactory?: ConnectorNamespaceResourcesClientFactory) {
        this.gatewayClient = new AzureConnectorGatewayClient(resourcesClientFactory);
    }

    public async isNameAvailable(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string): Promise<boolean> {
        return await this.gatewayClient.isNamespaceNameAvailable(context, resourceGroupName, namespaceName);
    }

    public async create(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, location: string): Promise<GenericResource> {
        const resource = await this.gatewayClient.createNamespace(
            context,
            resourceGroupName,
            namespaceName,
            {
                location,
                properties: {},
                identity: {
                    type: 'SystemAssigned',
                },
            },
        );
        return {
            id: resource.id,
            name: resource.name,
            type: resource.type,
            location: resource.location ?? location,
            tags: resource.tags ? { ...resource.tags } : undefined,
            identity: resource.identity ? {
                type: resource.identity.type,
                principalId: resource.identity.principalId,
                tenantId: resource.identity.tenantId,
                userAssignedIdentities: resource.identity.userAssignedIdentities ?
                    { ...resource.identity.userAssignedIdentities } :
                    undefined,
            } : undefined,
            managedBy: resource.managedBy,
            properties: resource.properties ? { ...resource.properties } : undefined,
        };
    }
}
