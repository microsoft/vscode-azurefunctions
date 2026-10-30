/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtPipelineResponse } from '@microsoft/vscode-azext-azureutils';
import {
    createTestActionContext,
    type ISubscriptionContext,
} from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import {
    type ConnectorGatewayClient,
    type ConnectorGatewayClientContext,
} from '../src/commands/createFunction/connectorSteps/ConnectorGatewayClient';
import {
    type ConnectorConnectionAccessPolicyCreateOrUpdateRequest,
    type ConnectorDynamicInvokeRequest,
    type ConnectorListConsentLinksRequest,
    type ConnectorTriggerConfigCreateOrUpdateRequest,
} from '../src/commands/createFunction/connectorSteps/ConnectorGatewayModels';
import {
    AzureConnectorTriggerGatewayAdapter,
    LiveConnectorSubscriptionResolver,
} from '../src/debug/connectorNamespace/AzureConnectorTriggerF5Adapters';
import {
    getPollingConnectorBindings,
    getPollingConnectorBindingsFromFunctionJson,
    selectPollingConnectorBinding,
} from '../src/debug/connectorNamespace/ConnectorTriggerF5BindingResolver';
import {
    type ConnectorTriggerConnection,
    type ConnectorTriggerConnectionAccessPolicy,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerProjectHandoff,
} from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { createConnectorTriggerF5Dependencies } from '../src/debug/connectorNamespace/createConnectorTriggerF5Dependencies';

const handoff: ConnectorTriggerProjectHandoff = {
    version: 1,
    subscription: {
        id: 'subscription-id',
        tenantId: 'tenant-id',
        environment: {
            name: 'AzureUSGovernment',
            resourceManagerEndpointUrl: 'https://management.usgovcloudapi.net/',
        },
    },
    region: 'eastus',
    connectorId: 'office365',
    operationId: 'OnNewEmailV3',
};

