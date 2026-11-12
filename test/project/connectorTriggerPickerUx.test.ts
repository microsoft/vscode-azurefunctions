/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { createRequire } from 'module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    ConnectorTriggerPickerController, signInToAzureResources,
    type ConnectorTriggerPickerDataSource,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerPickerController';
import { createConnectorTriggerPickerViewModel } from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import { getConnectorTriggerSelections, isConnectorTriggerSelections } from '../../src/connectorTrigger/connectorTriggerSelection';
import { ConnectorEventStep } from '../../src/webview/connectorTriggerPicker/ConnectorEventStep';
import { reconcileConnectorTriggerSelection } from '../../src/webview/connectorTriggerPicker/connectorTriggerPickerState';
import {
    isConnectorTriggerPickerMessage, type ConnectorTriggerOperationOption, type ConnectorTriggerPickerResponse,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';

const connector = { id: 'office365', label: 'Office 365 Outlook' };
const operations: ConnectorTriggerOperationOption[] = [
    { id: 'FirstEvent', connectorId: connector.id, label: 'First event', isWebhook: false, isNotification: true },
    { id: 'SecondEvent', connectorId: connector.id, label: 'Second event', isWebhook: false, isNotification: true },
    { id: 'Webhook', connectorId: connector.id, label: 'Webhook event', isWebhook: true, isNotification: false },
];

suite('Connector trigger picker multi-event UX', () => {
    test('shares one React runtime with the Azure Tools webview renderer', () => {
        const sharedRequire = createRequire(require.resolve('@microsoft/vscode-azext-webview'));
        assert.strictEqual(sharedRequire.resolve('react'), require.resolve('react'));
        assert.strictEqual(sharedRequire.resolve('react-dom'), require.resolve('react-dom'));
    });

    test('preserves legacy single-event messages and accepts explicit batches', () => {
        const single = { connectorId: connector.id, operationId: 'FirstEvent' };
        const batch = { connectorId: connector.id, operationIds: ['FirstEvent', 'SecondEvent'] };
        assert.ok(isConnectorTriggerSelections(single));
        assert.ok(isConnectorTriggerSelections(batch));
        assert.deepStrictEqual(getConnectorTriggerSelections(single), [single]);
        assert.deepStrictEqual(getConnectorTriggerSelections(batch), [
            single, { connectorId: connector.id, operationId: 'SecondEvent' },
        ]);
        assert.ok(isConnectorTriggerPickerMessage({ command: 'continue', ...single }));
        assert.ok(isConnectorTriggerPickerMessage({ command: 'continue', ...batch }));
    });

    test('rejects empty, ambiguous, malformed, and duplicate batches', () => {
        for (const selection of [
            {}, { connectorId: connector.id, operationIds: [] },
            { connectorId: connector.id, operationIds: ['FirstEvent', 'firstevent'] },
            { connectorId: connector.id, operationIds: ['FirstEvent', 'FirstEvent'] },
            { connectorId: connector.id, operationIds: [null] },
            { connectorId: connector.id, operationIds: [' FirstEvent'] },
            { connectorId: connector.id, operationIds: ['First\u0000Event'] },
            { connectorId: '', operationIds: ['FirstEvent'] },
            { connectorId: connector.id, operationId: 'FirstEvent', operationIds: ['FirstEvent'] },
        ]) {
            assert.strictEqual(isConnectorTriggerSelections(selection), false);
            assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'continue', ...selection }), false);
        }
    });

    test('preserves all still-valid selections across refresh and Back navigation', () => {
        assert.deepStrictEqual(reconcileConnectorTriggerSelection({
            activeStep: 1, connectorId: 'OFFICE365', operationIds: ['firstevent', 'SecondEvent'],
        }, [connector], operations), {
            activeStep: 1, connectorId: connector.id, operationIds: ['FirstEvent', 'SecondEvent'], selectionUnavailable: false,
        });
        assert.deepStrictEqual(reconcileConnectorTriggerSelection({
            activeStep: 2, connectorId: connector.id, operationIds: ['FirstEvent', 'SecondEvent', 'Webhook'],
        }, [connector], operations.slice(1)), {
            activeStep: 2, connectorId: connector.id, operationIds: ['SecondEvent'], selectionUnavailable: true,
        });
        assert.deepStrictEqual(reconcileConnectorTriggerSelection({
            activeStep: 2, connectorId: connector.id, operationIds: ['FirstEvent'],
        }, [], operations), {
            activeStep: 1, connectorId: '', operationIds: [], selectionUnavailable: true,
        });
    });

    test('renders accessible checked events, a selected count, and visible but disabled webhooks', () => {
        const html = renderEvents(['FirstEvent', 'SecondEvent']);
        assert.strictEqual((html.match(/type="checkbox"/g) ?? []).length, 3);
        assert.strictEqual((html.match(/checked=""/g) ?? []).length, 2);
        assert.match(html, /2 selected/);
        assert.match(html, /aria-label="Webhook event"[^>]*disabled=""|disabled=""[^>]*aria-label="Webhook event"/);
        assert.ok(html.includes('Webhook'));
        assert.ok(!/<button[^>]*disabled=""[^>]*>Create functions/.test(html));
    });

    test('explains when a connector has no triggers', () => {
        const html = renderEvents([], false, []);
        assert.ok(html.includes(`${connector.label} has no triggers that can start a function.`));
        assert.match(html, /<button[^>]*>.*Change connector<\/button>/);
        assert.ok(!html.includes('type="checkbox"'));
        assert.ok(!html.includes('Search events'));
        assert.match(html, /<button[^>]*disabled=""[^>]*>Create functions/);
    });

    test('disables creation with no selection or while a creation is running', () => {
        assert.match(renderEvents([]), /<button[^>]*disabled=""[^>]*>Create functions/);
        const html = renderEvents(['FirstEvent'], true);
        assert.strictEqual((html.match(/type="checkbox"[^>]*disabled=""/g) ?? []).length, 3);
        assert.ok(html.includes('Creating project'));
    });

    test('ignores malformed and duplicate messages throughout an in-flight creation', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const controller = createHost(responses);
        let finish: (() => void) | undefined;
        const creation = new Promise<void>(resolve => { finish = resolve; });
        let calls = 0;
        controller.createSelectedProject = async () => { calls++; await creation; };
        const pending = controller.handleMessage({ command: 'continue', connectorId: connector.id, operationIds: ['FirstEvent'] },
            await createTestActionContext());
        await controller.handleMessage({ command: 'continue', connectorId: connector.id, operationIds: [] }, await createTestActionContext());
        await controller.handleMessage({ command: 'continue', connectorId: connector.id, operationId: 'SecondEvent' }, await createTestActionContext());
        assert.strictEqual(calls, 1);
        assert.deepStrictEqual(responses, []);
        finish!();
        await pending;
        assert.strictEqual(controller.projectCreationPending, false);
    });

    test('does not post operation failures from an obsolete Azure context', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        let rejectRequest: ((error: Error) => void) | undefined;
        const request = new Promise<never>((_resolve, reject) => { rejectRequest = reject; });
        const controller = createHost(responses);
        controller.dataClient.listConnectorOperationMetadata = async () => await request;
        const pending = controller.handleMessage({ command: 'loadConnectorOperations', connectorId: connector.id }, await createTestActionContext());
        controller.catalogGeneration++;
        rejectRequest!(new Error('Obsolete request failed.'));
        await pending;
        assert.deepStrictEqual(responses, []);
    });

    test('does not post subscriptions from an obsolete Azure context', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        let rejectRequest: ((error: Error) => void) | undefined;
        const request = new Promise<never>((_resolve, reject) => { rejectRequest = reject; });
        const controller = createHost(responses);
        controller.dataClient.listSubscriptions = async () => await request;
        const pending = controller.handleMessage({ command: 'loadAllSubscriptions' }, await createTestActionContext());
        controller.azureContextRevision++;
        rejectRequest!(new Error('Obsolete subscriptions failed.'));
        await pending;
        assert.deepStrictEqual(responses, []);
    });

    test('routes interactive sign-in through Azure Resources', async () => {
        const commands: string[] = [];
        await signInToAzureResources(async command => { commands.push(command); });
        assert.deepStrictEqual(commands, ['azureResourceGroups.logIn']);
    });
});

