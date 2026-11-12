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
            request.includes('/managedApis/office365?') &&
            new URL(request).searchParams.get('api-version') === '2022-09-01-preview' &&
            new URL(request).searchParams.get('export') === 'true',
        ));
        assert.ok(!requests.some(request => request.includes('/apiOperations?')));
    });

    test('loads events from the selected regional exported connector definition', async () => {
        const requests: string[] = [];
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription('sub-one', 'Subscription One', 'AzureCloud', 'https://management.azure.com/')],
            async () => ({
                async get(url: string): Promise<unknown> {
                    requests.push(url);
                    return { properties: { swagger: {
                        swagger: '2.0',
                        paths: {
                            '/poll': { get: {
                                operationId: 'PollEvent', summary: 'A polling event', 'x-ms-trigger': 'batch',
                                'x-ms-notification': true,
                            } },
                            '/single': { get: {
                                operationId: 'SinglePollEvent', summary: 'A single polling event', 'x-ms-trigger': 'single',
                            } },
                            '/subscribe': {
                                'x-ms-notification-content': { schema: { type: 'object' } },
                                post: {
                                    operationId: 'WebhookEvent', summary: 'A webhook event', 'x-ms-trigger': 'single',
                                },
                                delete: { operationId: 'DeleteSubscription' },
                            },
                        },
                    } } };
                },
            }),
        );

        const metadata = await client.listConnectorOperationMetadata(await createTestActionContext(), {
            subscriptionId: 'sub-one', subscriptionName: 'Subscription One',
            region: 'West Central US', regionDisplayName: 'West Central US',
        }, 'office365');

        assert.strictEqual(requests.length, 1);
        const request = new URL(requests[0]);
        assert.strictEqual(request.origin, 'https://management.azure.com');
        assert.strictEqual(request.pathname,
            '/subscriptions/sub-one/providers/Microsoft.Web/locations/westcentralus/managedApis/office365');
        assert.strictEqual(request.searchParams.get('api-version'), '2022-09-01-preview');
        assert.strictEqual(request.searchParams.get('export'), 'true');
        assert.deepStrictEqual(metadata.pollOperations.map(operation => operation.id), ['PollEvent', 'SinglePollEvent']);
        assert.deepStrictEqual(metadata.webhookOperations.map(operation => operation.id), ['WebhookEvent']);
        assert.strictEqual(metadata.pollOperations[0].isNotification, true);
        assert.strictEqual(metadata.pollOperations[1].isNotification, false);
        assert.strictEqual(metadata.webhookOperations[0].isNotification, false);
    });

    test('preserves nonfeatured operation identities and webhook classifications', async () => {
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
        )) as Record<string, { value: {
            name: string;
            properties: { summary?: string; trigger?: string; visibility?: string; isWebhook?: boolean; isNotification?: boolean };
        }[] }>;
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(url: string): Promise<unknown> {
                    const connectorId = /\/managedApis\/([^/]+)$/.exec(new URL(url).pathname)?.[1];
                    assert.ok(connectorId);
                    assert.strictEqual(new URL(url).searchParams.get('export'), 'true');
                    return { properties: { swagger: {
                        swagger: '2.0',
                        paths: Object.fromEntries(fixture[decodeURIComponent(connectorId)].value.map(operation => [
                            `/${operation.name}`,
                            {
                                ...(operation.properties.isWebhook ? {
                                    'x-ms-notification-content': { schema: { type: 'object' } },
                                } : {}),
                                get: {
                                    operationId: operation.name,
                                    summary: operation.properties.summary,
                                    'x-ms-trigger': operation.properties.trigger,
                                    'x-ms-visibility': operation.properties.visibility,
                                    'x-ms-notification': operation.properties.isNotification,
                                },
                            },
                        ])),
                    } } };
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

    test('omits deprecated and internal events without hiding advanced, preview or webhook events', async () => {
        const event = { 'x-ms-trigger': 'batch', summary: 'Visible event' };
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(): Promise<unknown> {
                    const operations = [
                        { ...event, operationId: 'VisiblePoll' },
                        { ...event, operationId: 'AdvancedPoll', 'x-ms-visibility': 'advanced' },
                        { ...event, operationId: 'PreviewPoll', 'x-ms-api-annotation': { status: 'Preview' } },
                        { ...event, operationId: 'DeprecatedBoolean', deprecated: true },
                        { ...event, operationId: 'DeprecatedAnnotation', 'x-ms-api-annotation': { status: 'Deprecated' } },
                        { ...event, operationId: 'DeprecatedSummary', summary: 'An old event [DEPRECATED]' },
                        { ...event, operationId: 'DeprecatedSummaryParentheses', summary: 'An old event (deprecated)' },
                        { ...event, operationId: 'Internal', 'x-ms-visibility': 'Internal' },
                        { ...event, operationId: 'Hidden', 'x-ms-visibility': 'hideInUI' },
                    ];
                    return {
                        swagger: '2.0',
                        paths: {
                            ...Object.fromEntries(operations.map(operation => [`/${operation.operationId}`, { get: operation }])),
                            '/subscribe': {
                                'x-ms-notification-content': { schema: { type: 'object' } },
                                post: { ...event, operationId: 'VisibleWebhook', 'x-ms-trigger': 'single' },
                                put: { ...event, operationId: 'DeprecatedWebhook', deprecated: true },
                                delete: { operationId: 'DeleteSubscription' },
                            },
                        },
                    };
                },
            }),
        );
        const metadata = await client.listConnectorOperationMetadata(await createTestActionContext(), {
            subscriptionId: 'sub-one', subscriptionName: 'Subscription One',
            region: 'usgovvirginia', regionDisplayName: 'US Gov Virginia',
        }, 'office365');
        assert.deepStrictEqual(metadata.pollOperations.map(operation => operation.id), ['AdvancedPoll', 'PreviewPoll', 'VisiblePoll']);
        assert.deepStrictEqual(metadata.webhookOperations.map(operation => operation.id), ['VisibleWebhook']);
    });

    test('keeps the latest eligible event revision using Swagger family annotations', async () => {
        const event = (operationId: string, family: string, revision: number) => ({
            operationId,
            'x-ms-trigger': 'batch',
            'x-ms-api-annotation': { family, revision },
        });
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(): Promise<unknown> {
                    return { paths: {
                        '/email': { get: event('OnNewEmail', 'OnNewEmail', 1) },
                        '/email-v3': { get: event('OnNewEmailV3', 'OnNewEmail', 3) },
                        '/email-v2': { get: event('OnNewEmailV2', 'OnNewEmail', 2) },
                        '/file-v10': { get: event('OnNewFile_V10', 'OnNewFile', 10) },
                        '/file-v2': { get: event('OnNewFile_V2', 'OnNewFile', 2) },
                        '/file': { get: event('OnNewFile', 'OnNewFile', 1) },
                        '/renamed': { get: event('RenamedEvent', 'OriginalEvent', 2) },
                        '/original': { get: event('OriginalEvent', 'OriginalEvent', 1) },
                        '/deprecated': { get: { ...event('OnNewEmailV4', 'OnNewEmail', 4), deprecated: true } },
                        '/internal': { get: { ...event('OnNewEmailV5', 'OnNewEmail', 5), 'x-ms-visibility': 'internal' } },
                        '/subscribe': {
                            'x-ms-notification-content': { schema: { type: 'object' } },
                            post: event('SubscribeV2', 'Subscribe', 2),
                            put: event('Subscribe', 'Subscribe', 1),
                        },
                    }, 'x-ms-paths': {
                        '/subscribe?version=3': {
                            'x-ms-notification-content': { schema: { type: 'object' } },
                            post: event('SubscribeV3', 'Subscribe', 3),
                        },
                    } };
                },
            }),
        );
        const metadata = await client.listConnectorOperationMetadata(await createTestActionContext(), {
            subscriptionId: 'sub-one', subscriptionName: 'Subscription One',
            region: 'usgovvirginia', regionDisplayName: 'US Gov Virginia',
        }, 'office365');

        assert.deepStrictEqual(metadata.pollOperations.map(operation => operation.id),
            ['OnNewEmailV3', 'OnNewFile_V10', 'RenamedEvent']);
        assert.deepStrictEqual(metadata.webhookOperations.map(operation => operation.id), ['SubscribeV3']);
    });

    for (const annotatedPaths of [true, false]) {
        for (const hasNewerRevision of [false, true]) {
            test(`reconciles mixed-annotation operation IDs before revisions (annotated paths: ${annotatedPaths}, newer: ${hasNewerRevision})`, async () => {
                const event = { operationId: 'EmailV2', 'x-ms-trigger': 'batch' };
                const annotated = { ...event, 'x-ms-api-annotation': { family: 'Email', revision: 2 } };
                const unannotated = { ...event, operationId: 'emailv2' };
                const client = new ConnectorTriggerDataClient(
                    async () => [createSubscription()],
                    async () => ({
                        async get(): Promise<unknown> {
                            return {
                                paths: {
                                    '/email': { get: annotatedPaths ? annotated : unannotated },
                                    ...(hasNewerRevision ? { '/email-v3': { get: {
                                        ...event, operationId: 'EmailV3',
                                        'x-ms-api-annotation': { family: 'Email', revision: 3 },
                                    } } } : {}),
                                },
                                'x-ms-paths': {
                                    '/email?mode=all': { get: annotatedPaths ? unannotated : annotated },
                                },
                            };
                        },
                    }),
                );
                const metadata = await client.listConnectorOperationMetadata(await createTestActionContext(), {
                    subscriptionId: 'sub-one', subscriptionName: 'Subscription One',
                    region: 'usgovvirginia', regionDisplayName: 'US Gov Virginia',
                }, 'office365');

                assert.deepStrictEqual(metadata.pollOperations.map(operation => operation.id),
                    [hasNewerRevision ? 'EmailV3' : 'EmailV2']);
                assert.deepStrictEqual(metadata.webhookOperations, []);
            });
        }
    }

    test('preserves distinct events when family or valid revision metadata is missing', async () => {
        const ids = ['OnNewEmail', 'OnNewEmailV2', 'OnUpdatedFile', 'OnUpdatedFiles', 'NoRevision',
            'StringRevision', 'NegativeRevision', 'FractionalRevision', 'NoFamily'];
        const annotations: Record<string, unknown> = {
            NoRevision: { family: 'OnNewEmail' },
            StringRevision: { family: 'OnNewEmail', revision: '3' },
            NegativeRevision: { family: 'OnNewEmail', revision: -1 },
            FractionalRevision: { family: 'OnNewEmail', revision: 1.5 },
            NoFamily: { revision: 3 },
        };
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(): Promise<unknown> {
                    return { paths: Object.fromEntries(ids.map(operationId => [`/${operationId}`, { get: {
                        operationId, 'x-ms-trigger': 'single', 'x-ms-api-annotation': annotations[operationId],
                    } }])) };
                },
            }),
        );
        const metadata = await client.listConnectorOperationMetadata(await createTestActionContext(), {
            subscriptionId: 'sub-one', subscriptionName: 'Subscription One',
            region: 'usgovvirginia', regionDisplayName: 'US Gov Virginia',
        }, 'office365');

        assert.deepStrictEqual(metadata.pollOperations.map(operation => operation.id).sort(), [...ids].sort());
    });

    test('inherits connector annotation status unless the event overrides it', async () => {
        const event = { 'x-ms-trigger': 'single' };
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(): Promise<unknown> {
                    return { properties: { swagger: {
                        swagger: '2.0',
                        info: { 'x-ms-api-annotation': { status: 'Deprecated' } },
                        paths: {
                            '/old': { get: { ...event, operationId: 'OldEvent' } },
                            '/current': { get: {
                                ...event, operationId: 'CurrentEvent', 'x-ms-api-annotation': { status: 'Production' },
                            } },
                            '/preview': { get: {
                                ...event, operationId: 'PreviewEvent', 'x-ms-api-annotation': { status: 'Preview' },
                            } },
                        },
                    } } };
                },
            }),
        );
        const metadata = await client.listConnectorOperationMetadata(await createTestActionContext(), {
            subscriptionId: 'sub-one', subscriptionName: 'Subscription One',
            region: 'usgovvirginia', regionDisplayName: 'US Gov Virginia',
        }, 'office365');
        assert.deepStrictEqual(metadata.pollOperations.map(operation => operation.id), ['CurrentEvent', 'PreviewEvent']);
        assert.deepStrictEqual(metadata.webhookOperations, []);
    });

    test('reads additional Swagger paths and deduplicates event identities', async () => {
        const event = { operationId: 'QueryEvent', 'x-ms-trigger': 'batch' };
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(): Promise<unknown> {
                    return {
                        swagger: '2.0',
                        paths: { '/event': { get: event } },
                        'x-ms-paths': {
                            '/event?mode=all': { get: event },
                            '/head': { head: {
                                operationId: 'HeadEvent', 'x-ms-trigger': 'single',
                                description: 'Fallback description', 'x-ms-trigger-hint': 'How to fire this event',
                            } },
                        },
                    };
                },
            }),
        );
        const metadata = await client.listConnectorOperationMetadata(await createTestActionContext(), {
            subscriptionId: 'sub-one', subscriptionName: 'Subscription One',
            region: 'usgovvirginia', regionDisplayName: 'US Gov Virginia',
        }, 'office365');
        assert.deepStrictEqual(metadata.pollOperations.map(operation => operation.id), ['HeadEvent', 'QueryEvent']);
        assert.strictEqual(metadata.pollOperations[0].description, 'How to fire this event');
        assert.ok(metadata.pollOperations.every(operation => !operation.isWebhook && !operation.isNotification));
    });

    test('reports invalid exports instead of returning an empty event list or falling back to apiOperations', async () => {
        const invalidDefinitions: unknown[] = [
            undefined, null, {}, { properties: { swagger: 'https://example.invalid/swagger' } },
            { properties: { swagger: { paths: [] } } },
        ];
        let definition: unknown;
        const requests: string[] = [];
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => ({
                async get(url: string): Promise<unknown> {
                    requests.push(url);
                    return definition;
                },
            }),
        );
        const azureContext = {
            subscriptionId: 'sub-one', subscriptionName: 'Subscription One',
            region: 'usgovvirginia', regionDisplayName: 'US Gov Virginia',
        };
        for (definition of invalidDefinitions) {
            await assert.rejects(
                client.listConnectorOperationMetadata(await createTestActionContext(), azureContext, 'office365'),
                /Unable to load events for the selected connector/,
            );
        }
        definition = { properties: { swagger: { swagger: '2.0', paths: {} } } };
        assert.deepStrictEqual(
            await client.listConnectorOperationMetadata(await createTestActionContext(), azureContext, 'office365'),
            { pollOperations: [], webhookOperations: [] },
        );
        assert.strictEqual(requests.length, invalidDefinitions.length + 1);
        assert.ok(requests.every(request => new URL(request).searchParams.get('export') === 'true'));
        assert.ok(requests.every(request => !request.includes('/apiOperations')));
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

        const operations = await client.listConnectorOperationMetadata(
            await createTestActionContext(),
            {
                subscriptionId: 'sub-one',
                subscriptionName: 'Subscription One',
                region: 'usgovvirginia',
                regionDisplayName: 'US Gov Virginia',
            },
            'act',
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

        assert.deepStrictEqual(operations.pollOperations.map(operation => operation.id), ['TrigNewContact']);
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

    test('reuses one exported definition per cloud, subscription, region, and connector', async () => {
        const requests: string[] = [];
        let failNext = false;
        const swagger = {
            swagger: '2.0',
            paths: {
                '/first': { get: { operationId: 'FirstEvent', 'x-ms-trigger': 'batch' } },
                '/second': { get: { operationId: 'SecondEvent', 'x-ms-trigger': 'batch' } },
            },
        };
        const client = new ConnectorTriggerDataClient(
            async () => [
                createSubscription(),
                createSubscription('sub-two', 'Subscription Two'),
                createSubscription('sub-three', 'Subscription Three', 'AzureCloud', 'https://management.azure.com/'),
            ],
            async () => ({
                async get(url: string): Promise<unknown> {
                    requests.push(url);
                    if (failNext) {
                        failNext = false;
                        throw new Error('Transient ARM failure.');
                    }
                    return { properties: { swagger } };
                },
            }),
        );
        const context = await createTestActionContext();
        const azureContext = (subscriptionId: string, region: string) => ({
            subscriptionId, subscriptionName: subscriptionId, region, regionDisplayName: region,
        });
        const base = azureContext('sub-one', 'usgovvirginia');

        await client.listConnectorOperationMetadata(context, base, 'act');
        await Promise.all(['FirstEvent', 'SecondEvent', 'FirstEvent'].map(operationId =>
            client.getConnectorOperationOutputMetadata(context, base, 'act', operationId)));
        assert.strictEqual(requests.length, 1, 'Discovery and every selected event must share one download.');

        await Promise.all(['FirstEvent', 'SecondEvent'].map(operationId =>
            client.getConnectorOperationOutputMetadata(context, base, 'other', operationId)));
        assert.strictEqual(requests.length, 2, 'Concurrent events for an undiscovered connector must share one download.');

        await client.getConnectorOperationOutputMetadata(context, azureContext('sub-one', 'usgovtexas'), 'act', 'FirstEvent');
        await client.getConnectorOperationOutputMetadata(context, azureContext('sub-two', 'usgovvirginia'), 'act', 'FirstEvent');
        await client.getConnectorOperationOutputMetadata(context, azureContext('sub-three', 'usgovvirginia'), 'act', 'FirstEvent');
        assert.strictEqual(requests.length, 5, 'Each region, subscription, and cloud must use its own definition.');
        assert.ok(requests[4].startsWith('https://management.azure.com/'));

        await client.listConnectorOperationMetadata(context, base, 'act');
        assert.strictEqual(requests.length, 6, 'Event discovery must refresh the definition.');

        const retryContext = azureContext('sub-one', 'usgovarizona');
        failNext = true;
        await assert.rejects(
            client.getConnectorOperationOutputMetadata(context, retryContext, 'act', 'FirstEvent'),
            /Unable to load the selected connector event output definition/,
        );
        await client.getConnectorOperationOutputMetadata(context, retryContext, 'act', 'FirstEvent');
        assert.strictEqual(requests.length, 8, 'A failed download must not be cached.');

        client.invalidateSubscriptions();
        await client.getConnectorOperationOutputMetadata(context, base, 'act', 'FirstEvent');
        assert.strictEqual(requests.length, 9, 'Changing accounts must drop cached definitions.');
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
            for (const connectorId of [
                'office365',
                'azureblob',
                'github',
                'slack',
                'dropbox',
                'rss',
                'sftpwithssh',
            ]) {
                const operations = await client.listConnectorOperations(context, azureContext, connectorId);
                assert.ok(operations.length > 0, `${connectorId} must expose polling events.`);
                assert.ok(operations.every(operation => !operation.isWebhook));
                assert.strictEqual(new Set(operations.map(operation => operation.id.toLowerCase())).size, operations.length);
            }

            const adobeSign = await client.listConnectorOperationMetadata(
                context,
                azureContext,
                'adobesign',
            );
            assert.deepStrictEqual(adobeSign.pollOperations, []);
            assert.ok(adobeSign.webhookOperations.length > 0);
            assert.ok(adobeSign.webhookOperations.every(operation => operation.isWebhook));
            const creativeCloud = await client.listConnectorOperationMetadata(
                context,
                azureContext,
                'adobecreativecloud',
            );
            assert.deepStrictEqual(creativeCloud.pollOperations, []);
            assert.ok(creativeCloud.webhookOperations.length > 0);
            assert.ok(creativeCloud.webhookOperations.every(operation => operation.isWebhook));
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

    test('keeps the selected account when two accounts list the same subscription', async () => {
        const accountA = createAccountSubscription('account-a', 'alice@contoso.test');
        const accountB = createAccountSubscription('account-b', 'bob@contoso.test');
        const locationContexts: ISubscriptionContext[] = [];
        const armContexts: ISubscriptionContext[] = [];
        const client = new ConnectorTriggerDataClient(
            async () => [accountA, accountB],
            async armContext => {
                armContexts.push(armContext);
                return {
                    get: async (url: string) => new URL(url).searchParams.get('export') === 'true' ?
                        { properties: { swagger: { paths: { '/poll': { get: { operationId: 'PollEvent', 'x-ms-trigger': 'single' } } } } } } :
                        { value: [{ name: 'office365', properties: { displayName: 'Office 365 Outlook' } }] },
                };
            },
            async locationContext => {
                locationContexts.push(locationContext);
                return [createLocation('usgovvirginia', 'US Gov Virginia')];
            },
        );
        const context = await createTestActionContext();

        assert.deepStrictEqual(await client.listSubscriptionScopes(), [
            { id: 'sub-one', label: 'Subscription One', accountId: 'account-a', accountLabel: 'alice@contoso.test' },
            { id: 'sub-one', label: 'Subscription One', accountId: 'account-b', accountLabel: 'bob@contoso.test' },
        ]);
        assert.strictEqual(await client.getSubscriptionContext('sub-one', 'account-b'), accountB.context);
        await client.listLocations(context, 'sub-one', 'account-b');
        const azureContext = {
            subscriptionId: 'sub-one', accountId: 'account-b', subscriptionName: 'Subscription One',
            region: 'usgovvirginia', regionDisplayName: 'US Gov Virginia',
        };
        await client.getCatalog(context, azureContext);
        const events = await client.listConnectorOperationMetadata(context, azureContext, 'office365');
        assert.deepStrictEqual(events.pollOperations.map(event => event.id), ['PollEvent']);
        assert.deepStrictEqual([...locationContexts, ...armContexts].map(item => getAccountId(item)), ['account-b', 'account-b', 'account-b']);
        await assert.rejects(client.getSubscriptionContext('sub-one', 'account-missing'), /no longer available/);
        assert.strictEqual(await client.getSubscriptionContext('sub-one'), accountA.context, 'Callers without an account keep first-match behavior.');
        assert.ok(context.valuesToMask.includes('account-b') && context.valuesToMask.includes('bob@contoso.test'));
        assert.doesNotMatch(JSON.stringify(context.telemetry.properties), /account-|contoso/);
    });
});

function createAccountSubscription(accountId: string, accountLabel: string): ConnectorSubscription {
    const subscription = createSubscription();
    Object.assign(subscription.context, { tenantId: 'shared-tenant', account: { id: accountId, label: accountLabel } });
    return subscription;
}

function getAccountId(subscription: ISubscriptionContext): string | undefined {
    return (subscription as { account?: { id?: string } }).account?.id;
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
            } else if (url.includes('/managedApis/office365?')) {
                return { properties: { swagger: {
                    swagger: '2.0',
                    paths: {
                        '/email': { get: {
                            operationId: 'OnNewEmail', 'x-ms-trigger': 'batch', summary: 'When an email arrives',
                            'x-ms-notification': true,
                        } },
                        '/send': { post: { operationId: 'SendEmail', summary: 'Send an email' } },
                    },
                } } };
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
