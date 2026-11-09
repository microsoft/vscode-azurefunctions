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
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    ConnectorTriggerPickerController,
    signInToAzureResources,
    type ConnectorTriggerCatalogLoadResult,
    type ConnectorTriggerCatalogLoader,
    type ConnectorTriggerSignIn,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerPickerController';
import {
    ConnectorTriggerDataClient,
    type ConnectorTriggerAzureContext,
    type ConnectorTriggerOperationMetadataResult,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient';
import {
    createConnectorTriggerPickerViewModel,
} from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import { ConnectorEventStep } from '../../src/webview/connectorTriggerPicker/ConnectorEventStep';
import {
    AzureContextFields,
    filterSubscriptionOptions,
    getSubscriptionModeActionLabel,
    shouldPreserveSubscriptionSelection,
    shouldRequestAzureSignIn,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerView';
import {
    reconcileConnectorTriggerSelection,
} from '../../src/webview/connectorTriggerPicker/connectorTriggerPickerState';
import {
    type ConnectorTriggerLocationOption,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerResponse,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { ProjectLanguage } from '../../src/constants';
import { envUtils } from '../../src/utils/envUtils';
import {
    TemplateCategory,
    type IProjectTemplate,
} from '../../src/templates/projectTemplates/IProjectTemplate';

const liveCatalogTestsEnabled = envUtils.isEnvironmentVariableSet(
    process.env.AZFUNC_TEST_LIVE_CONNECTOR_CATALOG,
);

suite('Connector trigger picker Azure context UX', () => {
    const connector: ConnectorTriggerOption = {
        id: 'office365',
        label: 'Office 365 Outlook',
    };
    const operation: ConnectorTriggerOperationOption = {
        id: 'OnNewEmailV3',
        connectorId: connector.id,
        label: 'When a new email arrives',
        isWebhook: false,
        isNotification: true,
    };
    const outlookOperations: ConnectorTriggerOperationOption[] = [
        operation,
        {
            ...operation,
            id: 'OnFlaggedEmailV4',
            label: 'When an email is flagged',
        },
        {
            ...operation,
            id: 'OnNewMentionMeEmailV3',
            label: 'When an email mentions me',
        },
        {
            ...operation,
            id: 'CalendarGetOnNewItemsV3',
            label: 'When a calendar item is created',
        },
        {
            ...operation,
            id: 'OnUpcomingEventsV3',
            label: 'When an event is upcoming',
        },
        {
            ...operation,
            id: 'CalendarGetOnChangedItemsV3',
            label: 'When an event is added, updated or deleted (V3)',
        },
    ];

    test('keeps valid selections when the live catalog is refreshed', () => {
        assert.deepStrictEqual(
            reconcileConnectorTriggerSelection({
                activeStep: 2,
                connectorId: 'OFFICE365',
                operationId: 'onnewemailv3',
            }, [connector], [operation]),
            {
                activeStep: 2,
                connectorId: connector.id,
                operationId: operation.id,
                selectionUnavailable: false,
            },
        );
    });

    test('returns to the narrowest valid step when live events change', () => {
        assert.deepStrictEqual(
            reconcileConnectorTriggerSelection({
                activeStep: 2,
                connectorId: connector.id,
                operationId: operation.id,
            }, [connector], []),
            {
                activeStep: 2,
                connectorId: connector.id,
                operationId: '',
                selectionUnavailable: true,
            },
        );
    });

    test('renders connector and event selection', () => {
        const labels = createConnectorTriggerPickerViewModel('python').labels;
        const html = renderToStaticMarkup(createElement(ConnectorEventStep, {
            connector,
            labels,
            operations: [operation],
            operationsError: '',
            operationsLoading: false,
            projectCreating: false,
            projectCreationDetail: '',
            projectCreationError: '',
            selectedOperationId: operation.id,
            templateUnavailable: false,
            onChangeConnector: () => undefined,
            onRetryOperations: () => undefined,
            onSelectOperation: () => undefined,
            onUseTemplate: () => undefined,
        }));

        assert.ok(html.includes(connector.label));
        assert.ok(html.includes(operation.label));
        assert.ok(html.includes(labels.useTemplate));
    });

    test('renders webhook events as selectable with unsupported creation status', () => {
        const labels = createConnectorTriggerPickerViewModel('python').labels;
        const html = renderToStaticMarkup(createElement(ConnectorEventStep, {
            connector: {
                id: 'adobesign',
                label: 'Adobe Acrobat Sign',
                eventSupport: 'webhook-only',
            },
            labels,
            operations: [{
                id: 'CreateWebhookForAgreementCreatedEvent',
                connectorId: 'adobesign',
                label: 'When a new agreement is created',
                isWebhook: true,
                isNotification: false,
            }],
            operationsError: '',
            operationsLoading: false,
            projectCreating: false,
            projectCreationDetail: '',
            projectCreationError: '',
            selectedOperationId: 'CreateWebhookForAgreementCreatedEvent',
            templateUnavailable: false,
            onChangeConnector: () => undefined,
            onRetryOperations: () => undefined,
            onSelectOperation: () => undefined,
            onUseTemplate: () => undefined,
        }));

        assert.ok(html.includes(labels.webhookEventDelivery));
        assert.ok(html.includes('When a new agreement is created'));
        assert.ok(!html.includes('disabled=""'));
        assert.ok(html.includes(labels.useTemplate));
        assert.match(
            html,
            /<button type="button" class="event-card selected webhook">/,
        );
    });

    test('renders both dropdowns while signed out with Location disabled', () => {
        const labels = createConnectorTriggerPickerViewModel('python').labels;
        const fieldsHtml = renderToStaticMarkup(createElement(AzureContextFields, {
            labels,
            locations: [],
            locationsLoading: false,
            selectedRegion: '',
            selectedSubscriptionId: '',
            signInRequired: true,
            showingAllSubscriptions: false,
            subscriptions: [],
            subscriptionsLoading: false,
            onRequestSignIn: () => undefined,
            onShowAllSubscriptions: () => undefined,
            onUseFilteredSubscriptions: () => undefined,
            onSelectRegion: () => undefined,
            onSelectSubscription: () => undefined,
        }));

        assert.ok(fieldsHtml.includes(`<span>${labels.subscription}</span>`));
        assert.ok(fieldsHtml.includes(`<span>${labels.region}</span>`));
        assert.strictEqual((fieldsHtml.match(/role="combobox"/g) ?? []).length, 1);
        assert.strictEqual((fieldsHtml.match(/<select/g) ?? []).length, 1);
        assert.strictEqual((fieldsHtml.match(/disabled=""/g) ?? []).length, 1);
        assert.ok(!fieldsHtml.includes('<button'));
        assert.strictEqual(shouldRequestAzureSignIn(true, false), true);
        assert.strictEqual(shouldRequestAzureSignIn(true, true), false);
    });

    test('uses the Azure Resources sign-in command and never Azure Accounts', async () => {
        const commands: string[] = [];

        await signInToAzureResources(async command => {
            commands.push(command);
        });

        assert.deepStrictEqual(commands, ['azureResourceGroups.logIn']);
        assert.ok(!commands.some(command => command.includes('azure-account')));
    });

    test('enables and populates Location only after Subscription selection', () => {
        const labels = createConnectorTriggerPickerViewModel('python').labels;
        const html = renderToStaticMarkup(createElement(AzureContextFields, {
            labels,
            locations: [{ name: 'eastus', label: 'East US' }],
            locationsLoading: false,
            selectedRegion: '',
            selectedSubscriptionId: 'sub-one',
            signInRequired: false,
            showingAllSubscriptions: false,
            subscriptions: [{ id: 'sub-one', label: 'Subscription One' }],
            subscriptionsLoading: false,
            onRequestSignIn: () => undefined,
            onShowAllSubscriptions: () => undefined,
            onUseFilteredSubscriptions: () => undefined,
            onSelectRegion: () => undefined,
            onSelectSubscription: () => undefined,
        }));

        assert.ok(html.includes('Subscription One'));
        assert.ok(html.includes('East US'));
        assert.strictEqual((html.match(/disabled=""/g) ?? []).length, 0);

        const allHtml = renderToStaticMarkup(createElement(AzureContextFields, {
            labels,
            locations: [{ name: 'eastus', label: 'East US' }],
            locationsLoading: false,
            selectedRegion: 'eastus',
            selectedSubscriptionId: 'sub-one',
            signInRequired: false,
            showingAllSubscriptions: true,
            subscriptions: [{ id: 'sub-one', label: 'Subscription One' }],
            subscriptionsLoading: false,
            onRequestSignIn: () => undefined,
            onShowAllSubscriptions: () => undefined,
            onUseFilteredSubscriptions: () => undefined,
            onSelectRegion: () => undefined,
            onSelectSubscription: () => undefined,
        }));
        assert.ok(allHtml.includes('Subscription One'));
        assert.strictEqual(
            getSubscriptionModeActionLabel(false, labels),
            labels.showAllSubscriptions,
        );
        assert.strictEqual(
            getSubscriptionModeActionLabel(true, labels),
            labels.useFilteredSubscriptions,
        );
    });

    test('groups locations by shared recommendation metadata and preserves selection', () => {
        const labels = createConnectorTriggerPickerViewModel('python').labels;
        const locations = [{
            name: 'westus',
            label: 'West US',
            regionCategory: 'Other',
        }, {
            name: 'eastus',
            label: 'East US',
            regionCategory: 'Recommended',
        }, {
            name: 'centralus',
            label: 'Central US',
        }] as (ConnectorTriggerLocationOption & {
            regionCategory?: string;
        })[];
        const html = renderToStaticMarkup(createElement(AzureContextFields, {
            labels,
            locations,
            locationsLoading: false,
            selectedRegion: 'westus',
            selectedSubscriptionId: 'sub-one',
            signInRequired: false,
            showingAllSubscriptions: false,
            subscriptions: [{ id: 'sub-one', label: 'Subscription One' }],
            subscriptionsLoading: false,
            onRequestSignIn: () => undefined,
            onShowAllSubscriptions: () => undefined,
            onUseFilteredSubscriptions: () => undefined,
            onSelectRegion: () => undefined,
            onSelectSubscription: () => undefined,
        }));

        assert.match(
            html,
            /<optgroup label="Recommended">.*value="eastus".*<\/optgroup>.*<optgroup label="Other">/s,
        );
        assert.match(
            html,
            /<option value="westus" selected="">West US<\/option>/,
        );
        assert.strictEqual((html.match(/value="eastus"/g) ?? []).length, 1);
        assert.strictEqual((html.match(/value="westus"/g) ?? []).length, 1);
        assert.strictEqual((html.match(/value="centralus"/g) ?? []).length, 1);
    });

    test('filters a large subscription list by display name or ID', () => {
        const subscriptions = Array.from({ length: 100 }, (_value, index) => ({
            id: `00000000-0000-0000-0000-${index.toString().padStart(12, '0')}`,
            label: `Subscription ${index.toString().padStart(3, '0')}`,
        }));

        assert.deepStrictEqual(
            filterSubscriptionOptions(subscriptions, 'Subscription 042', ''),
            [subscriptions[42]],
        );
        assert.deepStrictEqual(
            filterSubscriptionOptions(subscriptions, '000000000073', ''),
            [subscriptions[73]],
        );
        assert.strictEqual(
            filterSubscriptionOptions(
                subscriptions,
                subscriptions[5].label,
                subscriptions[5].id,
            ).length,
            100,
        );
    });

    test('preserves a selected subscription in either subscription mode', () => {
        const subscriptions = [
            { id: 'sub-one', label: 'Subscription One' },
            { id: 'sub-two', label: 'Subscription Two' },
        ];
        assert.strictEqual(
            shouldPreserveSubscriptionSelection(subscriptions, 'sub-one'),
            true,
        );
        assert.strictEqual(
            shouldPreserveSubscriptionSelection(subscriptions, 'missing'),
            false,
        );
        assert.strictEqual(
            shouldPreserveSubscriptionSelection(subscriptions, ''),
            false,
        );
    });

    test('loads all subscriptions without clearing a valid current selection', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const filters: boolean[] = [];
        const controller = createTestController({
            responses,
            listSubscriptions: async showAll => {
                filters.push(showAll === true);
                return [
                    { id: 'sub-one', label: 'Subscription One' },
                    { id: 'sub-two', label: 'Subscription Two' },
                ];
            },
        });
        controller.azureContext = createAzureContext();
        controller.subscriptionContext = createSubscriptionContext();

        await callHandleMessage(controller, { command: 'loadAllSubscriptions' });

        assert.deepStrictEqual(filters, [true]);
        assert.deepStrictEqual(controller.azureContext, createAzureContext());
        assert.strictEqual(controller.subscriptionContext?.subscriptionId, 'sub-one');
        assert.deepStrictEqual(responses, [{
            command: 'subscriptionsLoaded',
            subscriptions: [
                { id: 'sub-one', label: 'Subscription One' },
                { id: 'sub-two', label: 'Subscription Two' },
            ],
            showingAll: true,
        }]);

        responses.length = 0;
        await callHandleMessage(controller, { command: 'loadFilteredSubscriptions' });
        assert.deepStrictEqual(filters, [true, false]);
        assert.deepStrictEqual(controller.azureContext, createAzureContext());
        assert.deepStrictEqual(responses, [{
            command: 'subscriptionsLoaded',
            subscriptions: [
                { id: 'sub-one', label: 'Subscription One' },
                { id: 'sub-two', label: 'Subscription Two' },
            ],
            showingAll: false,
        }]);
    });

    test('clears Azure context when the reapplied filter excludes its subscription', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const controller = createTestController({
            responses,
            listSubscriptions: async () => [
                { id: 'sub-two', label: 'Subscription Two' },
            ],
        });
        controller.azureContext = createAzureContext();
        controller.subscriptionContext = createSubscriptionContext();

        await callHandleMessage(controller, { command: 'loadFilteredSubscriptions' });

        assert.strictEqual(controller.azureContext, undefined);
        assert.strictEqual(controller.subscriptionContext, undefined);
        assert.deepStrictEqual(responses, [{
            command: 'subscriptionsLoaded',
            subscriptions: [
                { id: 'sub-two', label: 'Subscription Two' },
            ],
            showingAll: false,
        }]);
    });

    test('keeps browsing blocked while signed out and initiates sign-in on demand', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        let signedIn = false;
        let signInCount = 0;
        let subscriptionRequestCount = 0;
        const controller = createTestController({
            responses,
            catalogLoader: async () => assert.fail('The catalog must not load.'),
            listSubscriptions: async () => {
                subscriptionRequestCount += 1;
                return signedIn ?
                    [{ id: 'sub-one', label: 'Subscription One' }] :
                    [];
            },
            signIn: async () => {
                signInCount += 1;
                signedIn = true;
            },
        });

        await callHandleMessage(controller, { command: 'initialize' });
        assert.strictEqual(subscriptionRequestCount, 1);
        assert.deepStrictEqual(responses, [{
            command: 'azureContextRequired',
            message: 'Azure sign-in, a subscription, and a region are required before you can browse Connector Triggers.',
        }]);

        responses.length = 0;
        await callHandleMessage(controller, { command: 'signIn' });
        assert.strictEqual(signInCount, 1);
        assert.strictEqual(subscriptionRequestCount, 2);
        assert.deepStrictEqual(responses, [{
            command: 'subscriptionsLoaded',
            subscriptions: [{ id: 'sub-one', label: 'Subscription One' }],
            showingAll: false,
        }]);
    });

    test('loads regions and then the live catalog from dropdown selections', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const sequence: string[] = [];
        const subscriptionContext = createSubscriptionContext();
        const azureContext = createAzureContext();
        const controller = createTestController({
            responses,
            listSubscriptions: async () => [{
                id: subscriptionContext.subscriptionId,
                label: subscriptionContext.subscriptionDisplayName,
            }],
            getSubscriptionContext: async subscriptionId => {
                sequence.push(`subscription:${subscriptionId}`);
                return subscriptionContext;
            },
            listLocations: async (_context, subscriptionId) => {
                sequence.push(`locations:${subscriptionId}`);
                return [{
                    name: azureContext.region,
                    label: azureContext.regionDisplayName,
                }];
            },
            catalogLoader: async (_context, selectedContext) => {
                sequence.push(`catalog:${selectedContext.region}`);
                assert.deepStrictEqual(selectedContext, azureContext);
                return {
                    catalog: {
                        connectors: [connector],
                        operations: [],
                    },
                };
            },
            listConnectorOperations: async (_context, selectedContext, connectorId) => {
                sequence.push(`operations:${connectorId}`);
                assert.deepStrictEqual(selectedContext, azureContext);
                return outlookOperations;
            },
        });

        await callHandleMessage(controller, { command: 'initialize' });
        assert.deepStrictEqual(responses, [{
            command: 'subscriptionsLoaded',
            subscriptions: [{
                id: 'sub-one',
                label: 'Subscription One',
            }],
            showingAll: false,
        }]);

        responses.length = 0;
        await callHandleMessage(controller, {
            command: 'selectSubscription',
            subscriptionId: 'sub-one',
        });
        assert.deepStrictEqual(responses, [{
            command: 'locationsLoaded',
            subscriptionId: 'sub-one',
            locations: [{
                name: 'usgovvirginia',
                label: 'US Gov Virginia',
            }],
        }]);

        responses.length = 0;
        await callHandleMessage(controller, {
            command: 'selectRegion',
            subscriptionId: 'sub-one',
            region: 'usgovvirginia',
        });
        assert.deepStrictEqual(sequence, [
            'subscription:sub-one',
            'locations:sub-one',
            'catalog:usgovvirginia',
        ]);
        assert.deepStrictEqual(responses, [{
            command: 'azureContextSelected',
            azureContext: {
                subscriptionId: 'sub-one',
                subscriptionName: 'Subscription One',
                region: 'usgovvirginia',
                regionDisplayName: 'US Gov Virginia',
            },
        }, {
            command: 'catalogLoaded',
            connectors: [connector],
            operations: [],
        }]);

        responses.length = 0;
        await callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: connector.id,
        });
        assert.deepStrictEqual(sequence, [
            'subscription:sub-one',
            'locations:sub-one',
            'catalog:usgovvirginia',
            'operations:office365',
        ]);
        assert.deepStrictEqual(responses, [{
            command: 'connectorOperationsLoaded',
            connectorId: connector.id,
            eventSupport: 'poll',
            operations: outlookOperations,
        }]);
    });

    test('loads real nonfeatured Poll events through the controller', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const azureContext = createAzureContext();
        const azureBlobConnector = {
            id: 'azureblob',
            label: 'Azure Blob Storage',
        };
        const azureBlobOperation: ConnectorTriggerOperationOption = {
            id: 'OnUpdatedFiles_V2',
            connectorId: azureBlobConnector.id,
            label: 'When a blob is added or modified (properties only) (V2)',
            description: 'This operation triggers a flow when blobs change.',
            isWebhook: false,
            isNotification: false,
        };
        const controller = createTestController({
            responses,
            listConnectorOperations: async (
                _context,
                selectedContext,
                connectorId,
            ) => {
                assert.deepStrictEqual(selectedContext, azureContext);
                assert.strictEqual(connectorId, azureBlobConnector.id);
                return [azureBlobOperation];
            },
        });
        controller.azureContext = azureContext;
        controller.subscriptionContext = createSubscriptionContext();
        controller.catalogs.set('sub-one:usgovvirginia', {
            catalog: {
                connectors: [connector, azureBlobConnector],
                operations: [],
            },
        });

        await callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: azureBlobConnector.id,
        });

        assert.deepStrictEqual(responses, [{
            command: 'connectorOperationsLoaded',
            connectorId: azureBlobConnector.id,
            eventSupport: 'poll',
            operations: [azureBlobOperation],
        }]);
        assert.deepStrictEqual(
            controller.catalogs.get('sub-one:usgovvirginia')?.catalog.operations,
            [azureBlobOperation],
        );
    });

    test('does not request operation metadata before connector selection', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const connectors: ConnectorTriggerOption[] = [
            connector,
            {
                id: 'adobesign',
                label: 'Adobe Acrobat Sign',
            },
            {
                id: 'kusto',
                label: 'Azure Data Explorer',
            },
            {
                id: 'failedconnector',
                label: 'Unavailable connector metadata',
            },
        ];
        const requestedConnectorIds: string[] = [];
        const controller = createTestController({
            responses,
            catalogLoader: async () => ({
                catalog: {
                    connectors,
                    operations: [],
                },
            }),
            listConnectorOperationMetadata: async (
                _context,
                _selectedContext,
                connectorId,
            ) => {
                requestedConnectorIds.push(connectorId);
                if (connectorId === connector.id) {
                    return {
                        pollOperations: outlookOperations,
                        webhookOperations: [],
                    };
                }
                if (connectorId === 'adobesign') {
                    return {
                        pollOperations: [],
                        webhookOperations: [{
                            id: 'CreateWebhookForAgreementCreatedEvent',
                            connectorId,
                            label: 'When a new agreement is created',
                            isWebhook: true,
                            isNotification: false,
                        }],
                    };
                }
                if (connectorId === 'kusto') {
                    return {
                        pollOperations: [],
                        webhookOperations: [],
                    };
                }
                throw new Error('Operation metadata unavailable.');
            },
        });
        controller.subscriptionContext = createSubscriptionContext();
        controller.locations.set('sub-one', [{
            name: 'usgovvirginia',
            label: 'US Gov Virginia',
        }]);

        await callHandleMessage(controller, {
            command: 'selectRegion',
            subscriptionId: 'sub-one',
            region: 'usgovvirginia',
        });

        assert.deepStrictEqual(requestedConnectorIds, []);
        assert.deepStrictEqual(
            controller.catalogs
                .get('sub-one:usgovvirginia')
                ?.catalog.connectors
                .map(item => [item.id, item.eventSupport]),
            [
                [connector.id, undefined],
                ['adobesign', undefined],
                ['kusto', undefined],
                ['failedconnector', undefined],
            ],
        );
        assert.deepStrictEqual(responses.map(response => response.command), [
            'azureContextSelected',
            'catalogLoaded',
        ]);
    });

    test('loads only the selected connector and reuses in-flight and cached metadata', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const connectors = [{
            id: 'selected',
            label: 'Selected connector',
        }, {
            id: 'untouched',
            label: 'Untouched connector',
        }];
        const requestCounts = new Map<string, number>();
        let resolveSelected:
            ((metadata: ConnectorTriggerOperationMetadataResult) => void) |
            undefined;
        const selectedRequest = new Promise<ConnectorTriggerOperationMetadataResult>(
            resolve => {
                resolveSelected = resolve;
            },
        );
        const controller = createTestController({
            responses,
            catalogLoader: async () => ({
                catalog: {
                    connectors,
                    operations: [],
                },
            }),
            listConnectorOperationMetadata: async (
                _context,
                _selectedContext,
                connectorId,
            ) => {
                requestCounts.set(
                    connectorId,
                    (requestCounts.get(connectorId) ?? 0) + 1,
                );
                assert.strictEqual(connectorId, 'selected');
                return await selectedRequest;
            },
        });
        controller.subscriptionContext = createSubscriptionContext();
        controller.locations.set('sub-one', [{
            name: 'usgovvirginia',
            label: 'US Gov Virginia',
        }]);

        await callHandleMessage(controller, {
            command: 'selectRegion',
            subscriptionId: 'sub-one',
            region: 'usgovvirginia',
        });

        assert.deepStrictEqual(Object.fromEntries(requestCounts), {});
        responses.length = 0;
        const firstLoad = callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: 'selected',
        });
        const secondLoad = callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: 'selected',
        });
        while (!requestCounts.has('selected')) {
            await Promise.resolve();
        }
        resolveSelected?.({
            pollOperations: [{
                id: 'OnSelectedItem',
                connectorId: 'selected',
                label: 'When an item is selected',
                isWebhook: false,
                isNotification: false,
            }],
            webhookOperations: [],
        });
        await Promise.all([firstLoad, secondLoad]);
        assert.deepStrictEqual(Object.fromEntries(requestCounts), {
            selected: 1,
        });
        assert.strictEqual(
            responses.filter(response =>
                response.command === 'connectorOperationsLoaded').length,
            2,
        );

        responses.length = 0;
        await callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: 'selected',
        });
        assert.deepStrictEqual(Object.fromEntries(requestCounts), {
            selected: 1,
        });
        assert.strictEqual(responses[0]?.command, 'connectorOperationsLoaded');
    });

    test('retries only the selected connector after a metadata failure', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const requestCounts = new Map<string, number>();
        const connectors = [
            {
                id: 'office365',
                label: 'Office 365 Outlook',
            },
            {
                id: 'retryconnector',
                label: 'Retry connector',
            },
        ];
        const controller = createTestController({
            responses,
            catalogLoader: async () => ({
                catalog: {
                    connectors,
                    operations: [],
                },
            }),
            listConnectorOperationMetadata: async (
                _context,
                _selectedContext,
                connectorId,
            ) => {
                const requestCount = (requestCounts.get(connectorId) ?? 0) + 1;
                requestCounts.set(connectorId, requestCount);
                if (connectorId === 'retryconnector' && requestCount === 1) {
                    throw new Error('Temporary operation metadata failure.');
                }
                return {
                    pollOperations: [{
                        id: `Poll${connectorId}`,
                        connectorId,
                        label: `Poll ${connectorId}`,
                        isWebhook: false,
                        isNotification: false,
                    }],
                    webhookOperations: [],
                };
            },
        });
        controller.subscriptionContext = createSubscriptionContext();
        controller.locations.set('sub-one', [{
            name: 'usgovvirginia',
            label: 'US Gov Virginia',
        }]);

        await callHandleMessage(controller, {
            command: 'selectRegion',
            subscriptionId: 'sub-one',
            region: 'usgovvirginia',
        });
        assert.deepStrictEqual(Object.fromEntries(requestCounts), {});
        responses.length = 0;

        await callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: 'retryconnector',
        });
        assert.strictEqual(responses[0]?.command, 'connectorOperationsFailed');
        responses.length = 0;
        await callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: 'retryconnector',
        });
        assert.deepStrictEqual(Object.fromEntries(requestCounts), {
            retryconnector: 2,
        });
        assert.deepStrictEqual(responses.at(-1), {
            command: 'connectorOperationsLoaded',
            connectorId: 'retryconnector',
            eventSupport: 'poll',
            operations: [{
                id: 'Pollretryconnector',
                connectorId: 'retryconnector',
                label: 'Poll retryconnector',
                isWebhook: false,
                isNotification: false,
            }],
        });
    });

    test('does not apply stale selected metadata after the Azure context changes', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        let resolveOldRequest:
            ((metadata: ConnectorTriggerOperationMetadataResult) => void) |
            undefined;
        let markOldRequestStarted: (() => void) | undefined;
        const oldRequestStarted = new Promise<void>(resolve => {
            markOldRequestStarted = resolve;
        });
        const oldRequest = new Promise<ConnectorTriggerOperationMetadataResult>(
            resolve => {
                resolveOldRequest = resolve;
            },
        );
        const controller = createTestController({
            responses,
            catalogLoader: async (_context, selectedContext) => ({
                catalog: {
                    connectors: [{
                        id: selectedContext.region === 'usgovvirginia' ?
                            'oldconnector' :
                            'newconnector',
                        label: selectedContext.region,
                    }],
                    operations: [],
                },
            }),
            listConnectorOperationMetadata: async (
                _context,
                _selectedContext,
                connectorId,
            ) => {
                if (connectorId === 'oldconnector') {
                    markOldRequestStarted?.();
                    return await oldRequest;
                }
                return {
                    pollOperations: [{
                        id: 'OnNewItem',
                        connectorId,
                        label: 'When a new item arrives',
                        isWebhook: false,
                        isNotification: false,
                    }],
                    webhookOperations: [],
                };
            },
        });
        controller.subscriptionContext = createSubscriptionContext();
        controller.locations.set('sub-one', [{
            name: 'usgovvirginia',
            label: 'US Gov Virginia',
        }, {
            name: 'eastus2',
            label: 'East US 2',
        }]);

        await callHandleMessage(controller, {
            command: 'selectRegion',
            subscriptionId: 'sub-one',
            region: 'usgovvirginia',
        });
        responses.length = 0;
        const oldLoad = callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: 'oldconnector',
        });
        await oldRequestStarted;
        await callHandleMessage(controller, {
            command: 'selectRegion',
            subscriptionId: 'sub-one',
            region: 'eastus2',
        });
        await callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: 'newconnector',
        });
        resolveOldRequest?.({
            pollOperations: [{
                id: 'OnOldItem',
                connectorId: 'oldconnector',
                label: 'When an old item arrives',
                isWebhook: false,
                isNotification: false,
            }],
            webhookOperations: [],
        });
        await oldLoad;

        assert.strictEqual(controller.azureContext?.region, 'eastus2');
        assert.deepStrictEqual([...controller.catalogs.keys()], [
            'sub-one:eastus2',
        ]);
        assert.deepStrictEqual(
            controller.catalogs
                .get('sub-one:eastus2')
                ?.catalog.connectors
                .map(item => [item.id, item.eventSupport]),
            [['newconnector', 'poll']],
        );
        assert.ok(!responses.some(response =>
            response.command === 'connectorOperationsLoaded' &&
            response.connectorId === 'oldconnector'));
    });

    (liveCatalogTestsEnabled ? test : test.skip)(
        'loads one selected live connector without background operation requests',
        async function (this: Mocha.Context): Promise<void> {
            this.timeout(3 * 60 * 1000);
            const subscriptionId = process.env.AZFUNC_TEST_SUBSCRIPTION_ID;
            const accessToken = process.env.AZFUNC_TEST_ARM_TOKEN;
            assert.ok(subscriptionId);
            assert.ok(accessToken);
            const subscriptionContext = {
                subscriptionDisplayName: 'Live Connector Catalog Test',
                subscriptionId,
                tenantId: 'live-connector-catalog-test',
                environment: {
                    name: 'AzureCloud',
                    resourceManagerEndpointUrl: 'https://management.azure.com/',
                },
            } as ISubscriptionContext;
            const operationConnectorIds = new Set<string>();
            const client = new ConnectorTriggerDataClient(
                async () => [{
                    subscriptionDisplayName:
                        subscriptionContext.subscriptionDisplayName,
                    subscriptionId,
                    context: subscriptionContext,
                }],
                async () => ({
                    async get(url: string): Promise<unknown> {
                        const operationMatch =
                            /\/managedApis\/([^/]+)\/apiOperations/.exec(url);
                        if (operationMatch) {
                            operationConnectorIds.add(
                                decodeURIComponent(operationMatch[1]),
                            );
                        }
                        const response = await fetch(url, {
                            headers: {
                                Authorization: `Bearer ${accessToken}`,
                            },
                        });
                        if (!response.ok) {
                            throw Object.assign(
                                new Error(
                                    `ARM request failed with status ${response.status}.`,
                                ),
                                { statusCode: response.status },
                            );
                        }
                        return await response.json();
                    },
                }),
            );
            const responses: ConnectorTriggerPickerResponse[] = [];
            const controller = createTestController({
                responses,
                catalogLoader: async (context, azureContext) => ({
                    catalog: (await client.getCatalog(
                        context,
                        azureContext,
                    )).catalog,
                }),
                listConnectorOperationMetadata:
                    client.listConnectorOperationMetadata.bind(client),
            });
            controller.subscriptionContext = subscriptionContext;
            controller.locations.set(subscriptionId, [{
                name: 'westcentralus',
                label: 'West Central US',
            }]);
            await callHandleMessage(controller, {
                command: 'selectRegion',
                subscriptionId,
                region: 'westcentralus',
            });

            const catalog = controller.catalogs
                .get(`${subscriptionId}:westcentralus`)
                ?.catalog;
            assert.ok(catalog);
            assert.ok(catalog.connectors.length > 1000);
            assert.deepStrictEqual([...operationConnectorIds], []);
            assert.ok(!responses.some(response =>
                response.command === 'connectorOperationsLoaded'));

            responses.length = 0;
            await callHandleMessage(controller, {
                command: 'loadConnectorOperations',
                connectorId: 'adobesign',
            });
            assert.deepStrictEqual([...operationConnectorIds], ['adobesign']);
            assert.strictEqual(responses[0]?.command, 'connectorOperationsLoaded');
            if (responses[0]?.command === 'connectorOperationsLoaded') {
                assert.strictEqual(responses[0].eventSupport, 'webhook-only');
                assert.strictEqual(responses[0].operations.length, 7);
                assert.ok(responses[0].operations.every(operation =>
                    operation.isWebhook));
            }

            responses.length = 0;
            await callHandleMessage(controller, {
                command: 'loadConnectorOperations',
                connectorId: 'adobesign',
            });
            assert.deepStrictEqual([...operationConnectorIds], ['adobesign']);
            assert.strictEqual(responses[0]?.command, 'connectorOperationsLoaded');
        },
    );

    test('loads and caches selectable webhook operations after connector selection', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const azureContext = createAzureContext();
        const adobeConnector = {
            id: 'adobesign',
            label: 'Adobe Acrobat Sign',
        };
        const webhookOperations: ConnectorTriggerOperationOption[] = [{
            id: 'CreateWebhookForAgreementCreatedEvent',
            connectorId: adobeConnector.id,
            label: 'When a new agreement is created',
            isWebhook: true,
            isNotification: false,
        }, {
            id: 'CreateWebhookForAgreementSignedEvent',
            connectorId: adobeConnector.id,
            label: 'When an agreement workflow is completed successfully',
            isWebhook: true,
            isNotification: false,
        }];
        const controller = createTestController({
            responses,
            listConnectorOperationMetadata: async (
                _context,
                selectedContext,
                connectorId,
            ) => {
                assert.deepStrictEqual(selectedContext, azureContext);
                assert.strictEqual(connectorId, adobeConnector.id);
                return {
                    pollOperations: [],
                    webhookOperations,
                };
            },
        });
        controller.azureContext = azureContext;
        controller.subscriptionContext = createSubscriptionContext();
        controller.catalogs.set('sub-one:usgovvirginia', {
            catalog: {
                connectors: [connector, adobeConnector],
                operations: [],
            },
        });

        await callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: adobeConnector.id,
        });

        assert.deepStrictEqual(responses, [{
            command: 'connectorOperationsLoaded',
            connectorId: adobeConnector.id,
            eventSupport: 'webhook-only',
            operations: webhookOperations,
        }]);
        assert.deepStrictEqual(
            controller.catalogs.get('sub-one:usgovvirginia')?.catalog.operations,
            webhookOperations,
        );
        assert.strictEqual(
            controller.connectorEventSupport.get(
                'sub-one:usgovvirginia:adobesign',
            ),
            'webhook-only',
        );

        responses.length = 0;
        await callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: adobeConnector.id,
        });
        assert.strictEqual(responses[0]?.command, 'connectorOperationsLoaded');

        responses.length = 0;
        await callHandleMessage(controller, {
            command: 'continue',
            connectorId: adobeConnector.id,
            operationId: webhookOperations[0].id,
        });
        assert.deepStrictEqual(responses, [{
            command: 'projectCreationFailed',
            message: 'Webhook Connector Triggers are not supported yet. Choose a polling event.',
        }]);
    });

    test('loads both polling and webhook events for a mixed connector', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const azureContext = createAzureContext();
        const mixedConnector = {
            id: 'github',
            label: 'GitHub',
        };
        const pollOperation: ConnectorTriggerOperationOption = {
            id: 'OnNewIssue',
            connectorId: mixedConnector.id,
            label: 'When a new issue is created',
            isWebhook: false,
            isNotification: false,
        };
        const webhookOperation: ConnectorTriggerOperationOption = {
            id: 'SubscribePushWebhook',
            connectorId: mixedConnector.id,
            label: 'When code is pushed',
            isWebhook: true,
            isNotification: false,
        };
        const controller = createTestController({
            responses,
            listConnectorOperationMetadata: async () => ({
                pollOperations: [pollOperation],
                webhookOperations: [webhookOperation],
            }),
        });
        controller.azureContext = azureContext;
        controller.subscriptionContext = createSubscriptionContext();
        controller.catalogs.set('sub-one:usgovvirginia', {
            catalog: {
                connectors: [mixedConnector],
                operations: [],
            },
        });

        await callHandleMessage(controller, {
            command: 'loadConnectorOperations',
            connectorId: mixedConnector.id,
        });

        assert.deepStrictEqual(responses, [{
            command: 'connectorOperationsLoaded',
            connectorId: mixedConnector.id,
            eventSupport: 'poll',
            operations: [pollOperation, webhookOperation],
        }]);
        assert.deepStrictEqual(
            controller.catalogs
                .get('sub-one:usgovvirginia')
                ?.catalog.operations,
            [pollOperation, webhookOperation],
        );
    });

    test('does not classify action-only or failed loads as webhook-only', async () => {
        const azureContext = createAzureContext();
        for (const [connectorId, shouldFail] of [
            ['kusto', false],
            ['failedconnector', true],
        ] as const) {
            const responses: ConnectorTriggerPickerResponse[] = [];
            const controller = createTestController({
                responses,
                listConnectorOperationMetadata: async () => {
                    if (shouldFail) {
                        throw new Error('Operation metadata unavailable.');
                    }
                    return {
                        pollOperations: [],
                        webhookOperations: [],
                    };
                },
            });
            controller.azureContext = azureContext;
            controller.subscriptionContext = createSubscriptionContext();
            controller.catalogs.set('sub-one:usgovvirginia', {
                catalog: {
                    connectors: [{
                        id: connectorId,
                        label: connectorId,
                    }],
                    operations: [],
                },
            });

            await callHandleMessage(controller, {
                command: 'loadConnectorOperations',
                connectorId,
            });

            if (shouldFail) {
                assert.strictEqual(
                    responses[0]?.command,
                    'connectorOperationsFailed',
                );
                assert.strictEqual(
                    controller.connectorEventSupport.has(
                        `sub-one:usgovvirginia:${connectorId}`,
                    ),
                    false,
                );
            } else {
                assert.deepStrictEqual(responses, [{
                    command: 'connectorOperationsLoaded',
                    connectorId,
                    eventSupport: 'none',
                    operations: [],
                }]);
                assert.strictEqual(
                    controller.connectorEventSupport.get(
                        `sub-one:usgovvirginia:${connectorId}`,
                    ),
                    'none',
                );
            }
        }
    });

    test('requires fresh dropdown selections after authentication changes', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        let invalidationCount = 0;
        const controller = createTestController({
            responses,
            invalidateSubscriptions: () => {
                invalidationCount += 1;
            },
            listSubscriptions: async () => [],
        });
        controller.azureContext = createAzureContext();
        controller.subscriptionContext = createSubscriptionContext();
        controller.locations.set('sub-one', [{
            name: 'usgovvirginia',
            label: 'US Gov Virginia',
        }]);
        controller.catalogs.set('stale', {
            catalog: {
                connectors: [connector],
                operations: [operation],
            },
        });

        await callHandleAuthenticationChange(controller);

        assert.strictEqual(invalidationCount, 1);
        assert.strictEqual(controller.azureContext, undefined);
        assert.strictEqual(controller.subscriptionContext, undefined);
        assert.strictEqual(controller.locations.size, 0);
        assert.strictEqual(controller.catalogs.size, 0);
        assert.deepStrictEqual(responses, [{
            command: 'azureContextRequired',
            message: 'Azure sign-in, a subscription, and a region are required before you can browse Connector Triggers.',
        }]);
    });
});