function renderEvents(selectedOperationIds: string[], projectCreating = false, eventOperations = operations): string {
    return renderToStaticMarkup(createElement(ConnectorEventStep, {
        connector, labels: createConnectorTriggerPickerViewModel().labels, operations: eventOperations, selectedOperationIds,
        projectCreating, operationsError: '', operationsLoading: false, projectCreationDetail: '', projectCreationError: '',
        templateUnavailable: false, onChangeConnector: () => undefined, onRetryOperations: () => undefined,
        onSelectOperation: () => undefined, onUseTemplate: () => undefined,
    }));
}

interface HostHarness {
    handleMessage(message: unknown, context: IActionContext): Promise<void>;
    createSelectedProject(...args: unknown[]): Promise<void>;
    dataClient: Partial<ConnectorTriggerPickerDataSource>;
    catalogGeneration: number;
    azureContextRevision: number;
    projectCreationPending: boolean;
}

function createHost(responses: ConnectorTriggerPickerResponse[]): HostHarness {
    return Object.assign(Object.create(ConnectorTriggerPickerController.prototype), {
        disposed: false, projectCreationPending: false, catalogGeneration: 0, azureContextRevision: 0,
        azureContext: { subscriptionId: 'synthetic', region: 'westcentralus' },
        catalog: { connectors: [{ ...connector }], operations: [] },
        operationRequests: new Map(), loadedConnectors: new Set(), dataClient: {},
        postMessage: async (message: ConnectorTriggerPickerResponse) => { responses.push(message); },
    }) as HostHarness;
}
