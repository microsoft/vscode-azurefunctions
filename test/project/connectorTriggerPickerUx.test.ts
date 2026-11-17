/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { createRequire } from 'module';
import * as path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as vscode from 'vscode';
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
import { AzureContextFields, filterSubscriptionOptions, partitionConnectorLocations, selectSubscriptionOption } from '../../src/webview/AzureContextFields';
import {
    isConnectorTriggerPickerMessage, type ConnectorTriggerOperationOption, type ConnectorTriggerPickerResponse,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';

const connector = { id: 'office365', label: 'Office 365 Outlook' };
const pollCSharp = { language: 'dotnet', deliveryMode: 'poll' };
const operations: ConnectorTriggerOperationOption[] = [
    { id: 'FirstEvent', connectorId: connector.id, label: 'First event', isWebhook: false, isNotification: true },
    { id: 'SecondEvent', connectorId: connector.id, label: 'Second event', isWebhook: false, isNotification: true },
    { id: 'Webhook', connectorId: connector.id, label: 'Webhook event', isWebhook: true, isNotification: false },
];

suite('Connector trigger picker multi-event UX', () => {
    test('places sign-in guidance between the subscription dropdown and region only while sign-in is required', () => {
        const message = 'Azure sign-in, a subscription, and a region are required.';
        for (const signInRequired of [true, false]) {
            const html = renderToStaticMarkup(createElement(AzureContextFields, {
                labels: createConnectorTriggerPickerViewModel().labels,
                subscriptions: [], locations: [], selectedSubscriptionId: '', selectedRegion: '',
                subscriptionsLoading: false, locationsLoading: false, signInRequired, signInMessage: message,
                onRequestSignIn: () => undefined, onSelectSubscription: () => undefined, onSelectRegion: () => undefined,
            }));
            if (signInRequired) {
                assert.ok(html.indexOf('role="combobox"') < html.indexOf(message));
                assert.ok(html.indexOf(message) < html.indexOf('<select'));
                assert.ok(html.includes(`role="status">${message}</span></div>`));
            } else {
                assert.ok(!html.includes(message));
            }
        }
    });

    test('selects a workspace from the Connectors step and uses it for creation', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls } = createCreationHost(responses, ProjectLanguage.TypeScript);
        const context = await createTestActionContext();
        const projectPath = Uri.file(path.resolve('selected-connector-project')).fsPath;
        await context.ui.runWithInputs([projectPath], async () =>
            await controller.handleMessage({ command: 'selectProjectFolder' }, context));
        assert.deepStrictEqual(responses, [{ command: 'projectFolderSelected', projectPath }]);
        await controller.handleMessage({ command: 'continue', connectorId: connector.id, operationIds: ['FirstEvent'], ...pollCSharp }, context);
        assert.strictEqual(calls[0].projectPath, projectPath);
    });

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

    test('filters subscriptions and keeps recommended regions ahead of other regions', () => {
        const subscriptions = [{ id: 'one', label: 'First' }, { id: 'two', label: 'Second' }];
        assert.deepStrictEqual(filterSubscriptionOptions(subscriptions, 'two', ''), [subscriptions[1]]);
        assert.deepStrictEqual(filterSubscriptionOptions(subscriptions, 'First', 'one'), subscriptions);
        const locations = [
            { name: 'other', label: 'Other' },
            { name: 'recommended', label: 'Recommended', regionCategory: 'Recommended' },
        ];
        assert.deepStrictEqual(partitionConnectorLocations(locations), {
            recommended: [locations[1]], other: [locations[0]],
        });
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
        const continueFields = { language: 'dotnet', deliveryMode: 'poll' };
        assert.ok(isConnectorTriggerPickerMessage({ command: 'continue', ...continueFields, ...single }));
        assert.ok(isConnectorTriggerPickerMessage({ command: 'continue', ...continueFields, ...batch }));
        assert.ok(isConnectorTriggerPickerMessage({ command: 'continue', language: 'python', deliveryMode: 'webhook', ...batch }));
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'continue', ...batch }), false);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'continue', language: 'python', ...batch }), false);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'continue', language: 'python', deliveryMode: 'push', ...batch }), false);
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
            assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'continue', language: 'dotnet', deliveryMode: 'poll', ...selection }), false);
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
            activeStep: 2, connectorId: connector.id, operationIds: ['SecondEvent', 'Webhook'], selectionUnavailable: true,
        });
        assert.deepStrictEqual(reconcileConnectorTriggerSelection({
            activeStep: 2, connectorId: connector.id, operationIds: ['Webhook'],
        }, [connector], operations), {
            activeStep: 2, connectorId: connector.id, operationIds: ['Webhook'], selectionUnavailable: false,
        });
        assert.deepStrictEqual(reconcileConnectorTriggerSelection({
            activeStep: 2, connectorId: connector.id, operationIds: ['FirstEvent'],
        }, [], operations), {
            activeStep: 1, connectorId: '', operationIds: [], selectionUnavailable: true,
        });
    });

    test('renders selectable webhook and polling events together', () => {
        const html = renderEvents(['FirstEvent', 'Webhook']);
        assert.strictEqual((html.match(/type="checkbox"/g) ?? []).length, 3);
        assert.strictEqual((html.match(/checked=""/g) ?? []).length, 2);
        assert.doesNotMatch(html, /aria-label="Webhook event"[^>]*disabled=""|disabled=""[^>]*aria-label="Webhook event"/);
        assert.ok(html.includes('Webhook event'));
        assert.ok(!/<button[^>]*disabled=""[^>]*>Create functions/.test(html));
    });

    test('disables creation and hides selection controls when a connector has no triggers', () => {
        const html = renderEvents([], false, []);
        assert.ok(!html.includes('type="checkbox"'));
        assert.doesNotMatch(html, /<input/);
        assert.match(html, /<button[^>]*disabled=""[^>]*>Create functions/);
    });

    test('disables creation with no selection or while a creation is running', () => {
        assert.match(renderEvents([]), /<button[^>]*disabled=""[^>]*>Create functions/);
        const html = renderEvents(['FirstEvent'], true);
        assert.strictEqual((html.match(/type="checkbox"[^>]*disabled=""/g) ?? []).length, 3);
    });

    test('shows the project location and requires one before creating', () => {
        const withLocation = renderEvents(['FirstEvent']);
        assert.ok(withLocation.includes('Project location'));
        assert.match(withLocation, /value="test-project"/);
        assert.doesNotMatch(withLocation, /<button[^>]*disabled=""[^>]*>Create functions/);
        assert.match(renderEvents(['FirstEvent'], false, operations, ''), /<button[^>]*disabled=""[^>]*>Create functions/);
    });

    test('Browse picks the project location that creation uses', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls } = createCreationHost(responses, ProjectLanguage.Python, undefined);
        const chosenPath = vscode.Uri.file('/chosen-connector-project').fsPath;
        const browseContext = await createTestActionContext();

        await browseContext.ui.runWithInputs([chosenPath], async () =>
            await controller.handleMessage({ command: 'browseProjectLocation' }, browseContext));
        assert.deepStrictEqual(responses, [{ command: 'projectFolderSelected', projectPath: chosenPath }]);

        const createContext = await createTestActionContext();
        await createContext.ui.runWithInputs([], async () => await controller.handleMessage({
            command: 'continue', language: 'python', deliveryMode: 'poll',
            connectorId: connector.id, operationIds: ['FirstEvent'],
        }, createContext));
        assert.strictEqual(calls[0].projectPath, chosenPath);
    });

    test('ignores malformed and duplicate messages throughout an in-flight creation', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const controller = createHost(responses);
        let finish: (() => void) | undefined;
        const creation = new Promise<void>(resolve => { finish = resolve; });
        let calls = 0;
        controller.createSelectedProject = async () => { calls++; await creation; };
        const pending = controller.handleMessage({ command: 'continue', ...pollCSharp, connectorId: connector.id, operationIds: ['FirstEvent'] },
            await createTestActionContext());
        await controller.handleMessage({ command: 'continue', ...pollCSharp, connectorId: connector.id, operationIds: [] }, await createTestActionContext());
        await controller.handleMessage({ command: 'continue', ...pollCSharp, connectorId: connector.id, operationId: 'SecondEvent' }, await createTestActionContext());
        assert.strictEqual(calls, 1);
        assert.deepStrictEqual(responses, []);
        finish!();
        await pending;
        assert.strictEqual(controller.projectCreationPending, false);
    });

    test('creates the project with the language and webhook delivery chosen in the picker without prompting', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls, requestedLanguages } = createCreationHost(responses);
        const context = await createTestActionContext();

        await context.ui.runWithInputs([], async () => await controller.handleMessage({
            command: 'continue', language: 'python', deliveryMode: 'webhook', connectorId: connector.id, operationIds: ['FirstEvent'],
        }, context));

        assert.deepStrictEqual(requestedLanguages, [ProjectLanguage.Python]);
        assert.strictEqual(calls[0].language, ProjectLanguage.Python);
        assert.strictEqual(calls[0].options.deliveryMode, 'webhook');
        assert.strictEqual(calls[0].options.outputMetadata?.size, 0);
        assert.strictEqual(context.telemetry.properties.deliveryMode, 'Webhook');
        assert.strictEqual(context.telemetry.properties.projectLanguage, ProjectLanguage.Python);
    });

    test('uses the .NET framework selected before opening the picker', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls, requestedLanguages } = createCreationHost(responses, ProjectLanguage.CSharp);
        const context = await createTestActionContext();

        await context.ui.runWithInputs([], async () => await controller.handleMessage({
            command: 'continue', ...pollCSharp, connectorId: connector.id, operationIds: ['FirstEvent'],
        }, context));

        assert.deepStrictEqual(requestedLanguages, [ProjectLanguage.CSharp]);
        assert.strictEqual(calls[0].language, ProjectLanguage.CSharp);
        assert.strictEqual(calls[0].options.targetFramework, 'net8.0');
        assert.strictEqual(calls[0].options.deliveryMode, 'poll');
    });

    test('creates a project with polling and webhook source events using Poll delivery', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls } = createCreationHost(responses, ProjectLanguage.Python);
        const context = await createTestActionContext();

        await context.ui.runWithInputs([], async () => await controller.handleMessage({
            command: 'continue', language: 'python', deliveryMode: 'poll', connectorId: connector.id, operationIds: ['FirstEvent', 'Webhook'],
        }, context));

        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0].options.selection, {
            connectorId: connector.id, operationIds: ['FirstEvent', 'Webhook'],
        });
        assert.strictEqual(context.telemetry.properties.deliveryMode, 'Polling');
        assert.ok(!responses.some(response => response.command === 'projectCreationFailed'));
    });

    test('rejects an unsupported language without creating a project', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls, requestedLanguages } = createCreationHost(responses);
        const context = await createTestActionContext();

        await controller.handleMessage({
            command: 'continue', language: 'java', deliveryMode: 'poll', connectorId: connector.id, operationIds: ['FirstEvent'],
        }, context);

        assert.deepStrictEqual(calls, []);
        assert.deepStrictEqual(requestedLanguages, []);
        assert.strictEqual(responses.at(-1)?.command, 'projectCreationFailed');
        assert.strictEqual(context.telemetry.properties.result, 'Failed');
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
    projectLocation = 'test-project',
): string {
    return renderToStaticMarkup(createElement(ConnectorEventStep, {
        connector, labels: createConnectorTriggerPickerViewModel().labels, operations: eventOperations, selectedOperationIds,
        projectCreating, operationsError: '', operationsLoading: false, projectCreationDetail: '', projectCreationError: '',
        projectLocation, templateUnavailable: false, onBrowseProjectLocation: () => undefined,
        onChangeConnector: () => undefined, onRetryOperations: () => undefined,
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

function createCreationHost(
    responses: ConnectorTriggerPickerResponse[], language?: ProjectLanguage, initialLocation: string | undefined = 'test-project',
): {
    controller: HostHarness;
    calls: { template: IProjectTemplate; language: ProjectLanguage; projectPath: string; options: ConnectorProjectCreationOptions }[];
    requestedLanguages: ProjectLanguage[];
} {
    const controller = createHost(responses);
    const calls: { template: IProjectTemplate; language: ProjectLanguage; projectPath: string; options: ConnectorProjectCreationOptions }[] = [];
    const requestedLanguages: ProjectLanguage[] = [];
    Object.assign(controller, {
        launchOptions: {
            language, initialLocation, initialFilters: {},
            targetFramework: language === ProjectLanguage.CSharp ? 'net8.0' : undefined,
        },
        subscriptionContext: {
            subscriptionId: 'synthetic', tenantId: 'synthetic', environment: { name: 'AzureCloud' },
        },
        catalog: { connectors: [{ ...connector }], operations },
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
                projectPath: string, options: ConnectorProjectCreationOptions,
            ) => {
                calls.push({ template, language: selectedLanguage, projectPath, options });
            },
        },
    });
    return { controller, calls, requestedLanguages };
}