interface TestableConnectorTriggerPickerController {
    azureContext: ConnectorTriggerAzureContext | undefined;
    azureContextRevision: number;
    catalogGeneration: number;
    catalogs: Map<string, ConnectorTriggerCatalogLoadResult>;
    catalogLoadRequests: Map<string, Promise<ConnectorTriggerCatalogLoadResult>>;
    catalogLoader: ConnectorTriggerCatalogLoader;
    dataClient: Pick<
        ConnectorTriggerDataClient,
        | 'getConnectorOperationOutputMetadata'
        | 'getSubscriptionContext'
        | 'invalidateSubscriptions'
        | 'listLocations'
        | 'listConnectorOperationMetadata'
        | 'listConnectorOperations'
        | 'listSubscriptions'
    >;
    connectorEventSupport: Map<string, 'none' | 'poll' | 'webhook-only'>;
    controllerDisposed: boolean;
    locations: Map<string, { name: string; label: string }[]>;
    launchOptions: {
        language: ProjectLanguage;
        languageModel?: number;
    };
    operationLoadRequests: Map<string, Promise<unknown>>;
    postMessage(message: ConnectorTriggerPickerResponse): Promise<void>;
    signIn: ConnectorTriggerSignIn;
    signInPending: boolean;
    subscriptionContext: ISubscriptionContext | undefined;
    templateProvider: {
        getTemplates(): Promise<IProjectTemplate[]>;
    };
}

