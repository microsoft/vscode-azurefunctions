/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GenericResource } from '@azure/arm-resources';
import { createHttpHeaders, type PipelineRequest } from '@azure/core-rest-pipeline';
import { type AzExtPipelineResponse } from '@microsoft/vscode-azext-azureutils';
import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { ConnectorNamespaceApiVersion, ConnectorNamespaceResourceType, webProvider } from '../../src/constants';
import {
    AzureConnectorGatewayClient,
    type ConnectorGatewayArmClient,
    type ConnectorGatewayClientContext,
    type ConnectorGatewayResourcesClient,
} from '../../src/commands/createFunction/connectorSteps/ConnectorGatewayClient';

suite('Connector Gateway client', () => {
    test('uses custom-cloud paging and SDK LRO creation for namespaces', async () => {
        const requests: PipelineRequest[] = [];
        const armClient = createArmClient(requests, request => {
            if (request.url.includes('/page-2')) {
                return {
                    value: [{
                        id: '/subscriptions/sub-one/resourceGroups/rg-two/providers/Microsoft.Web/connectorGateways/second',
                        name: 'second',
                        location: 'usgovvirginia',
                    }],
                };
            }

            return {
                nextLink: '/subscriptions/sub-one/providers/Microsoft.Web/connectorGateways/page-2?api-version=2026-05-01-preview',
                value: [{
                    id: '/subscriptions/sub-one/resourceGroups/rg-one/providers/Microsoft.Web/connectorGateways/first',
                    name: 'first',
                    location: 'usgovvirginia',
                }],
            };
        });
        let createArguments: unknown[] | undefined;
        const createdResource: GenericResource = {
            id: '/subscriptions/sub-one/resourceGroups/rg-one/providers/Microsoft.Web/connectorGateways/created',
            name: 'created',
            location: 'usgovvirginia',
            identity: {
                type: 'SystemAssigned',
                principalId: 'namespace-principal',
                tenantId: 'tenant-one',
            },
            properties: {
                provisioningState: 'Succeeded',
            },
        };
        const resourcesClient = {
            get: async () => assert.fail('Namespace list and create must not call get.'),
            beginCreateOrUpdateAndWait: async (...args: unknown[]) => {
                createArguments = args;
                return createdResource;
            },
        } as unknown as ConnectorGatewayResourcesClient;
        const client = new AzureConnectorGatewayClient(
            async () => resourcesClient,
            async () => armClient,
        );
        const context = await createContext();

        const namespaces = await client.listNamespaces(context);
        const created = await client.createNamespace(context, 'rg-one', 'created', {
            location: 'usgovvirginia',
            identity: {
                type: 'SystemAssigned',
            },
            properties: {},
        });

        assert.deepStrictEqual(namespaces.map(namespace => namespace.name), ['first', 'second']);
        assert.ok(requests.every(request => request.url.startsWith('https://management.usgovcloudapi.net/')));
        assert.strictEqual(new URL(requests[0].url).searchParams.get('api-version'), ConnectorNamespaceApiVersion);
        assert.strictEqual(created.identity?.principalId, 'namespace-principal');
        assert.strictEqual(created.identity?.tenantId, 'tenant-one');
        assert.deepStrictEqual(createArguments, [
            'rg-one',
            webProvider,
            '',
            ConnectorNamespaceResourceType,
            'created',
            ConnectorNamespaceApiVersion,
            {
                location: 'usgovvirginia',
                identity: {
                    type: 'SystemAssigned',
                },
                properties: {},
            },
            {
                requestOptions: {
                    customHeaders: {
                        'If-None-Match': '*',
                    },
                },
                updateIntervalInMs: 3000,
            },
        ]);
    });

    test('does not follow cross-origin paging links', async () => {
        const requests: PipelineRequest[] = [];
        const armClient = createArmClient(requests, () => ({
            nextLink: 'https://example.test/credential-leak',
            value: [],
        }));
        const client = new AzureConnectorGatewayClient(
            async () => assert.fail('Namespace list must not create a resources client.'),
            async () => armClient,
        );

        await assert.rejects(
            client.listNamespaces(await createContext()),
            /invalid paging host/i,
        );
        assert.strictEqual(requests.length, 1);
    });
});

async function createContext(): Promise<ConnectorGatewayClientContext> {
    return Object.assign(await createTestActionContext(), {
        environment: {
            name: 'AzureUSGovernment',
            resourceManagerEndpointUrl: 'https://management.usgovcloudapi.net/',
        },
        subscriptionDisplayName: 'Subscription One',
        subscriptionId: 'sub-one',
        tenantId: 'tenant-one',
    }) as unknown as ConnectorGatewayClientContext;
}

function createArmClient(
    requests: PipelineRequest[],
    getBody: (request: PipelineRequest) => unknown,
    getStatus: (request: PipelineRequest) => number = () => 200,
): ConnectorGatewayArmClient {
    return {
        async sendRequest(request: PipelineRequest): Promise<AzExtPipelineResponse> {
            requests.push(request);
            return {
                headers: createHttpHeaders(),
                parsedBody: getBody(request),
                request,
                status: getStatus(request),
            };
        },
    };
}
