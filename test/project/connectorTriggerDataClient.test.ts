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
import {
    ConnectorTriggerDataClient,
    type ConnectorArmClient,
    type ConnectorSubscription,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient';

suite('Connector trigger data client', () => {
    test('checks sign-in without requesting subscriptions', async () => {
        let subscriptionRequestCount = 0;
        const client = new ConnectorTriggerDataClient(
            async () => {
                subscriptionRequestCount += 1;
                return [];
            },
            async () => assert.fail('An ARM client must not be created.'),
            async () => false,
        );

        assert.strictEqual(await client.getIsSignedIn(), false);
        assert.strictEqual(subscriptionRequestCount, 0);
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
            async () => true,
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

    test('loads only live connectors and events from the selected custom-cloud region', async () => {
        const requests: string[] = [];
        const context = await createTestActionContext();
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription()],
            async () => createArmClient(requests),
            async () => true,
        );

        const result = await client.getCatalog(context, {
            subscriptionId: 'sub-one',
            subscriptionName: 'Subscription One',
            region: 'US Gov Virginia',
            regionDisplayName: 'US Gov Virginia',
        });

        assert.strictEqual(result.source, 'live');
        assert.strictEqual(result.failedConnectorCount, 1);
        assert.deepStrictEqual(
            result.catalog.connectors.map(connector => connector.id),
            ['office365', 'sharepointonline'],
        );
        assert.deepStrictEqual(
            result.catalog.operations.map(operation => operation.id),
            ['OnNewEmail', 'OnNewFile'],
        );
        assert.ok(result.catalog.operations.every(operation =>
            operation.inputDefinitions === undefined,
        ));
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
            context.telemetry.properties.connectorCatalogSource,
            'live',
        );
        assert.strictEqual(
            context.telemetry.properties.connectorCatalogPartial,
            'true',
        );
        assert.ok(context.valuesToMask.includes('sub-one'));
        assert.ok(context.valuesToMask.includes('Subscription One'));
        assert.ok(context.valuesToMask.includes('US Gov Virginia'));
        assert.ok(context.valuesToMask.includes(
            'https://management.usgovcloudapi.net/',
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
            async () => true,
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
            async () => true,
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