interface TestControllerOptions {
    responses: ConnectorTriggerPickerResponse[];
    catalogLoader?: ConnectorTriggerCatalogLoader;
    getSubscriptionContext?: (subscriptionId: string) => Promise<ISubscriptionContext>;
    getConnectorOperationOutputMetadata?:
        ConnectorTriggerDataClient['getConnectorOperationOutputMetadata'];
    invalidateSubscriptions?: () => void;
    listLocations?: (
        context: IActionContext,
        subscriptionId: string,
    ) => Promise<{ name: string; label: string }[]>;
    listConnectorOperations?: ConnectorTriggerDataClient['listConnectorOperations'];
    listConnectorOperationMetadata?:
        ConnectorTriggerDataClient['listConnectorOperationMetadata'];
    listSubscriptions?: (
        showAll?: boolean,
    ) => Promise<{ id: string; label: string }[]>;
    signIn?: ConnectorTriggerSignIn;
}

function createTestController(
    options: TestControllerOptions,
): TestableConnectorTriggerPickerController {
    return Object.assign(Object.create(ConnectorTriggerPickerController.prototype), {
        azureContext: undefined,
        azureContextRevision: 0,
        catalogGeneration: 0,
        catalogs: new Map(),
        catalogLoadRequests: new Map(),
        catalogLoader: options.catalogLoader ?? (async () => assert.fail('Unexpected catalog load.')),
        connectorEventSupport: new Map(),
        controllerDisposed: false,
        dataClient: {
            getConnectorOperationOutputMetadata:
                options.getConnectorOperationOutputMetadata ??
                (async () => ({ limitation: 'definition-unavailable' })),
            getSubscriptionContext: options.getSubscriptionContext ??
                (async () => createSubscriptionContext()),
            invalidateSubscriptions: options.invalidateSubscriptions ?? (() => undefined),
            listLocations: options.listLocations ?? (async () => []),
            listConnectorOperationMetadata:
                options.listConnectorOperationMetadata ??
                (async (context, azureContext, connectorId) => ({
                    pollOperations: await (
                        options.listConnectorOperations ??
                        (async () => [])
                    )(context, azureContext, connectorId),
                    webhookOperations: [],
                })),
            listConnectorOperations: options.listConnectorOperations ??
                (async () => []),
            listSubscriptions: options.listSubscriptions ?? (async () => []),
        },
        locations: new Map(),
        launchOptions: {
            language: ProjectLanguage.TypeScript,
        },
        operationLoadRequests: new Map(),
        postMessage: async (message: ConnectorTriggerPickerResponse) => {
            options.responses.push(message);
        },
        signIn: options.signIn ?? (async () => undefined),
        signInPending: false,
        subscriptionContext: undefined,
        templateProvider: {
            getTemplates: async () => [createOwnedTemplate()],
        },
    }) as TestableConnectorTriggerPickerController;
}