suite('Connector Trigger F5 production adapters', () => {
    test('resolves explicit Poll binding keys and rejects missing or ambiguous metadata', () => {
        const csharp = getPollingConnectorBindings(`
            [Function("OnNewEmail")]
            public void Run(
                [ConnectorTrigger(
                    DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
                    Connection = "Office365Connection",
                    TriggerConfigName = "%OnNewEmailTriggerConfigName%")] string payload) { }
        `);
        const python = getPollingConnectorBindings(`
            @app.function_name(name="OnFlaggedEmail")
            @app.connector_trigger(
                arg_name="emails",
                delivery_mode=func.DeliveryMode.POLL,
                connection="Office365Connection",
                trigger_config_name="%OnFlaggedEmailTriggerConfigName%")
            def run(emails):
                pass
        `);
        const typescript = getPollingConnectorBindings(`
            app.connectorTrigger('OnUpcomingEvent', {
                deliveryMode: 'Poll',
                connection: 'Office365Connection',
                triggerConfigName: '%OnUpcomingEventTriggerConfigName%',
                handler: async () => {}
            });
        `);
        const functionJson = getPollingConnectorBindingsFromFunctionJson({
            bindings: [{
                type: 'connectorTrigger',
                deliveryMode: 'Poll',
                connection: 'Office365Connection',
                triggerConfigName: '%OnNewEmailTriggerConfigName%',
            }],
        }, 'OnNewEmail');

        assert.deepStrictEqual(selectPollingConnectorBinding(
            [...csharp, ...python, ...typescript],
            'OnNewEmailV3',
        ), {
            connectionSettingName: 'Office365Connection',
            triggerConfigSettingName: 'OnNewEmailTriggerConfigName',
        });
        assert.deepStrictEqual(selectPollingConnectorBinding(functionJson, 'OnNewEmailV3'), {
            connectionSettingName: 'Office365Connection',
            triggerConfigSettingName: 'OnNewEmailTriggerConfigName',
        });
        assert.throws(
            () => selectPollingConnectorBinding(
                [...csharp, ...csharp.map(item => ({ ...item, triggerConfigSettingName: 'Other' }))],
                'OnNewEmailV3',
            ),
            /multiple Poll bindings/i,
        );
        assert.throws(
            () => selectPollingConnectorBinding(
                getPollingConnectorBindings(`connectors.office365.onNewEmail('OnNewEmail', { handler });`),
                'OnNewEmailV3',
            ),
            /does not contain explicit Poll binding settings/i,
        );
    });

    test('rehydrates only a compatible live subscription context', async () => {
        const live = createLiveSubscription();
        const resolver = new LiveConnectorSubscriptionResolver(async () => [live]);
        const context = await createTestActionContext();

        const resolved = await resolver.resolve(context, handoff);
        assert.strictEqual(resolved.subscriptionId, live.subscriptionId);
        assert.strictEqual(
            resolved.environment.resourceManagerEndpointUrl,
            live.environment.resourceManagerEndpointUrl,
        );

        await assert.rejects(
            resolver.resolve(context, {
                ...handoff,
                subscription: {
                    ...handoff.subscription,
                    environment: {
                        ...handoff.subscription.environment,
                        resourceManagerEndpointUrl: 'https://attacker.invalid/',
                    },
                },
            }),
            /not available in the current Azure sign-in/i,
        );
    });

    test('creates namespace and connection resources idempotently', async () => {
        const live = createLiveSubscription();
        let namespaceResource: ReturnType<typeof createNamespaceResource> | undefined;
        let connectionResource: ReturnType<typeof createConnectionResource> | undefined;
        let namespaceCreates = 0;
        let connectionCreates = 0;
        let resourceGroupCreates = 0;
        const gatewayClient = {
            getNamespace: async () => namespaceResource,
            createNamespace: async (
                _context: ConnectorGatewayClientContext,
                resourceGroupName: string,
                namespaceName: string,
                request: { location: string; identity?: { type?: string } },
            ) => {
                namespaceCreates += 1;
                assert.strictEqual(resourceGroupName, 'connector-rg');
                assert.strictEqual(request.identity?.type, 'SystemAssigned');
                namespaceResource = createNamespaceResource(namespaceName, resourceGroupName);
                return namespaceResource;
            },
            getConnection: async () => connectionResource,
            createOrUpdateConnection: async (
                _context: ConnectorGatewayClientContext,
                _resourceGroupName: string,
                _namespaceName: string,
                connectionName: string,
                request: { properties: { connectorName: string } },
            ) => {
                connectionCreates += 1;
                assert.strictEqual(request.properties.connectorName, handoff.connectorId);
                connectionResource = createConnectionResource(connectionName);
                return connectionResource;
            },
        } as unknown as ConnectorGatewayClient;
        const adapter = new AzureConnectorTriggerGatewayAdapter(
            gatewayClient,
            new LiveConnectorSubscriptionResolver(async () => [live]),
            async () => ({
                get: async () => {
                    throw Object.assign(new Error('Not found.'), { statusCode: 404 });
                },
                createOrUpdate: async () => {
                    resourceGroupCreates += 1;
                    return { name: 'connector-rg', location: 'eastus' };
                },
            }),
            async () => assert.fail('Swagger is not used by this test.'),
            async () => undefined,
        );
        const context = await createTestActionContext();
        const plan = {
            kind: 'create' as const,
            resourceGroupName: 'connector-rg',
            namespaceName: 'connector-namespace',
        };

        const namespace = await adapter.ensureNamespace(context, handoff, plan);
        await adapter.ensureNamespace(context, handoff, plan);
        const connectionPlan = {
            kind: 'create' as const,
            connectionName: 'connector-connection',
        };
        await adapter.ensureConnection(context, handoff, namespace, connectionPlan);
        await adapter.ensureConnection(context, handoff, namespace, connectionPlan);

        assert.strictEqual(namespaceCreates, 1);
        assert.strictEqual(connectionCreates, 1);
        assert.strictEqual(resourceGroupCreates, 1);
    });

    test('binds consent, policies, Poll Trigger Config fallback, and custom-cloud Swagger', async () => {
        const live = createLiveSubscription();
        const namespace = createNamespace();
        const connection = createConnection();
        let consentRequest: ConnectorListConsentLinksRequest | undefined;
        let dynamicRequest: ConnectorDynamicInvokeRequest | undefined;
        const policyRequests: {
            name: string;
            request: ConnectorConnectionAccessPolicyCreateOrUpdateRequest;
        }[] = [];
        let triggerRequest: ConnectorTriggerConfigCreateOrUpdateRequest | undefined;
        let triggerGets = 0;
        const gatewayClient = {
            listConsentLinks: async (
                _context: ConnectorGatewayClientContext,
                _resourceGroupName: string,
                _namespaceName: string,
                _connectionName: string,
                request: ConnectorListConsentLinksRequest,
            ) => {
                consentRequest = request;
                return [{ link: 'https://login.example.test/consent' }];
            },
            dynamicInvoke: async (
                _context: ConnectorGatewayClientContext,
                _resourceGroupName: string,
                _namespaceName: string,
                _connectionName: string,
                request: ConnectorDynamicInvokeRequest,
            ) => {
                dynamicRequest = request;
                return { response: { statusCode: 200, body: { value: [] } } };
            },
            getConnectionAccessPolicy: async (
                _context: ConnectorGatewayClientContext,
                _resourceGroupName: string,
                _namespaceName: string,
                _connectionName: string,
                policyName: string,
            ) => policyName === 'namespace-trigger-runtime' ? {
                properties: {
                    principal: {
                        type: 'ActiveDirectory',
                        identity: {
                            objectId: 'namespace-principal',
                            tenantId: 'tenant-id',
                        },
                    },
                },
            } : undefined,
            createOrUpdateConnectionAccessPolicy: async (
                _context: ConnectorGatewayClientContext,
                _resourceGroupName: string,
                _namespaceName: string,
                _connectionName: string,
                policyName: string,
                request: ConnectorConnectionAccessPolicyCreateOrUpdateRequest,
            ) => {
                policyRequests.push({ name: policyName, request });
                return { name: policyName, properties: request.properties };
            },
            createOrUpdateTriggerConfig: async (
                _context: ConnectorGatewayClientContext,
                _resourceGroupName: string,
                _namespaceName: string,
                triggerConfigName: string,
                request: ConnectorTriggerConfigCreateOrUpdateRequest,
            ) => {
                triggerRequest = request;
                return {
                    id: `/triggerConfigs/${triggerConfigName}`,
                    name: triggerConfigName,
                    properties: {
                        state: 'Enabled',
                    },
                };
            },
            getTriggerConfig: async () => {
                triggerGets += 1;
                return {
                    id: '/triggerConfigs/on-new-email',
                    name: 'on-new-email',
                    properties: {
                        state: 'Enabled',
                        pollingEndpoints: {
                            receiveUri:
                                'https://example.logic.azure.us/api/connectorGateways/id/triggerConfigs/on-new-email/receive',
                        },
                    },
                };
            },
        } as unknown as ConnectorGatewayClient;
        const swaggerUrls: string[] = [];
        const adapter = new AzureConnectorTriggerGatewayAdapter(
            gatewayClient,
            new LiveConnectorSubscriptionResolver(async () => [live]),
            async () => assert.fail('Resource groups are not used by this test.'),
            async () => ({
                sendRequest: async request => {
                    swaggerUrls.push(request.url);
                    return {
                        status: swaggerUrls.length === 1 ? 404 : 200,
                        parsedBody: swaggerUrls.length === 1 ? undefined : { paths: {} },
                    } as AzExtPipelineResponse;
                },
            }),
            async () => undefined,
        );
        const context = await createTestActionContext();

        assert.strictEqual(
            await adapter.getConsentLink(context, handoff, namespace, connection),
            'https://login.example.test/consent',
        );
        assert.strictEqual(
            consentRequest?.parameters?.[0]?.redirectUrl,
            'https://portal.azure.us',
        );
        await adapter.dynamicInvoke(context, handoff, namespace, connection, {
            request: {
                method: 'GET',
                path: '/folders/secret-parent-id',
                queries: { mailbox: 'secret-mailbox' },
            },
        });
        assert.deepStrictEqual(dynamicRequest, {
            request: {
                method: 'GET',
                path: '/folders/secret-parent-id',
                queries: { mailbox: 'secret-mailbox' },
            },
        });
        assert.ok(context.valuesToMask.includes('/folders/secret-parent-id'));
        assert.ok(context.valuesToMask.includes('secret-mailbox'));

        const policies: ConnectorTriggerConnectionAccessPolicy[] = [
            createPolicy('namespace-trigger-runtime', 'namespace-principal'),
            createPolicy('local-developer', 'developer-object'),
        ];
        await adapter.ensureConnectionAccessPolicies(
            context,
            handoff,
            namespace,
            connection,
            policies,
        );
        assert.deepStrictEqual(policyRequests.map(item => item.name), ['local-developer']);

        const triggerConfig = await adapter.createOrUpdateTriggerConfig(context, {
            handoff,
            namespace,
            connection,
            triggerConfigName: 'on-new-email',
            deliveryMode: 'Poll',
            state: 'Enabled',
            type: 'NotSpecified',
            parameters: [{ name: 'folderPath', value: 'secret-folder-id' }],
        });
        assert.strictEqual(triggerGets, 1);
        assert.strictEqual(triggerConfig.pollingEndpoints.receiveUri.includes('/receive'), true);
        assert.deepStrictEqual(triggerRequest?.properties, {
            state: 'Enabled',
            deliveryMode: 'Poll',
            type: 'NotSpecified',
            connectionDetails: {
                connectorName: 'office365',
                connectionName: 'connection',
            },
            operationName: 'OnNewEmailV3',
            parameters: [{ name: 'folderPath', value: 'secret-folder-id' }],
        });
        assert.ok(context.valuesToMask.includes('secret-folder-id'));

        assert.deepStrictEqual(
            await adapter.getSwagger(context, {
                handoff,
                namespace,
                connection,
            }),
            { paths: {} },
        );
        assert.strictEqual(swaggerUrls.length, 2);
        assert.ok(swaggerUrls.every(url => url.startsWith(
            'https://management.usgovcloudapi.net/',
        )));
        assert.match(swaggerUrls[0], /connectorGateways\/namespace\/managedApis\/office365/i);
        assert.match(swaggerUrls[1], /locations\/eastus\/managedApis\/office365/i);
    });

    test('creates the production dependency composition without clearing handoff state', async () => {
        const dependencies = await createConnectorTriggerF5Dependencies(
            await createTestActionContext(),
            'C:\\project',
        );
        assert.ok(dependencies);
        await dependencies.handoffStore.markComplete('C:\\project');
    });
});

