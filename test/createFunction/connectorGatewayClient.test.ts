/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GenericResource } from '@azure/arm-resources';
import { createHttpHeaders, type PipelineRequest } from '@azure/core-rest-pipeline';
import { type AzExtPipelineResponse } from '@microsoft/vscode-azext-azureutils';
import { createTestActionContext, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { CancellationTokenSource } from 'vscode';
import { ConnectorNamespaceApiVersion, ConnectorNamespaceResourceType, webProvider } from '../../src/constants';
import {
    AzureConnectorGatewayClient,
    type ConnectorGatewayArmClient,
    type ConnectorGatewayClientContext,
    type ConnectorGatewayResourcesClient,
} from '../../src/commands/createFunction/connectorSteps/ConnectorGatewayClient';
import { type ConnectorTriggerConfigCreateOrUpdateRequest } from '../../src/commands/createFunction/connectorSteps/ConnectorGatewayModels';

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

    test('supports connection, consent, status, and access-policy operations', async () => {
        const requests: PipelineRequest[] = [];
        let consentRequestCount = 0;
        const armClient = createArmClient(requests, request => {
            const body = getRequestBody(request);
            if (request.method === 'PUT' && request.url.includes('/accessPolicies/')) {
                return body;
            } else if (request.method === 'GET' && request.url.endsWith('/accessPolicies?api-version=2026-05-01-preview')) {
                return {
                    value: [{
                        name: 'developer',
                        properties: {
                            principal: {
                                type: 'ActiveDirectory',
                                identity: {
                                    objectId: 'developer-object',
                                    tenantId: 'tenant-one',
                                },
                            },
                        },
                    }],
                };
            } else if (request.method === 'GET' && request.url.includes('/accessPolicies/developer')) {
                return {
                    name: 'developer',
                    properties: {
                        principal: {
                            type: 'ActiveDirectory',
                            identity: {
                                objectId: 'developer-object',
                                tenantId: 'tenant-one',
                            },
                        },
                    },
                };
            } else if (request.method === 'POST' && request.url.includes('/listConsentLinks')) {
                consentRequestCount += 1;
                return consentRequestCount === 1 ? {
                    value: [{
                        link: 'https://login.example/consent',
                    }],
                } : {
                    link: 'https://login.example/legacy-consent',
                };
            } else if (request.method === 'POST' && request.url.includes('/confirmConsentCode')) {
                return {
                    status: 'Connected',
                };
            } else if (request.method === 'PUT') {
                return {
                    ...asRecord(body),
                    name: 'office-connection',
                };
            } else if (request.method === 'GET' && request.url.includes('/connections/office-connection')) {
                return {
                    name: 'office-connection',
                    properties: {
                        connectorName: 'office365',
                        createdBy: {
                            objectId: 'developer-object',
                            tenantId: 'tenant-one',
                        },
                        statuses: [{
                            status: 'Unauthenticated',
                        }],
                    },
                };
            }

            return {
                value: [{
                    name: 'office-connection',
                    properties: {
                        connectorName: 'office365',
                    },
                }],
            };
        });
        const client = new AzureConnectorGatewayClient(
            async () => assert.fail('Connection operations must not create a resources client.'),
            async () => armClient,
        );
        const context = await createContext();

        const connections = await client.listConnections(context, 'rg-one', 'gateway-one');
        const created = await client.createOrUpdateConnection(
            context,
            'rg-one',
            'gateway-one',
            'office-connection',
            {
                properties: {
                    connectorName: 'office365',
                },
            },
        );
        const connection = await client.getConnection(context, 'rg-one', 'gateway-one', 'office-connection');
        const status = await client.getConnectionStatus(context, 'rg-one', 'gateway-one', 'office-connection');
        const links = await client.listConsentLinks(
            context,
            'rg-one',
            'gateway-one',
            'office-connection',
            {
                parameters: [{
                    parameterName: 'token',
                    redirectUrl: 'https://portal.azure.com',
                }],
            },
        );
        const legacyLinks = await client.listConsentLinks(
            context,
            'rg-one',
            'gateway-one',
            'office-connection',
            {
                parameters: [{
                    parameterName: 'token',
                    redirectUrl: 'https://portal.azure.com',
                }],
            },
        );
        const confirmation = await client.confirmConsentCode(
            context,
            'rg-one',
            'gateway-one',
            'office-connection',
            {
                code: 'consent-code',
                objectId: 'developer-object',
                tenantId: 'tenant-one',
            },
        );
        const accessPolicies = await client.listConnectionAccessPolicies(context, 'rg-one', 'gateway-one', 'office-connection');
        const accessPolicy = await client.getConnectionAccessPolicy(context, 'rg-one', 'gateway-one', 'office-connection', 'developer');
        const updatedAccessPolicy = await client.createOrUpdateConnectionAccessPolicy(
            context,
            'rg-one',
            'gateway-one',
            'office-connection',
            'developer',
            {
                properties: {
                    principal: {
                        type: 'ActiveDirectory',
                        identity: {
                            objectId: 'developer-object',
                            tenantId: 'tenant-one',
                        },
                    },
                },
            },
        );

        assert.strictEqual(connections[0].name, 'office-connection');
        assert.strictEqual(created.properties?.connectorName, 'office365');
        assert.strictEqual(connection?.properties?.createdBy?.objectId, 'developer-object');
        assert.strictEqual(status?.status, 'Unauthenticated');
        assert.strictEqual(links[0].link, 'https://login.example/consent');
        assert.strictEqual(legacyLinks[0].link, 'https://login.example/legacy-consent');
        assert.strictEqual(confirmation.status, 'Connected');
        assert.strictEqual(accessPolicies[0].name, 'developer');
        assert.strictEqual(accessPolicy?.properties?.principal?.identity?.tenantId, 'tenant-one');
        assert.strictEqual(updatedAccessPolicy.properties?.principal?.identity?.objectId, 'developer-object');
        assert.ok(context.valuesToMask.includes('consent-code'));
        assert.ok(context.valuesToMask.includes('developer-object'));
        assert.ok(context.valuesToMask.includes('https://login.example/consent'));
        assert.ok(context.valuesToMask.includes('https://login.example/legacy-consent'));
        assert.ok(requests.filter(request => request.method !== 'GET').every(request =>
            request.headers.get('Content-Type') === 'application/json',
        ));
    });

    test('surfaces dynamicInvoke upstream failures without exposing response data', async () => {
        const requests: PipelineRequest[] = [];
        let shouldFail = true;
        const armClient = createArmClient(requests, () => shouldFail ? {
            response: {
                statusCode: 'BadRequest',
                body: {
                    error: {
                        code: 'InvalidDynamicRequest',
                        message: 'secret connector response',
                    },
                },
            },
        } : {
            response: {
                statusCode: 200,
                body: {
                    value: ['Inbox'],
                },
            },
        });
        const client = new AzureConnectorGatewayClient(
            async () => assert.fail('Dynamic invoke must not create a resources client.'),
            async () => armClient,
        );
        const context = await createContext();
        const request = {
            request: {
                method: 'GET' as const,
                path: '/dynamicInvoke/GetFolders',
                queries: {
                    source: 'mailbox',
                },
            },
        };

        await assert.rejects(
            client.dynamicInvoke(context, 'rg-one', 'gateway-one', 'office-connection', request),
            error => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /HTTP 400/);
                assert.doesNotMatch(error.message, /InvalidDynamicRequest/);
                assert.doesNotMatch(error.message, /secret connector response/);
                return true;
            },
        );

        shouldFail = false;
        const result = await client.dynamicInvoke(context, 'rg-one', 'gateway-one', 'office-connection', request);

        assert.deepStrictEqual(result.response?.body, { value: ['Inbox'] });
        assert.deepStrictEqual(getRequestBody(requests[0]), request);
    });

    test('supports Poll Trigger Config payloads and masks returned polling endpoints', async () => {
        const requests: PipelineRequest[] = [];
        const pollingEndpoints = {
            receiveUri: 'https://gateway.example/api/triggerconfigs/mail/receive',
            acknowledgeUri: 'https://gateway.example/api/triggerconfigs/mail/acknowledge',
            hasMessagesUri: 'https://gateway.example/api/triggerconfigs/mail/hasMessages',
            approximateQueueDepthUri: 'https://gateway.example/api/triggerconfigs/mail/approximateQueueDepth',
        };
        const armClient = createArmClient(requests, request => {
            if (request.method === 'DELETE') {
                return undefined;
            } else if (request.method === 'GET') {
                return {
                    error: {
                        code: 'NotFound',
                    },
                };
            }

            return {
                ...asRecord(getRequestBody(request)),
                name: 'mail-trigger',
                properties: {
                    ...(getRequestBody(request) as ConnectorTriggerConfigCreateOrUpdateRequest).properties,
                    pollingEndpoints,
                },
            };
        }, request => request.method === 'GET' ? 404 : request.method === 'DELETE' ? 204 : 201);
        const client = new AzureConnectorGatewayClient(
            async () => assert.fail('Trigger Config operations must not create a resources client.'),
            async () => armClient,
        );
        const context = await createContext();
        const request: ConnectorTriggerConfigCreateOrUpdateRequest = {
            properties: {
                connectionDetails: {
                    connectionName: 'office-connection',
                    connectorName: 'office365',
                },
                deliveryMode: 'Poll',
                operationName: 'OnNewEmailV3',
                parameters: [{
                    name: 'folderPath',
                    value: 'Inbox',
                }],
                state: 'Enabled',
                type: 'NotSpecified',
            },
        };

        assert.strictEqual(
            await client.isTriggerConfigNameAvailable(context, 'rg-one', 'gateway-one', 'mail-trigger'),
            true,
        );
        const triggerConfig = await client.createOrUpdateTriggerConfig(
            context,
            'rg-one',
            'gateway-one',
            'mail-trigger',
            request,
        );
        await client.deleteTriggerConfig(context, 'rg-one', 'gateway-one', 'mail-trigger');

        assert.strictEqual(triggerConfig.properties?.deliveryMode, 'Poll');
        assert.deepStrictEqual(triggerConfig.properties?.pollingEndpoints, pollingEndpoints);
        assert.deepStrictEqual(getRequestBody(requests[1]), request);
        assert.strictEqual(
            asRecord(asRecord(getRequestBody(requests[1])).properties).pollingEndpoints,
            undefined,
        );
        assert.ok(Object.values(pollingEndpoints).every(endpoint => context.valuesToMask.includes(endpoint)));
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

    test('cancels before creating an ARM client', async () => {
        let clientCreated = false;
        const client = new AzureConnectorGatewayClient(
            async () => assert.fail('Connection list must not create a resources client.'),
            async () => {
                clientCreated = true;
                return createArmClient([], () => ({ value: [] }));
            },
        );
        const cancellation = new CancellationTokenSource();
        cancellation.cancel();

        await assert.rejects(
            client.listConnections(
                await createContext(),
                'rg-one',
                'gateway-one',
                { cancellationToken: cancellation.token },
            ),
            UserCancelledError,
        );
        assert.strictEqual(clientCreated, false);
        cancellation.dispose();
    });

    test('aborts an in-flight ARM request when cancelled', async () => {
        let requestStarted: (() => void) | undefined;
        const started = new Promise<void>(resolve => {
            requestStarted = resolve;
        });
        const armClient: ConnectorGatewayArmClient = {
            async sendRequest(request: PipelineRequest): Promise<AzExtPipelineResponse> {
                requestStarted?.();
                return await new Promise<AzExtPipelineResponse>((_resolve, reject) => {
                    request.abortSignal?.addEventListener('abort', () => reject(new Error('Request aborted.')));
                });
            },
        };
        const client = new AzureConnectorGatewayClient(
            async () => assert.fail('Connection list must not create a resources client.'),
            async () => armClient,
        );
        const cancellation = new CancellationTokenSource();
        const operation = client.listConnections(
            await createContext(),
            'rg-one',
            'gateway-one',
            { cancellationToken: cancellation.token },
        );

        await started;
        cancellation.cancel();

        await assert.rejects(operation, UserCancelledError);
        cancellation.dispose();
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

function getRequestBody(request: PipelineRequest): unknown {
    return request.body === undefined ? undefined : JSON.parse(String(request.body));
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}