async function callHandleMessage(
    controller: TestableConnectorTriggerPickerController,
    message: unknown,
): Promise<void> {
    const methods = ConnectorTriggerPickerController.prototype as unknown as {
        handleMessage(
            this: TestableConnectorTriggerPickerController,
            message: unknown,
            context: IActionContext,
        ): Promise<void>;
    };
    await methods.handleMessage.call(
        controller,
        message,
        await createTestActionContext(),
    );
}

async function callHandleAuthenticationChange(
    controller: TestableConnectorTriggerPickerController,
): Promise<void> {
    const methods = ConnectorTriggerPickerController.prototype as unknown as {
        handleAuthenticationChange(
            this: TestableConnectorTriggerPickerController,
            context: IActionContext,
        ): Promise<void>;
    };
    await methods.handleAuthenticationChange.call(
        controller,
        await createTestActionContext(),
    );
}

function createAzureContext(): ConnectorTriggerAzureContext {
    return {
        subscriptionId: 'sub-one',
        subscriptionName: 'Subscription One',
        region: 'usgovvirginia',
        regionDisplayName: 'US Gov Virginia',
    };
}

function createSubscriptionContext(): ISubscriptionContext {
    return {
        subscriptionDisplayName: 'Subscription One',
        subscriptionId: 'sub-one',
        tenantId: 'tenant-one',
        environment: {
            name: 'AzureUSGovernment',
            resourceManagerEndpointUrl: 'https://management.usgovcloudapi.net/',
        },
    } as ISubscriptionContext;
}

function createOwnedTemplate(): IProjectTemplate {
    return {
        id: 'office365-connector-trigger-typescript',
        displayName: 'Office 365 Outlook Connector Trigger',
        shortDescription: 'Office 365 connector trigger',
        categories: ['connectors' as TemplateCategory],
        languages: [ProjectLanguage.TypeScript],
        repositoryUrl: 'https://example.invalid/office365',
        connectorTrigger: {
            operations: [
                'OnNewEmailV3',
                'OnFlaggedEmailV4',
                'OnNewMentionMeEmailV3',
                'CalendarGetOnNewItemsV3',
                'OnUpcomingEventsV3',
            ].map(operationId => ({
                operationId,
                functionName: operationId,
                ownedPaths: [`src/functions/${operationId}.ts`],
            })),
        },
    };
}
