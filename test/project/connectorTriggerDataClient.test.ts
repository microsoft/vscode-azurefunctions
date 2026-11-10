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
                    createLocation(
                        'usgovvirginia',
                        'US Gov Virginia',
                        'Other',
                    ),
                    createLocation(
                        'usgovarizona',
                        'US Gov Arizona',
                        'Recommended',
                    ),
                    createLocation('usgovtexas', 'US Gov Texas'),
                    createLocation(
                        'usgovarizona',
                        'US Gov Arizona',
                        'Recommended',
                    ),
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
                {
                    name: 'usgovarizona',
                    label: 'US Gov Arizona',
                    regionCategory: 'Recommended',
                },
                {
                    name: 'usgovtexas',
                    label: 'US Gov Texas',
                    regionCategory: undefined,
                },
                {
                    name: 'usgovvirginia',
                    label: 'US Gov Virginia',
                    regionCategory: 'Other',
                },
            ],
        );
        assert.strictEqual(locationContexts[0].subscriptionId, 'sub-one');
        assert.strictEqual(
            locationContexts[0].environment.resourceManagerEndpointUrl,
            'https://management.usgovcloudapi.net/',
        );
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

        for (const connectorId of [
            'adobeacrobatknowledg',
            'adobesign',
            'adobeacrobatsignsand',
            'magento',
            'adobecommerce',
            'adobecreativecloud',
            'adobeexperiencemanag',
            'adobepdftools',
        ]) {
            assert.deepStrictEqual(
                await client.listConnectorOperations(
                    context,
                    azureContext,
                    connectorId,
                ),
                [],
                `${connectorId} must remain excluded from Poll authoring.`,
            );
        }

        const adobeSign = await client.listConnectorOperationMetadata(
            context,
            azureContext,
            'adobesign',
        );
        assert.deepStrictEqual(adobeSign.pollOperations, []);
        assert.strictEqual(adobeSign.webhookOperations.length, 7);
        assert.ok(adobeSign.webhookOperations.every(operation =>
            operation.isWebhook));

        const creativeCloud = await client.listConnectorOperationMetadata(
            context,
            azureContext,
            'adobecreativecloud',
        );
        assert.deepStrictEqual(creativeCloud.pollOperations, []);
        assert.strictEqual(creativeCloud.webhookOperations.length, 2);

        const mixed = await client.listConnectorOperationMetadata(
            context,
            azureContext,
            'mixedconnector',
        );
        assert.deepStrictEqual(
            mixed.pollOperations.map(operation => operation.id),
            ['OnPolledItem'],
        );
        assert.deepStrictEqual(
            mixed.webhookOperations.map(operation => operation.id),
            ['SubscribeWebhook'],
        );
    });

    test('omits explicitly deprecated events without hiding supported webhook events', async () => {
        const event = { isNotification: true, summary: 'Visible event' };
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(): Promise<unknown> {
                    return { value: [
                        { name: 'VisiblePoll', properties: event },
                        { name: 'VisibleWebhook', properties: { ...event, isNotification: false, isWebhook: true } },
                        { name: 'DeprecatedTopLevel', deprecated: true, properties: event },
                        { name: 'DeprecatedProperty', properties: { ...event, deprecated: true } },
                        { name: 'DeprecatedAnnotation', properties: { ...event, annotation: { status: 'Deprecated' } } },
                        { name: 'DeprecatedSummary', properties: { ...event, summary: 'An old event [DEPRECATED]' } },
                    ] };
                },
            }),
        );
        const metadata = await client.listConnectorOperationMetadata(await createTestActionContext(), {
            subscriptionId: 'sub-one', subscriptionName: 'Subscription One',
            region: 'usgovvirginia', regionDisplayName: 'US Gov Virginia',
        }, 'office365');
        assert.deepStrictEqual(metadata.pollOperations.map(operation => operation.id), ['VisiblePoll']);
        assert.deepStrictEqual(metadata.webhookOperations.map(operation => operation.id), ['VisibleWebhook']);
    });

    test('loads the selected live output schema without scanning other connectors', async () => {
        const requests: string[] = [];
        const fixture = JSON.parse(await fs.promises.readFile(
            path.join(
                __dirname,
                '..',
                '..',
                'test',
                'fixtures',
                'connectorTriggerPicker',
                'actTrigNewContactSwagger.json',
            ),
            'utf8',
        )) as unknown;
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(url: string): Promise<unknown> {
                    requests.push(url);
                    return fixture;
                },
            }),
        );

        const metadata = await client.getConnectorOperationOutputMetadata(
            await createTestActionContext(),
            {
                subscriptionId: 'sub-one',
                subscriptionName: 'Subscription One',
                region: 'usgovvirginia',
                regionDisplayName: 'US Gov Virginia',
            },
            'act',
            'TrigNewContact',
        );

        assert.strictEqual(metadata.schema?.schemaName, 'act.web.api.models.Contact');
        assert.strictEqual(metadata.schema?.collectionPath, 'body');
        assert.strictEqual(requests.length, 1);
        const request = new URL(requests[0]);
        assert.match(request.pathname, /\/managedApis\/act$/);
        assert.strictEqual(
            request.searchParams.get('api-version'),
            '2022-09-01-preview',
        );
        assert.strictEqual(request.searchParams.get('export'), 'true');
    });

    (liveCatalogTestsEnabled ? test : test.skip)(
        'loads featured and nonfeatured Poll events through the production client',
        async function (this: Mocha.Context): Promise<void> {
            this.timeout(3 * 60 * 1000);
            const subscriptionId = process.env.AZFUNC_TEST_SUBSCRIPTION_ID;
            const accessToken = process.env.AZFUNC_TEST_ARM_TOKEN;
            assert.ok(subscriptionId);
            assert.ok(accessToken);
            const client = new ConnectorTriggerDataClient(
                async () => [createSubscription(
                    subscriptionId,
                    'Live Connector Catalog Test',
                    'AzureCloud',
                    'https://management.azure.com/',
                )],
                async () => ({
                    async get(url: string): Promise<unknown> {
                        const response = await fetch(url, {
                            headers: {
                                Authorization: `Bearer ${accessToken}`,
                            },
                        });
                        if (!response.ok) {
                            throw new Error(
                                `ARM request failed with status ${response.status}.`,
                            );
                        }
                        return await response.json();
                    },
                }),
            );
            const context = await createTestActionContext();
            context.valuesToMask.push(accessToken);
            const azureContext = {
                subscriptionId,
                subscriptionName: 'Live Connector Catalog Test',
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

            const adobeSign = await client.listConnectorOperationMetadata(
                context,
                azureContext,
                'adobesign',
            );
            assert.deepStrictEqual({
                poll: adobeSign.pollOperations.length,
                webhook: adobeSign.webhookOperations.length,
            }, {
                poll: 0,
                webhook: 7,
            });
            const creativeCloud = await client.listConnectorOperationMetadata(
                context,
                azureContext,
                'adobecreativecloud',
            );
            assert.deepStrictEqual({
                poll: creativeCloud.pollOperations.length,
                webhook: creativeCloud.webhookOperations.length,
            }, {
                poll: 0,
                webhook: 2,
            });
            const kusto = await client.listConnectorOperationMetadata(
                context,
                azureContext,
                'kusto',
            );
            assert.deepStrictEqual({
                poll: kusto.pollOperations.length,
                webhook: kusto.webhookOperations.length,
            }, {
                poll: 0,
                webhook: 0,
            });
            const actOutput =
                await client.getConnectorOperationOutputMetadata(
                    context,
                    azureContext,
                    'act',
                    'TrigNewContact',
                );
            assert.strictEqual(
                actOutput.schema?.schemaName,
                'act.web.api.models.Contact',
            );
            assert.strictEqual(actOutput.schema?.collectionPath, 'body');
            assert.strictEqual(
                actOutput.schema?.properties.find(property =>
                    property.name === 'customFields')?.type.kind,
                'map',
            );
        },
    );

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

function createLocation(
    name: string,
    displayName: string,
    regionCategory?: string,
): AzExtLocation {
    return {
        displayName,
        id: `/subscriptions/sub-one/locations/${name}`,
        metadata: regionCategory ? { regionCategory } : undefined,
        name,
    };
}
