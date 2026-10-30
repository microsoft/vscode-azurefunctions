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
    test('keeps signed-out catalog loading prompt-free', async () => {
        let subscriptionRequestCount = 0;
        const baseline = createBaseline();
        const client = new ConnectorTriggerDataClient(
            async () => {
                subscriptionRequestCount += 1;
                throw new Error('Azure subscriptions must not be requested.');
            },
            async () => assert.fail('An ARM client must not be created.'),
            new BaselineForwardingCatalogProvider(baseline),
            async () => false,
        );

        const result = await client.getCatalog(await createTestActionContext());

        assert.strictEqual(result.source, 'bundled');
        assert.strictEqual(result.liveRefresh, 'notRequested');
        assert.strictEqual(subscriptionRequestCount, 0);
    });

    test('refreshes signed-in snapshot connectors through location APIs in a custom cloud', async () => {
        const requests: string[] = [];
        const context = await createTestActionContext();
        const baseline = createBaseline('AzureUSGovernment', 'US Gov Virginia');
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => createArmClient(requests),
            new BaselineForwardingCatalogProvider(baseline),
            async () => true,
        );

        const result = await client.getCatalog(context);

        assert.strictEqual(result.source, 'live');
        assert.deepStrictEqual(
            result.catalog.connectors.map(connector => connector.id),
            ['office365', 'sharepointonline'],
        );
        assert.deepStrictEqual(
            result.catalog.operations.map(operation => operation.id),
            ['OnNewEmail', 'OnNewFile'],
        );
        assert.strictEqual(
            result.catalog.operations[0].inputDefinitions?.[0].name,
            'folderPath',
        );
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
        assert.ok(requests.some(request =>
            request.includes('/managedApis/office365?') &&
            new URL(request).searchParams.get('api-version') ===
                '2022-09-01-preview' &&
            new URL(request).searchParams.get('export') === 'true',
        ));
        assert.ok(requests.includes(
            'https://management.usgovcloudapi.net/managed-api-page-2',
        ));
        assert.strictEqual(
            context.telemetry.properties.connectorCatalogSwaggerRefresh,
            'Succeeded',
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
                createBaseline('AzureUSGovernment', 'US Gov Virginia'),
            ),
            async () => true,
        );
        const context = await createTestActionContext();

        const staleLoad = client.getCatalog(context);
        while (subscriptionRequestCount === 0) {
            await Promise.resolve();
        }
        client.invalidateSubscriptions();
        const refreshedLoad = client.getCatalog(context);
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
            } else if (url.includes('/managedApis/office365?')) {
                return {
                    paths: {
                        '/emails': {
                            get: {
                                operationId: 'OnNewEmail',
                                parameters: [
                                    {
                                        in: 'query',
                                        name: 'folderPath',
                                        required: true,
                                        type: 'string',
                                        'x-ms-summary': 'Folder',
                                    },
                                ],
                                'x-ms-trigger': 'batch',
                            },
                        },
                    },
                };
            } else if (url.includes('/managedApis/sharepointonline?')) {
                return {
                    paths: {
                        '/files': {
                            get: {
                                operationId: 'OnNewFile',
                                parameters: [],
                                'x-ms-trigger': 'batch',
                            },
                        },
                    },
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