function createLiveSubscription(): ISubscriptionContext {
    return {
        subscriptionId: 'subscription-id',
        subscriptionDisplayName: 'Subscription',
        subscriptionPath: '/subscriptions/subscription-id',
        tenantId: 'tenant-id',
        userId: 'developer-object',
        environment: {
            name: 'AzureUSGovernment',
            resourceManagerEndpointUrl: 'https://management.usgovcloudapi.net/',
            portalUrl: 'https://portal.azure.us/',
        },
        isCustomCloud: true,
    } as unknown as ISubscriptionContext;
}

function createNamespaceResource(name: string, resourceGroupName: string) {
    return {
        id: `/subscriptions/subscription-id/resourceGroups/${resourceGroupName}` +
            `/providers/Microsoft.Web/connectorGateways/${name}`,
        name,
        location: 'eastus',
        identity: {
            principalId: 'namespace-principal',
            tenantId: 'tenant-id',
        },
    };
}

function createNamespace(): ConnectorTriggerNamespace {
    return {
        id: '/subscriptions/subscription-id/resourceGroups/resource-group' +
            '/providers/Microsoft.Web/connectorGateways/namespace',
        name: 'namespace',
        resourceGroupName: 'resource-group',
        location: 'eastus',
        identity: {
            principalId: 'namespace-principal',
            tenantId: 'tenant-id',
        },
    };
}

function createConnectionResource(name: string) {
    return {
        id: `${createNamespace().id}/connections/${name}`,
        name,
        properties: {
            connectorName: handoff.connectorId,
            overallStatus: 'Unauthenticated' as const,
            createdBy: {
                objectId: 'developer-object',
                tenantId: 'tenant-id',
            },
        },
    };
}

function createConnection(): ConnectorTriggerConnection {
    return {
        id: `${createNamespace().id}/connections/connection`,
        name: 'connection',
        connectorId: 'office365',
        status: 'Connected',
        createdBy: {
            objectId: 'developer-object',
            tenantId: 'tenant-id',
        },
    };
}

function createPolicy(
    name: string,
    objectId: string,
): ConnectorTriggerConnectionAccessPolicy {
    return {
        name,
        principal: {
            type: 'ActiveDirectory',
            identity: {
                objectId,
                tenantId: 'tenant-id',
            },
        },
    };
}
