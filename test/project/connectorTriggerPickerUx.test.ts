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
    AzureContextGate,
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
            projectCreating: false,
            projectCreationDetail: '',
            projectCreationError: '',
            selectedOperationId: operation.id,
            templateUnavailable: false,
            onChangeConnector: () => undefined,
            onSelectOperation: () => undefined,
            onUseTemplate: () => undefined,
        }));

        assert.ok(html.includes(connector.label));
        assert.ok(html.includes(operation.label));
        assert.ok(html.includes(labels.useTemplate));
        assert.ok(!html.includes('Folder parameter must not render'));
    });

    test('renders sign-in gating and subscription/region dropdowns in the webview', () => {
        const labels = createConnectorTriggerPickerViewModel('python').labels;
        const gateHtml = renderToStaticMarkup(createElement(AzureContextGate, {
            actionLabel: labels.selectAzureContext,
            labels,
            loading: false,
            message: labels.azureContextRequired,
            onSelect: () => undefined,
        }));
        const fieldsHtml = renderToStaticMarkup(createElement(AzureContextFields, {
            labels,
            locations: [{ name: 'eastus', label: 'East US' }],
            locationsLoading: false,
            selectedRegion: 'eastus',
            selectedSubscriptionId: 'sub-one',
            subscriptions: [{ id: 'sub-one', label: 'Subscription One' }],
            onSelectRegion: () => undefined,
            onSelectSubscription: () => undefined,
        }));

        assert.ok(gateHtml.includes(labels.azureContextRequired));
        assert.ok(gateHtml.includes(labels.selectAzureContext));
        assert.ok(fieldsHtml.includes(`<span>${labels.subscription}</span>`));
        assert.ok(fieldsHtml.includes(`<span>${labels.region}</span>`));
        assert.ok(fieldsHtml.includes('Subscription One'));
        assert.ok(fieldsHtml.includes('East US'));
        assert.strictEqual((fieldsHtml.match(/<select/g) ?? []).length, 2);
    });

    test('keeps browsing blocked while signed out and initiates sign-in on demand', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        let signedIn = false;
        let signInCount = 0;
        let subscriptionRequestCount = 0;
        const controller = createTestController({
            responses,
            catalogLoader: async () => assert.fail('The catalog must not load.'),
            getIsSignedIn: async () => signedIn,
            listSubscriptions: async () => {
                subscriptionRequestCount += 1;
                return [{ id: 'sub-one', label: 'Subscription One' }];
            },
            signIn: async () => {
                signInCount += 1;
                signedIn = true;
            },
        });

        await callHandleMessage(controller, { command: 'initialize' });
        assert.strictEqual(subscriptionRequestCount, 0);
        assert.deepStrictEqual(responses, [{
            command: 'azureContextRequired',
            message: 'Azure sign-in, a subscription, and a region are required before you can browse Connector Triggers.',
        }]);

        responses.length = 0;
        await callHandleMessage(controller, { command: 'signIn' });
        assert.strictEqual(signInCount, 1);
        assert.strictEqual(subscriptionRequestCount, 1);
        assert.deepStrictEqual(responses, [{
            command: 'subscriptionsLoaded',
            subscriptions: [{ id: 'sub-one', label: 'Subscription One' }],
        }]);
    });

    test('loads regions and then the live catalog from dropdown selections', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const sequence: string[] = [];
        const subscriptionContext = createSubscriptionContext();
        const azureContext = createAzureContext();
        const controller = createTestController({
            responses,
            getIsSignedIn: async () => true,
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
                        operations: [operation],
                    },
                };
            },
        });

        await callHandleMessage(controller, { command: 'initialize' });
        assert.deepStrictEqual(responses, [{
            command: 'subscriptionsLoaded',
            subscriptions: [{
                id: 'sub-one',
                label: 'Subscription One',
            }],
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
            operations: [operation],
        }]);
    });

    test('requires fresh dropdown selections after authentication changes', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        let invalidationCount = 0;
        const controller = createTestController({
            responses,
            getIsSignedIn: async () => false,
            invalidateSubscriptions: () => {
                invalidationCount += 1;
            },
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
        | 'getIsSignedIn'
        | 'getSubscriptionContext'
        | 'invalidateSubscriptions'
        | 'listLocations'
        | 'listSubscriptions'
    >;
    locations: Map<string, { name: string; label: string }[]>;
    postMessage(message: ConnectorTriggerPickerResponse): Promise<void>;
    signIn: ConnectorTriggerSignIn;
    signInPending: boolean;
    subscriptionContext: ISubscriptionContext | undefined;
}

interface TestControllerOptions {
    responses: ConnectorTriggerPickerResponse[];
    catalogLoader?: ConnectorTriggerCatalogLoader;
    getIsSignedIn?: () => Promise<boolean>;
    getSubscriptionContext?: (subscriptionId: string) => Promise<ISubscriptionContext>;
    invalidateSubscriptions?: () => void;
    listLocations?: (
        context: IActionContext,
        subscriptionId: string,
    ) => Promise<{ name: string; label: string }[]>;
    listSubscriptions?: () => Promise<{ id: string; label: string }[]>;
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
            getIsSignedIn: options.getIsSignedIn ?? (async () => false),
            getSubscriptionContext: options.getSubscriptionContext ??
                (async () => createSubscriptionContext()),
            invalidateSubscriptions: options.invalidateSubscriptions ?? (() => undefined),
            listLocations: options.listLocations ?? (async () => []),
            listSubscriptions: options.listSubscriptions ?? (async () => []),
        },
        locations: new Map(),
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
