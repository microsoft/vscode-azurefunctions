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
    type ConnectorTriggerAzureContext,
    type ConnectorTriggerDataClient,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient';
import {
    createConnectorTriggerPickerViewModel,
} from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import { ConnectorEventStep } from '../../src/webview/connectorTriggerPicker/ConnectorEventStep';
import {
    AzureContextFields,
    shouldRequestAzureSignIn,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerView';
import {
    reconcileConnectorTriggerSelection,
} from '../../src/webview/connectorTriggerPicker/connectorTriggerPickerState';
import {
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerResponse,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';

suite('Connector trigger picker Azure context UX', () => {
    const connector: ConnectorTriggerOption = {
        id: 'office365',
        label: 'Office 365 Outlook',
    };
    const operation: ConnectorTriggerOperationOption = {
        id: 'OnNewEmail',
        connectorId: connector.id,
        label: 'When a new email arrives',
        isWebhook: false,
        isNotification: true,
    };

    test('keeps valid selections when the live catalog is refreshed', () => {
        assert.deepStrictEqual(
            reconcileConnectorTriggerSelection({
                activeStep: 2,
                connectorId: 'OFFICE365',
                operationId: 'onnewemail',
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

    test('renders connector and event selection without trigger parameters', () => {
        const labels = createConnectorTriggerPickerViewModel('python').labels;
        const html = renderToStaticMarkup(createElement(ConnectorEventStep, {
            connector,
            labels,
            operations: [{
                ...operation,
                inputDefinitions: [{
                    name: 'folderPath',
                    label: 'Folder parameter must not render',
                    type: 'string',
                    required: true,
                    dynamic: true,
                    sensitive: false,
                }],
            }],
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
        assert.ok(!html.includes('Folder parameter must not render'));
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
            onSelectRegion: () => undefined,
            onSelectSubscription: () => undefined,
        }));

        assert.ok(fieldsHtml.includes(`<span>${labels.subscription}</span>`));
        assert.ok(fieldsHtml.includes(`<span>${labels.region}</span>`));
        assert.strictEqual((fieldsHtml.match(/<select/g) ?? []).length, 2);
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
            onSelectRegion: () => undefined,
            onSelectSubscription: () => undefined,
        }));

        assert.ok(html.includes('Subscription One'));
        assert.ok(html.includes('East US'));
        assert.ok(html.includes(labels.showAllSubscriptions));
        assert.strictEqual((html.match(/disabled=""/g) ?? []).length, 0);
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
                return [operation];
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
            operations: [operation],
        }]);
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
    catalogs: Map<string, ConnectorTriggerCatalogLoadResult>;
    catalogLoadRequests: Map<string, Promise<ConnectorTriggerCatalogLoadResult>>;
    catalogLoader: ConnectorTriggerCatalogLoader;
    dataClient: Pick<
        ConnectorTriggerDataClient,
        | 'getSubscriptionContext'
        | 'invalidateSubscriptions'
        | 'listLocations'
        | 'listConnectorOperations'
        | 'listSubscriptions'
    >;
    locations: Map<string, { name: string; label: string }[]>;
    operationLoadRequests: Map<string, Promise<ConnectorTriggerOperationOption[]>>;
    postMessage(message: ConnectorTriggerPickerResponse): Promise<void>;
    signIn: ConnectorTriggerSignIn;
    signInPending: boolean;
    subscriptionContext: ISubscriptionContext | undefined;
}

interface TestControllerOptions {
    responses: ConnectorTriggerPickerResponse[];
    catalogLoader?: ConnectorTriggerCatalogLoader;
    getSubscriptionContext?: (subscriptionId: string) => Promise<ISubscriptionContext>;
    invalidateSubscriptions?: () => void;
    listLocations?: (
        context: IActionContext,
        subscriptionId: string,
    ) => Promise<{ name: string; label: string }[]>;
    listConnectorOperations?: ConnectorTriggerDataClient['listConnectorOperations'];
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
        catalogs: new Map(),
        catalogLoadRequests: new Map(),
        catalogLoader: options.catalogLoader ?? (async () => assert.fail('Unexpected catalog load.')),
        dataClient: {
            getSubscriptionContext: options.getSubscriptionContext ??
                (async () => createSubscriptionContext()),
            invalidateSubscriptions: options.invalidateSubscriptions ?? (() => undefined),
            listLocations: options.listLocations ?? (async () => []),
            listConnectorOperations: options.listConnectorOperations ??
                (async () => []),
            listSubscriptions: options.listSubscriptions ?? (async () => []),
        },
        locations: new Map(),
        operationLoadRequests: new Map(),
        postMessage: async (message: ConnectorTriggerPickerResponse) => {
            options.responses.push(message);
        },
        signIn: options.signIn ?? (async () => undefined),
        signInPending: false,
        subscriptionContext: undefined,
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
