/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    ConnectorTriggerPickerController,
    type ConnectorTriggerCatalogLoadResult,
    type ConnectorTriggerCatalogLoader,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerPickerController';
import {
    createConnectorTriggerPickerViewModel,
} from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import {
    ConnectorConfigureStep,
} from '../../src/webview/connectorTriggerPicker/ConnectorConfigureStep';
import {
    reconcileConnectorTriggerSelection,
} from '../../src/webview/connectorTriggerPicker/connectorTriggerPickerState';
import {
    isConnectorTriggerPickerMessage,
    isConnectorTriggerPickerResponse,
    type ConnectorNamespaceOption,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerResponse,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';

suite('Connector trigger picker signed-out UX', () => {
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
                activeStep: 3,
                connectorId: 'OFFICE365',
                operationId: 'onnewemail',
            }, [connector], [operation]),
            {
                activeStep: 3,
                connectorId: connector.id,
                operationId: operation.id,
                selectionUnavailable: false,
            },
        );
    });

    test('returns to the narrowest valid step when live availability changes', () => {
        assert.deepStrictEqual(
            reconcileConnectorTriggerSelection({
                activeStep: 3,
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
                activeStep: 3,
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
                activeStep: 3,
                connectorId: connector.id,
                operationId: operation.id,
            }, [{ ...connector, availability: 'unavailable' }], [operation]),
            {
                activeStep: 3,
                connectorId: connector.id,
                operationId: operation.id,
                selectionUnavailable: true,
            },
        );
    });

    test('renders signed-out project creation without Azure resource metadata', () => {
        const labels = createConnectorTriggerPickerViewModel('python').labels;
        const html = renderToStaticMarkup(createElement(ConnectorConfigureStep, {
            catalogLoading: false,
            catalogSource: 'bundled',
            connector,
            deliveryMode: 'Polling',
            labels,
            language: 'python',
            operation,
            operationInputsDeferred: false,
            operationInputsError: '',
            operationInputsLoading: false,
            projectCreating: false,
            projectCreationDetail: '',
            projectCreationError: '',
            templateUnavailable: false,
            onChangeDeliveryMode: () => undefined,
            onChangeEvent: () => undefined,
            onRetryOperationInputs: () => undefined,
            onUseTemplate: () => undefined,
        }));

        assert.ok(html.includes(labels.catalogSetupDeferred));
        assert.ok(html.includes(labels.useTemplate));
        assert.ok(!html.includes('subscription'));
        assert.ok(!html.includes('resourceGroup'));
    });

    test('renders omitted input schemas as deferred instead of no-input success', () => {
        const labels = createConnectorTriggerPickerViewModel('python').labels;
        const html = renderToStaticMarkup(createElement(ConnectorConfigureStep, {
            catalogLoading: false,
            catalogSource: 'bundled',
            connector,
            deliveryMode: 'Polling',
            labels,
            language: 'python',
            operation: {
                ...operation,
                inputDefinitions: undefined,
            },
            operationInputsDeferred: true,
            operationInputsError: '',
            operationInputsLoading: false,
            projectCreating: false,
            projectCreationDetail: '',
            projectCreationError: '',
            templateUnavailable: false,
            onChangeDeliveryMode: () => undefined,
            onChangeEvent: () => undefined,
            onRetryOperationInputs: () => undefined,
            onUseTemplate: () => undefined,
        }));

        assert.ok(html.includes(labels.eventParametersDeferred));
        assert.ok(!html.includes(labels.noEventParameters));
    });

    test('loads and caches the namespace-free provider catalog', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        let requestedNamespace: ConnectorNamespaceOption | undefined;
        let loadCount = 0;
        const catalogLoader: ConnectorTriggerCatalogLoader = async (_context, namespace) => {
            loadCount += 1;
            requestedNamespace = namespace;
            return {
                catalog: {
                    connectors: [connector],
                    operations: [operation],
                },
                source: 'bundled',
                warning: 'Using the bundled snapshot.',
            };
        };
        interface TestableConnectorTriggerPickerController {
            namespaces: Map<string, ConnectorNamespaceOption>;
            catalogs: Map<string, ConnectorTriggerCatalogLoadResult>;
            catalogLoadRequests: Map<string, Promise<ConnectorTriggerCatalogLoadResult>>;
            catalogLoader: ConnectorTriggerCatalogLoader;
            postMessage(message: ConnectorTriggerPickerResponse): Promise<void>;
            postCatalogLoaded(
                namespaceId: string | undefined,
                result: ConnectorTriggerCatalogLoadResult,
            ): Promise<void>;
        }
        const controllerMethods = ConnectorTriggerPickerController.prototype as unknown as {
            loadCatalog(
                this: TestableConnectorTriggerPickerController,
                context: IActionContext,
                namespaceId?: string,
            ): Promise<void>;
            postCatalogLoaded(
                this: TestableConnectorTriggerPickerController,
                namespaceId: string | undefined,
                result: ConnectorTriggerCatalogLoadResult,
            ): Promise<void>;
        };
        const controller: TestableConnectorTriggerPickerController = {
            namespaces: new Map(),
            catalogs: new Map(),
            catalogLoadRequests: new Map(),
            catalogLoader,
            postMessage: async message => {
                responses.push(message);
            },
            postCatalogLoaded(namespaceId, result) {
                return controllerMethods.postCatalogLoaded.call(this, namespaceId, result);
            },
        };
        const context = await createTestActionContext();

        await controllerMethods.loadCatalog.call(controller, context);
        await controllerMethods.loadCatalog.call(controller, context);

        assert.strictEqual(requestedNamespace, undefined);
        assert.strictEqual(loadCount, 1);
        assert.deepStrictEqual(responses, [{
            command: 'catalogLoaded',
            source: 'bundled',
            connectors: [connector],
            operations: [operation],
            warning: 'Using the bundled snapshot.',
        }, {
            command: 'catalogLoaded',
            source: 'bundled',
            connectors: [connector],
            operations: [operation],
            warning: 'Using the bundled snapshot.',
        }]);
    });

    test('accepts namespace-optional catalog and project messages', () => {
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadCatalog',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'continue',
            connectorId: connector.id,
            operationId: operation.id,
            deliveryMode: 'Polling',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'catalogLoaded',
            source: 'bundled',
            connectors: [connector],
            operations: [operation],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'catalogLoaded',
            source: 'unknown',
            connectors: [connector],
            operations: [operation],
        }), false);
    });
});
