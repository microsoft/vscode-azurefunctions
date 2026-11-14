/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { createRequire } from 'module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type ConnectorProjectCreationOptions } from '../../src/commands/createNewProject/ProjectTemplateCreator';
import {
    ConnectorTriggerPickerController, signInToAzureResources,
    type ConnectorTriggerPickerDataSource,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerPickerController';
import { createConnectorTriggerPickerViewModel } from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import { ProjectLanguage } from '../../src/constants';
import { getConnectorTriggerSelections, isConnectorTriggerSelections } from '../../src/connectorTrigger/connectorTriggerSelection';
import { type IProjectTemplate } from '../../src/templates/projectTemplates/IProjectTemplate';
import { ConnectorEventStep } from '../../src/webview/connectorTriggerPicker/ConnectorEventStep';
import { reconcileConnectorTriggerSelection } from '../../src/webview/connectorTriggerPicker/connectorTriggerPickerState';
import { selectSubscriptionOption } from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerView';
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
    test('keeps the typed subscription query when the combobox clears its selection', () => {
        const selected: string[] = [];
        const actions = {
            onShowAllSubscriptions: () => assert.fail('No mode change expected.'),
            onUseFilteredSubscriptions: () => assert.fail('No mode change expected.'),
            onSelectSubscription: (id: string) => { selected.push(id); },
        };
        assert.strictEqual(selectSubscriptionOption(undefined, actions), false);
        assert.deepStrictEqual(selected, []);
        assert.strictEqual(selectSubscriptionOption('sub-2', actions), true);
        assert.deepStrictEqual(selected, ['sub-2']);
    });

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

    test('does not show the no-triggers message while loading or after an error', () => {
        const loading = renderEvents([], false, [], true);
        assert.ok(loading.includes('Loading events'));
        assert.ok(!loading.includes('has no triggers'));
        const failed = renderEvents([], false, [], false, 'Could not load events');
        assert.ok(failed.includes('Could not load events'));
        assert.ok(failed.includes('Retry'));
        assert.ok(!failed.includes('has no triggers'));
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

    test('chooses a language when creating functions and reuses it on retry', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls, requestedLanguages } = createCreationHost(responses, undefined, true);
        const firstContext = await createTestActionContext();
        const selection = { command: 'continue', connectorId: connector.id, operationIds: ['FirstEvent'] };

        await firstContext.ui.runWithInputs(['Python'], async () => await controller.handleMessage(selection, firstContext));

        assert.strictEqual(firstContext.telemetry.properties.projectLanguage, ProjectLanguage.Python);
        assert.ok(responses.some(response => response.command === 'projectCreationFailed'));
        const retryContext = await createTestActionContext();
        await retryContext.ui.runWithInputs([], async () => await controller.handleMessage(selection, retryContext));

        assert.deepStrictEqual(requestedLanguages, [ProjectLanguage.Python, ProjectLanguage.Python]);
        assert.deepStrictEqual(calls.map(call => call.language), [ProjectLanguage.Python, ProjectLanguage.Python]);
        assert.ok(calls.every(call => call.template.languages.includes(ProjectLanguage.Python)));
        assert.strictEqual(controller.projectCreationPending, false);
    });

    test('uses the language and .NET framework selected before opening the picker', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls, requestedLanguages } = createCreationHost(responses, ProjectLanguage.CSharp);
        const context = await createTestActionContext();

        await context.ui.runWithInputs([], async () => await controller.handleMessage({
            command: 'continue', connectorId: connector.id, operationIds: ['FirstEvent'],
        }, context));

        assert.deepStrictEqual(requestedLanguages, [ProjectLanguage.CSharp]);
        assert.strictEqual(calls[0].language, ProjectLanguage.CSharp);
        assert.strictEqual(calls[0].options.targetFramework, 'net8.0');
    });

    test('canceling language selection returns to the picker without creating a project', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls, requestedLanguages } = createCreationHost(responses);
        const context = await createTestActionContext();
        context.ui.showQuickPick = async () => { throw new UserCancelledError('connectorTriggerLanguage'); };

        await controller.handleMessage({
            command: 'continue', connectorId: connector.id, operationIds: ['FirstEvent'],
        }, context);

        assert.deepStrictEqual(calls, []);
        assert.deepStrictEqual(requestedLanguages, []);
        assert.deepStrictEqual(responses.at(-1), { command: 'projectCreationFailed', message: '' });
        assert.strictEqual(context.telemetry.properties.result, 'Canceled');
        assert.strictEqual(controller.projectCreationPending, false);
    });

    test('does not create a project if the Azure context changes while choosing a language', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls, requestedLanguages } = createCreationHost(responses);
        const context = await createTestActionContext();
        const listener = context.ui.onDidFinishPrompt(() => { controller.catalogGeneration++; });
        try {
            await context.ui.runWithInputs(['Python'], async () => await controller.handleMessage({
                command: 'continue', connectorId: connector.id, operationIds: ['FirstEvent'],
            }, context));
        } finally {
            listener.dispose();
        }

        assert.deepStrictEqual(calls, []);
        assert.deepStrictEqual(requestedLanguages, []);
        assert.strictEqual(context.telemetry.properties.result, 'Canceled');
        assert.deepStrictEqual(responses.at(-1), { command: 'projectCreationFailed', message: '' });
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

function renderEvents(
    selectedOperationIds: string[], projectCreating = false, eventOperations = operations,
    operationsLoading = false, operationsError = '',
): string {
    return renderToStaticMarkup(createElement(ConnectorEventStep, {
        connector, labels: createConnectorTriggerPickerViewModel().labels, operations: eventOperations, selectedOperationIds,
        projectCreating, operationsError, operationsLoading, projectCreationDetail: '', projectCreationError: '',
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

function createCreationHost(responses: ConnectorTriggerPickerResponse[], language?: ProjectLanguage, failFirst = false): {
    controller: HostHarness;
    calls: { template: IProjectTemplate; language: ProjectLanguage; options: ConnectorProjectCreationOptions }[];
    requestedLanguages: ProjectLanguage[];
} {
    const controller = createHost(responses);
    const calls: { template: IProjectTemplate; language: ProjectLanguage; options: ConnectorProjectCreationOptions }[] = [];
    const requestedLanguages: ProjectLanguage[] = [];
    Object.assign(controller, {
        launchOptions: {
            language, initialLocation: 'test-project', initialFilters: {},
            targetFramework: language === ProjectLanguage.CSharp ? 'net8.0' : undefined,
        },
        subscriptionContext: {
            subscriptionId: 'synthetic', tenantId: 'synthetic', environment: { name: 'AzureCloud' },
        },
        catalog: { connectors: [{ ...connector }], operations: [operations[0]] },
        loadedConnectors: new Set([connector.id]),
        templateProvider: {
            getTemplates: async (_context: IActionContext, selectedLanguage: ProjectLanguage) => {
                requestedLanguages.push(selectedLanguage);
                return [];
            },
        },
        getOutputMetadata: async () => ({ limitation: 'definition-unavailable' }),
        projectCreator: {
            createProject: async (
                _context: IActionContext, template: IProjectTemplate, selectedLanguage: ProjectLanguage,
                _projectPath: string, options: ConnectorProjectCreationOptions,
            ) => {
                calls.push({ template, language: selectedLanguage, options });
                if (failFirst && calls.length === 1) {
                    throw new Error('Synthetic creation failure');
                }
            },
        },
    });
    return { controller, calls, requestedLanguages };
}
