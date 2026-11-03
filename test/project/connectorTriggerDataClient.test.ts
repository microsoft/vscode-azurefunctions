/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtLocation } from '@microsoft/vscode-azext-azureutils';
import {
    createTestActionContext,
    type ISubscriptionContext,
} from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    ConnectorTriggerDataClient,
    type ConnectorArmClient,
    type ConnectorSubscription,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient';
import { cpUtils } from '../../src/utils/cpUtils';
import { envUtils } from '../../src/utils/envUtils';

const liveCatalogTestsEnabled = envUtils.isEnvironmentVariableSet(
    process.env.AZFUNC_TEST_LIVE_CONNECTOR_CATALOG,
);

suite('Connector trigger data client', () => {
    test('uses filtered subscriptions by default and loads all on request', async () => {
        const filters: boolean[] = [];
        const client = new ConnectorTriggerDataClient(
            async filter => {
                filters.push(filter);
                return filter ?
                    [createSubscription()] :
                    [
                        createSubscription(),
                        createSubscription('sub-two', 'Subscription Two'),
                    ];
            },
            async () => assert.fail('An ARM client must not be created.'),
        );

        assert.deepStrictEqual(await client.listSubscriptions(), [{
            id: 'sub-one',
            label: 'Subscription One',
        }]);
        assert.deepStrictEqual(await client.listSubscriptions(true), [
            { id: 'sub-one', label: 'Subscription One' },
            { id: 'sub-two', label: 'Subscription Two' },
        ]);
        assert.deepStrictEqual(filters, [true, false]);
    });

    test('lists subscriptions and Connector Namespace-supported regions', async () => {
        const locationContexts: ISubscriptionContext[] = [];
        const client = new ConnectorTriggerDataClient(
            async () => [
                createSubscription(
                    'sub-two',
                    'Subscription Two',
                    'AzureCloud',
                    'https://management.azure.com/',
                ),
                createSubscription(),
            ],
            async () => assert.fail('An ARM client must not be created.'),
            async context => {
                locationContexts.push(context);
                return [
                    createLocation('usgovvirginia', 'US Gov Virginia'),
                    createLocation('usgovarizona', 'US Gov Arizona'),
                ];
            },
        );

        assert.deepStrictEqual(await client.listSubscriptions(), [
            { id: 'sub-one', label: 'Subscription One' },
            { id: 'sub-two', label: 'Subscription Two' },
        ]);
        assert.deepStrictEqual(
            await client.listLocations(
                await createTestActionContext(),
                'sub-one',
            ),
            [
                { name: 'usgovarizona', label: 'US Gov Arizona' },
                { name: 'usgovvirginia', label: 'US Gov Virginia' },
            ],
        );
        assert.strictEqual(locationContexts[0].subscriptionId, 'sub-one');
    });

    test('loads the full live catalog and defers events until connector selection', async () => {
        const requests: string[] = [];
        const context = await createTestActionContext();
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => createArmClient(requests),
        );

        const result = await client.getCatalog(context, {
            subscriptionId: 'sub-one',
            subscriptionName: 'Subscription One',
            region: 'US Gov Virginia',
            regionDisplayName: 'US Gov Virginia',
        });

        test('preserves real nonfeatured Poll operation shapes', async () => {
            const fixture = JSON.parse(await fs.promises.readFile(
                path.join(
                    __dirname,
                    '..',
                    '..',
                    'test',
                    'fixtures',
                    'connectorTriggerPicker',
                    'nonFeaturedOperations.json',
                ),
                'utf8',
            )) as Record<string, unknown>;
            const client = new ConnectorTriggerDataClient(
                async () => [createSubscription()],
                async () => ({
                    async get(url: string): Promise<unknown> {
                        const connectorId = /\/managedApis\/([^/]+)\/apiOperations/.exec(url)?.[1];
                        assert.ok(connectorId);
                        return fixture[decodeURIComponent(connectorId)];
                    },
                }),
            );
            const context = await createTestActionContext();
            const azureContext = {
                subscriptionId: 'sub-one',
                subscriptionName: 'Subscription One',
                region: 'usgovvirginia',
                regionDisplayName: 'US Gov Virginia',
            };

            assert.deepStrictEqual(
                (await client.listConnectorOperations(
                    context,
                    azureContext,
                    'azureblob',
                )).map(operation => operation.id),
                ['OnUpdatedFiles_V2'],
            );
            assert.deepStrictEqual(
                (await client.listConnectorOperations(
                    context,
                    azureContext,
                    'rss',
                )).map(operation => operation.id),
                ['OnNewFeed'],
            );
            assert.deepStrictEqual(
                (await client.listConnectorOperations(
                    context,
                    azureContext,
                    'sftpwithssh',
                )).map(operation => operation.id),
                ['OnUpdatedFile', 'OnUpdatedFiles'],
            );
        });

        (liveCatalogTestsEnabled ? test : test.skip)(
            'loads featured and nonfeatured Poll events through the production client',
            async function (this: Mocha.Context): Promise<void> {
                this.timeout(3 * 60 * 1000);
                const account = JSON.parse(await cpUtils.executeCommand(
                    undefined,
                    undefined,
                    'az',
                    ['account', 'show', '--only-show-errors', '--output', 'json'],
                )) as {
                    environmentName: string;
                    id: string;
                    name: string;
                };
                assert.strictEqual(account.environmentName, 'AzureCloud');
                const client = new ConnectorTriggerDataClient(
                    async () => [createSubscription(
                        account.id,
                        account.name,
                        account.environmentName,
                        'https://management.azure.com/',
                    )],
                    async () => ({
                        async get(url: string): Promise<unknown> {
                            return JSON.parse(await cpUtils.executeCommand(
                                undefined,
                                undefined,
                                'az',
                                [
                                    'rest',
                                    '--only-show-errors',
                                    '--method',
                                    'get',
                                    '--url',
                                    url,
                                    '--output',
                                    'json',
                                ],
                            ));
                        },
                    }),
                );
                const context = await createTestActionContext();
                const azureContext = {
                    subscriptionId: account.id,
                    subscriptionName: account.name,
                    region: 'westcentralus',
                    regionDisplayName: 'West Central US',
                };
                const counts = new Map<string, number>();
                for (const connectorId of [
                    'office365',
                    'azureblob',
                    'github',
                    'slack',
                    'dropbox',
                    'rss',
                    'sftpwithssh',
                ]) {
                    counts.set(
                        connectorId,
                        (await client.listConnectorOperations(
                            context,
                            azureContext,
                            connectorId,
                        )).length,
                    );
                }
                assert.deepStrictEqual(Object.fromEntries(counts), {
                    office365: 9,
                    azureblob: 1,
                    github: 3,
                    slack: 1,
                    dropbox: 4,
                    rss: 1,
                    sftpwithssh: 2,
                });
            },
        );

        assert.strictEqual(result.source, 'live');
        assert.deepStrictEqual(
            result.catalog.connectors.map(connector => connector.id),
            ['github', 'teams', 'office365', 'sharepointonline'],
        );
        assert.deepStrictEqual(result.catalog.operations, []);
        assert.ok(requests.every(request =>
            request.startsWith('https://management.usgovcloudapi.net/'),
        ));
        assert.ok(requests.some(request =>
            request.includes('/locations/usgovvirginia/managedApis?') &&
            new URL(request).searchParams.get('api-version') === '2016-06-01',
        ));
        assert.ok(!requests.some(request => request.includes('/apiOperations?')));
        assert.ok(!requests.some(request =>
            new URL(request).searchParams.get('export') === 'true',
        ));
        assert.ok(requests.includes(
            'https://management.usgovcloudapi.net/managed-api-page-2',
        ));
        assert.strictEqual(
            context.telemetry.properties.connectorCatalogSource,
            'live',
        );
        assert.ok(context.valuesToMask.includes('sub-one'));
        assert.ok(context.valuesToMask.includes('Subscription One'));
        assert.ok(context.valuesToMask.includes('US Gov Virginia'));
        assert.ok(context.valuesToMask.includes(
            'https://management.usgovcloudapi.net/',
        ));

        const operations = await client.listConnectorOperations(
            context,
            {
                subscriptionId: 'sub-one',
                subscriptionName: 'Subscription One',
                region: 'US Gov Virginia',
                regionDisplayName: 'US Gov Virginia',
            },
            'office365',
        );
        assert.deepStrictEqual(operations, [{
            id: 'OnNewEmail',
            connectorId: 'office365',
            label: 'When an email arrives',
            description: undefined,
            isWebhook: false,
            isNotification: true,
        }]);
        assert.ok(requests.some(request =>
            request.includes('/managedApis/office365/apiOperations?') &&
            new URL(request).searchParams.get('api-version') === '2016-06-01',
        ));
    });

    test('rejects cross-origin live catalog paging', async () => {
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(url: string): Promise<unknown> {
                    if (url.includes('/locations/usgovvirginia/managedApis?')) {
                        return {
                            nextLink: 'https://example.invalid/customer-data',
                            value: [],
                        };
                    }
                    assert.fail(`Unexpected URL: ${url}`);
                },
            }),
        );

        await assert.rejects(
            client.getCatalog(await createTestActionContext(), {
                subscriptionId: 'sub-one',
                subscriptionName: 'Subscription One',
                region: 'usgovvirginia',
                regionDisplayName: 'US Gov Virginia',
            }),
            /Unable to load Connector Triggers/,
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
        );

        const staleLoad = client.listSubscriptions();
        while (subscriptionRequestCount === 0) {
            await Promise.resolve();
        }
        client.invalidateSubscriptions();
        const refreshedLoad = client.listSubscriptions();
        resolveFirstRequest?.([createSubscription(
            'sub-one',
            'Subscription One',
            'AzureCloud',
            'https://management.azure.com/',
        )]);

        const [staleSubscriptions, refreshedSubscriptions] = await Promise.all([
            staleLoad,
            refreshedLoad,
        ]);
        assert.strictEqual(subscriptionRequestCount, 2);
        assert.deepStrictEqual(staleSubscriptions, refreshedSubscriptions);
        assert.deepStrictEqual(refreshedSubscriptions, [{
            id: 'sub-one',
            label: 'Subscription One',
        }]);
    });
});

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
                        {
                            name: 'teams',
                            properties: {
                                displayName: 'Microsoft Teams',
                            },
                        },
                        {
                            name: 'github',
                            properties: {
                                displayName: 'GitHub',
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
                                inputsDefinition: {
                                    parameters: [{
                                        name: 'folderPath',
                                        type: 'string',
                                    }],
                                },
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
            } else if (url.includes('/managedApis/teams/apiOperations?')) {
                throw new Error('Connector operation metadata unavailable.');
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
    subscriptionId = 'sub-one',
    subscriptionDisplayName = 'Subscription One',
    environmentName = 'AzureUSGovernment',
    resourceManagerEndpointUrl = 'https://management.usgovcloudapi.net/',
): ConnectorSubscription {
    const context = {
        environment: {
            name: environmentName,
            resourceManagerEndpointUrl,
        },
        subscriptionDisplayName,
        subscriptionId,
    } as ISubscriptionContext;
    return {
        context,
        subscriptionDisplayName,
        subscriptionId,
    };
}

function createLocation(name: string, displayName: string): AzExtLocation {
    return {
        displayName,
        id: `/subscriptions/sub-one/locations/${name}`,
        name,
    };
}
