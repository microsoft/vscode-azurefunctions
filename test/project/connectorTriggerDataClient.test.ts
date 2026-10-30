/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    createTestActionContext,
    type IActionContext,
    type ISubscriptionContext,
} from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import {
    ConnectorTriggerDataClient,
    type ConnectorArmClient,
    type ConnectorTriggerAzureContext,
    type ConnectorSubscription,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient';
import {
    type ConnectorCatalogBaseline,
    type ConnectorCatalogLiveLoader,
    type ConnectorTriggerCatalog,
    type ConnectorTriggerCatalogResult,
    type IConnectorTriggerCatalogProvider,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerCatalogProvider';

suite('Connector trigger data client', () => {
    test('keeps public catalog loading prompt-free without selected Azure context', async () => {
        let subscriptionRequestCount = 0;
        const baseline = createBaseline();
        const client = new ConnectorTriggerDataClient(
            async () => {
                subscriptionRequestCount += 1;
                throw new Error('Azure subscriptions must not be requested.');
            },
            async () => assert.fail('An ARM client must not be created.'),
            new BaselineForwardingCatalogProvider(baseline),
        );

        const result = await client.getCatalog(await createTestActionContext());

        assert.strictEqual(result.source, 'bundled');
        assert.strictEqual(result.liveRefresh, 'notRequested');
        assert.strictEqual(subscriptionRequestCount, 0);
    });

    test('refreshes the selected region through location APIs in a custom cloud', async () => {
        const requests: string[] = [];
        const context = await createTestActionContext();
        const baseline = createBaseline();
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => createArmClient(requests),
            new BaselineForwardingCatalogProvider(baseline),
        );

        const result = await client.getCatalog(context, createAzureContext());

        assert.strictEqual(result.source, 'live');
        assert.deepStrictEqual(
            result.catalog.connectors.map(connector => connector.id),
            ['office365', 'sharepointonline'],
        );
        assert.deepStrictEqual(
            result.catalog.operations.map(operation => operation.id),
            ['OnNewEmail', 'OnNewFile'],
        );
        assert.strictEqual(result.catalog.operations[0].inputDefinitions, undefined);
        assert.ok(requests.every(request =>
            request.startsWith('https://management.usgovcloudapi.net/'),
        ));
        assert.ok(requests.some(request =>
            request.includes('/locations/usgovvirginia/managedApis?') &&
            new URL(request).searchParams.get('api-version') === '2016-06-01',
        ));
        assert.ok(requests.some(request =>
            request.includes('/managedApis/office365/apiOperations?') &&
            new URL(request).searchParams.get('api-version') === '2016-06-01',
        ));
        assert.ok(!requests.some(request =>
            new URL(request).searchParams.get('export') === 'true',
        ));
        assert.ok(requests.includes(
            'https://management.usgovcloudapi.net/managed-api-page-2',
        ));
        assert.strictEqual(
            context.telemetry.properties.connectorCatalogSwaggerRefresh,
            undefined,
        );
    });

    test('invalidates in-flight subscriptions when the signed-in account changes', async () => {
        let subscriptionRequestCount = 0;
        let resolveFirstRequest: ((value: ConnectorSubscription[]) => void) | undefined;
        const firstRequest = new Promise<ConnectorSubscription[]>(resolve => {
            resolveFirstRequest = resolve;
        });
        const client = new ConnectorTriggerDataClient(
            async () => {
                subscriptionRequestCount += 1;
                return subscriptionRequestCount === 1 ?
                    await firstRequest :
                    [createSubscription()];
            },
            async () => createArmClient([]),
            new BaselineForwardingCatalogProvider(
                createBaseline(),
            ),
        );
        const context = await createTestActionContext();
        const azureContext = createAzureContext();

        const staleLoad = client.getCatalog(context, azureContext);
        while (subscriptionRequestCount === 0) {
            await Promise.resolve();
        }
        client.invalidateSubscriptions();
        const refreshedLoad = client.getCatalog(context, azureContext);
        resolveFirstRequest?.([createSubscription(
            'AzureCloud',
            'https://management.azure.com/',
        )]);

        const [staleResult, refreshedResult] = await Promise.all([
            staleLoad,
            refreshedLoad,
        ]);
        assert.strictEqual(subscriptionRequestCount, 2);
        assert.strictEqual(staleResult.source, 'live');
        assert.strictEqual(refreshedResult.source, 'live');
    });
});

class BaselineForwardingCatalogProvider implements IConnectorTriggerCatalogProvider {
    public constructor(private readonly baseline: ConnectorCatalogBaseline) { }

    public async getCatalog(
        _context: IActionContext,
        liveLoader?: ConnectorCatalogLiveLoader,
    ): Promise<ConnectorTriggerCatalogResult> {
        const liveCatalog = await liveLoader?.(this.baseline);
        return liveCatalog ?
            createCatalogResult(liveCatalog, 'live') :
            createCatalogResult(this.baseline.catalog, 'bundled');
    }
}

function createArmClient(requests: string[]): ConnectorArmClient {
    return {
        async get(url: string): Promise<unknown> {
            requests.push(url);
            if (url === 'https://management.usgovcloudapi.net/managed-api-page-2') {
                return {
                    value: [
                        {
                            name: 'sharepointonline',
                            properties: {
                                displayName: 'SharePoint',
                            },
                        },
                    ],
                };
            } else if (url.includes('/managedApis/office365/apiOperations?')) {
                return {
                    value: [
                        {
                            name: 'OnNewEmail',
                            properties: {
                                isNotification: true,
                                isTrigger: true,
                                summary: 'When an email arrives',
                            },
                        },
                        {
                            name: 'SendEmail',
                            properties: {
                                isTrigger: false,
                                summary: 'Send an email',
                            },
                        },
                    ],
                };
            } else if (url.includes('/managedApis/sharepointonline/apiOperations?')) {
                return {
                    value: [
                        {
                            name: 'OnNewFile',
                            properties: {
                                operationRole: 'Trigger',
                                summary: 'When a file is created',
                            },
                        },
                    ],
                };
            } else if (url.includes('/locations/usgovvirginia/managedApis?')) {
                return {
                    nextLink: 'https://management.usgovcloudapi.net/managed-api-page-2',
                    value: [
                        {
                            name: 'office365',
                            properties: {
                                displayName: 'Office 365 Outlook',
                            },
                        },
                    ],
                };
            }

            assert.fail(`Unexpected URL: ${url}`);
        },
    };
}

function createSubscription(
    environmentName = 'AzureUSGovernment',
    resourceManagerEndpointUrl = 'https://management.usgovcloudapi.net/',
): ConnectorSubscription {
    const context = {
        environment: {
            name: environmentName,
            resourceManagerEndpointUrl,
        },
        subscriptionDisplayName: 'Subscription One',
        subscriptionId: 'sub-one',
    } as ISubscriptionContext;
    return {
        context,
        subscriptionDisplayName: context.subscriptionDisplayName,
        subscriptionId: context.subscriptionId,
    };
}

function createAzureContext(): ConnectorTriggerAzureContext {
    return {
        subscriptionId: 'sub-one',
        subscriptionName: 'Subscription One',
        region: 'US Gov Virginia',
        regionDisplayName: 'US Gov Virginia',
    };
}

function createBaseline(
    cloud = 'AzureCloud',
    region = 'westcentralus',
): ConnectorCatalogBaseline {
    return {
        catalog: {
            connectors: [
                {
                    id: 'office365',
                    label: 'Office 365 Outlook',
                },
                {
                    id: 'sharepointonline',
                    label: 'SharePoint',
                },
            ],
            operations: [
                {
                    connectorId: 'office365',
                    id: 'OnNewEmail',
                    isNotification: true,
                    isWebhook: false,
                    label: 'When an email arrives',
                },
                {
                    connectorId: 'sharepointonline',
                    id: 'OnNewFile',
                    isNotification: false,
                    isWebhook: false,
                    label: 'When a file is created',
                },
            ],
        },
        snapshotSource: {
            catalogApiVersion: '2016-06-01',
            cloud,
            kind: 'azure-managed-connectors',
            operationsApiVersion: '2016-06-01',
            region,
            swaggerApiVersion: '2022-09-01-preview',
        },
    };
}

function createCatalogResult(
    catalog: ConnectorTriggerCatalog,
    source: 'bundled' | 'live',
): ConnectorTriggerCatalogResult {
    return {
        catalog,
        errors: [],
        liveRefresh: source === 'live' ? 'succeeded' : 'notRequested',
        source,
    };
}
