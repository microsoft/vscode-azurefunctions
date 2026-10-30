/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, UserCancelledError, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    ConnectorTriggerPickerController,
    type ConnectorTriggerAzureContextProvider,
    type ConnectorTriggerCatalogLoadResult,
    type ConnectorTriggerCatalogLoader,
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
        inputDefinitions: [],
    };

    test('keeps valid selections when catalog availability is refreshed', () => {
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

    test('returns to the narrowest valid step when live availability changes', () => {
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
        assert.deepStrictEqual(
            reconcileConnectorTriggerSelection({
                activeStep: 2,
                connectorId: connector.id,
                operationId: operation.id,
            }, [], []),
            {
                activeStep: 1,
                connectorId: '',
                operationId: '',
                selectionUnavailable: true,
            },
        );
    });

    test('keeps explicitly unavailable live selections visible but blocked', () => {
        assert.deepStrictEqual(
            reconcileConnectorTriggerSelection({
                activeStep: 2,
                connectorId: connector.id,
                operationId: operation.id,
            }, [{ ...connector, availability: 'unavailable' }], [operation]),
            {
                activeStep: 2,
                connectorId: connector.id,
                operationId: operation.id,
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
        assert.ok(!html.includes('Configure &amp; preview'));
    });

    test('selects Azure context before loading the catalog', async () => {
        const azureContext = createAzureContext();
        const subscriptionContext = createSubscriptionContext();
        const sequence: string[] = [];
        const responses: ConnectorTriggerPickerResponse[] = [];
        const catalogLoader: ConnectorTriggerCatalogLoader = async (_context, selectedContext) => {
            sequence.push('catalog');
            assert.deepStrictEqual(selectedContext, azureContext);
            return {
                catalog: {
                    connectors: [connector],
                    operations: [operation],
                },
                source: 'live',
            };
        };
        const azureContextProvider: ConnectorTriggerAzureContextProvider = async () => {
            sequence.push('azureContext');
            return { azureContext, subscriptionContext };
        };
        const controller = createTestController(
            responses,
            catalogLoader,
            azureContextProvider,
            selectedSubscription => {
                sequence.push('subscription');
                assert.strictEqual(selectedSubscription, subscriptionContext);
            },
        );

        await callHandleMessage(controller, { command: 'initialize' });

        assert.deepStrictEqual(sequence, [
            'azureContext',
            'subscription',
            'catalog',
        ]);
        assert.deepStrictEqual(responses, [{
            command: 'azureContextSelected',
            azureContext: {
                subscriptionName: azureContext.subscriptionName,
                regionDisplayName: azureContext.regionDisplayName,
            },
        }, {
            command: 'catalogLoaded',
            source: 'live',
            connectors: [connector],
            operations: [{
                id: operation.id,
                connectorId: operation.connectorId,
                label: operation.label,
                isWebhook: operation.isWebhook,
                isNotification: operation.isNotification,
            }],
        }]);
    });

    test('keeps connector browsing blocked when Azure context selection is cancelled', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        let catalogLoadCount = 0;
        const controller = createTestController(
            responses,
            async () => {
                catalogLoadCount += 1;
                return {
                    catalog: {
                        connectors: [connector],
                        operations: [operation],
                    },
                    source: 'live',
                };
            },
            async () => {
                throw new UserCancelledError('Azure context selection cancelled.');
            },
        );

        await callHandleMessage(controller, { command: 'initialize' });

        assert.strictEqual(catalogLoadCount, 0);
        assert.deepStrictEqual(responses, [{
            command: 'azureContextSelectionCancelled',
            message: 'Azure sign-in, a subscription, and a region are required before you can browse Connector Triggers.',
        }]);
    });
});

interface TestableConnectorTriggerPickerController {
    azureContext: ConnectorTriggerAzureContext | undefined;
    azureContextRequest: Promise<void> | undefined;
    azureContextProvider: ConnectorTriggerAzureContextProvider;
    catalogs: Map<string, ConnectorTriggerCatalogLoadResult>;
    catalogLoadRequests: Map<string, Promise<ConnectorTriggerCatalogLoadResult>>;
    catalogLoader: ConnectorTriggerCatalogLoader;
    dataClient: Pick<ConnectorTriggerDataClient, 'registerSubscription'>;
    postMessage(message: ConnectorTriggerPickerResponse): Promise<void>;
}

function createTestController(
    responses: ConnectorTriggerPickerResponse[],
    catalogLoader: ConnectorTriggerCatalogLoader,
    azureContextProvider: ConnectorTriggerAzureContextProvider,
    registerSubscription: (context: ISubscriptionContext) => void = () => undefined,
): TestableConnectorTriggerPickerController {
    return Object.assign(Object.create(ConnectorTriggerPickerController.prototype), {
        azureContext: undefined,
        azureContextRequest: undefined,
        azureContextProvider,
        catalogs: new Map(),
        catalogLoadRequests: new Map(),
        catalogLoader,
        dataClient: { registerSubscription },
        postMessage: async (message: ConnectorTriggerPickerResponse) => {
            responses.push(message);
        },
    }) as TestableConnectorTriggerPickerController;
}

async function callHandleMessage(
    controller: TestableConnectorTriggerPickerController,
    message: unknown,
): Promise<void> {
    const handleMessage = ConnectorTriggerPickerController.prototype as unknown as {
        handleMessage(
            this: TestableConnectorTriggerPickerController,
            message: unknown,
            context: IActionContext,
        ): Promise<void>;
    };
    await handleMessage.handleMessage.call(
        controller,
        message,
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
