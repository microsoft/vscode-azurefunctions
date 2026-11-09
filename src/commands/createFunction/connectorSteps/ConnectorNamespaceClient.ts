/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GenericResource, type ResourceManagementClient } from '@azure/arm-resources';
import { isRestError } from '@azure/core-rest-pipeline';
import { type AzExtClientContext } from '@microsoft/vscode-azext-azureutils';
import { ConnectorNamespaceApiVersion, ConnectorNamespaceResourceType, webProvider } from '../../../constants';
import { createResourceClient } from '../../../utils/azureClients';

export type ConnectorNamespaceResourcesClient = Pick<ResourceManagementClient['resources'], 'beginCreateOrUpdateAndWait' | 'get'>;
export type ConnectorNamespaceResourcesClientFactory = (context: AzExtClientContext) => Promise<ConnectorNamespaceResourcesClient>;

export interface ConnectorNamespaceClient {
    isNameAvailable(context: AzExtClientContext, resourceGroupName: string, namespaceName: string): Promise<boolean>;
    create(context: AzExtClientContext, resourceGroupName: string, namespaceName: string, location: string): Promise<GenericResource>;
}

export class AzureConnectorNamespaceClient implements ConnectorNamespaceClient {
    private readonly _resourcesClientFactory: ConnectorNamespaceResourcesClientFactory;

    public constructor(resourcesClientFactory: ConnectorNamespaceResourcesClientFactory = async context => (await createResourceClient(context)).resources) {
        this._resourcesClientFactory = resourcesClientFactory;
    }

    public async isNameAvailable(context: AzExtClientContext, resourceGroupName: string, namespaceName: string): Promise<boolean> {
        const client = await this._resourcesClientFactory(context);

        try {
            await client.get(
                resourceGroupName,
                webProvider,
                '',
                ConnectorNamespaceResourceType,
                namespaceName,
                ConnectorNamespaceApiVersion,
            );
            return false;
        } catch (error) {
            if (isRestError(error) && error.statusCode === 404) {
                return true;
            }

            throw error;
        }
    }

    public async create(context: AzExtClientContext, resourceGroupName: string, namespaceName: string, location: string): Promise<GenericResource> {
        const client = await this._resourcesClientFactory(context);
        return await client.beginCreateOrUpdateAndWait(
            resourceGroupName,
            webProvider,
            '',
            ConnectorNamespaceResourceType,
            namespaceName,
            ConnectorNamespaceApiVersion,
            {
                location,
                properties: {},
                identity: {
                    type: 'SystemAssigned',
                },
            },
            {
                requestOptions: {
                    customHeaders: {
                        'If-None-Match': '*',
                    },
                },
                updateIntervalInMs: 3000,
            },
        );
    }
}
