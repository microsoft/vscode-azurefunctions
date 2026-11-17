/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Environment } from '@azure/ms-rest-azure-env';
import { createSubscriptionContext, createTestActionContext, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
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
import { ConnectorTriggerDataClient } from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient';
import { ProjectLanguage } from '../../src/constants';
import { getConnectorTriggerSelections, isConnectorTriggerSelections } from '../../src/connectorTrigger/connectorTriggerSelection';
import { type IProjectTemplate } from '../../src/templates/projectTemplates/IProjectTemplate';
import { ConnectorEventStep } from '../../src/webview/connectorTriggerPicker/ConnectorEventStep';
import { getSubscriptionSelectionAfterRefresh } from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerView';
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
        const projectPath = vscode.Uri.file(path.resolve('selected-connector-project')).fsPath;
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
        const opaqueOptions = [{ id: 'subscription-0', label: 'First (Account A)', displayId: 'azure-subscription' }];
        assert.deepStrictEqual(filterSubscriptionOptions(opaqueOptions, 'azure-subscription', ''), opaqueOptions);
        assert.deepStrictEqual(filterSubscriptionOptions(opaqueOptions, 'subscription-0', ''), []);
    });

    test('does not silently select another account when the selected option disappears', () => {
        const subscriptions = [{ id: 'account-a', label: 'Shared subscription' }];
        assert.strictEqual(getSubscriptionSelectionAfterRefresh(subscriptions, ''), 'account-a');
        assert.strictEqual(getSubscriptionSelectionAfterRefresh(subscriptions, 'account-a'), undefined);
        assert.strictEqual(getSubscriptionSelectionAfterRefresh(subscriptions, 'account-b'), '');
    });

    test('preserves the selected account through regions, catalog, events, and project creation', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls } = createCreationHost(responses, ProjectLanguage.Python);
        const first = createPickerSubscription('account-a', 'Account A');
        const second = createPickerSubscription('account-b', 'Account B');
        const usedAccounts: string[] = [];
        const client = new ConnectorTriggerDataClient(
            async () => [first, second].map(subscription => ({
                subscriptionId: subscription.subscriptionId, subscriptionDisplayName: subscription.subscriptionDisplayName, context: subscription,
            })),
            async context => {
                usedAccounts.push(pickerAccountId(context));
                return { get: async (url: string) => new URL(url).searchParams.get('export') === 'true' ?
                    { properties: { swagger: { paths: { '/poll': { get: { operationId: 'FirstEvent', 'x-ms-trigger': 'single' } } } } } } :
                    { value: [{ name: connector.id, properties: { displayName: connector.label } }] } };
            },
            async context => {
                usedAccounts.push(pickerAccountId(context));
                return [{ id: 'westcentralus', name: 'westcentralus', displayName: 'West Central US' }];
            },
        );
        Object.assign(controller, { dataClient: client });
        const context = await createTestActionContext();

        await controller.handleMessage({ command: 'initialize' }, context);
        const loaded = responses.find(response => response.command === 'subscriptionsLoaded');
        assert.ok(loaded && loaded.command === 'subscriptionsLoaded');
        assert.notStrictEqual(loaded.subscriptions[0].id, loaded.subscriptions[1].id);
        assert.deepStrictEqual(loaded.subscriptions.map(option => option.label), ['Shared subscription (Account A)', 'Shared subscription (Account B)']);
        const selected = loaded.subscriptions[1].id;
        await controller.handleMessage({ command: 'selectSubscription', subscriptionId: selected }, context);
        await controller.handleMessage({ command: 'selectRegion', subscriptionId: selected, region: 'westcentralus' }, context);
        const selectedResponse = responses.find(response => response.command === 'azureContextSelected');
        assert.ok(selectedResponse && selectedResponse.command === 'azureContextSelected');
        assert.strictEqual(selectedResponse.subscriptionId, selected);
        assert.strictEqual(selectedResponse.azureContext.subscriptionId, 'shared-subscription');
        assert.ok(!JSON.stringify(selectedResponse).includes('account-b'));
        await controller.handleMessage({ command: 'loadConnectorOperations', connectorId: connector.id }, context);
        await context.ui.runWithInputs([], async () => await controller.handleMessage({
            command: 'continue', language: 'python', deliveryMode: 'poll', connectorId: connector.id, operationIds: ['FirstEvent'],
        }, context));

        assert.deepStrictEqual(usedAccounts, ['account-b', 'account-b', 'account-b']);
        assert.strictEqual(calls[0].options.azureContext?.accountId, 'account-b');
        assert.strictEqual(calls[0].options.azureContext?.tenantId, 'tenant-b');
        assert.ok(context.valuesToMask.includes('account-b') && context.valuesToMask.includes('Account B'));
        assert.doesNotMatch(JSON.stringify(context.telemetry.properties), /account-b|tenant-b/);

        await controller.handleMessage({ command: 'loadAllSubscriptions' }, context);
        const refreshed = responses.filter(response => response.command === 'subscriptionsLoaded').at(-1);
        assert.ok(refreshed && refreshed.command === 'subscriptionsLoaded');
        assert.strictEqual(refreshed.subscriptions[1].id, selected);
    });

    test('ignores a stale account region result and rejects unavailable selections', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const controller = createHost(responses);
        const first = createPickerSubscription('account-a', 'Account A');
        const second = createPickerSubscription('account-b', 'Account B');
        let finishFirst: (() => void) | undefined;
        const firstRequest = new Promise<void>(resolve => { finishFirst = resolve; });
        controller.dataClient.listSubscriptionContexts = async () => [first, second];
        controller.dataClient.listLocationsForSubscription = async (_context, subscription) => {
            if (subscription === first) {
                await firstRequest;
            }
            return [{ name: 'westcentralus', label: 'West Central US' }];
        };
        const context = await createTestActionContext();
        await controller.handleMessage({ command: 'initialize' }, context);
        const loaded = responses.find(response => response.command === 'subscriptionsLoaded');
        assert.ok(loaded && loaded.command === 'subscriptionsLoaded');
        const [firstOption, secondOption] = loaded.subscriptions;
        const pending = controller.handleMessage({ command: 'selectSubscription', subscriptionId: firstOption.id }, context);
        await controller.handleMessage({ command: 'selectSubscription', subscriptionId: secondOption.id }, context);
        finishFirst!();
        await pending;
        assert.deepStrictEqual(responses.filter(response => response.command === 'locationsLoaded').map(response => response.subscriptionId), [secondOption.id]);
        await controller.handleMessage({ command: 'selectRegion', subscriptionId: firstOption.id, region: 'westcentralus' }, context);
        assert.strictEqual(responses.at(-1)?.command, 'loadFailed');
        await controller.handleMessage({ command: 'selectSubscription', subscriptionId: 'missing' }, context);
        assert.strictEqual(responses.at(-1)?.command, 'loadFailed');
    });

    test('does not reuse an ambiguous account option when a duplicate disappears', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const controller = createHost(responses);
        const first = createPickerSubscription('account-a', 'Account A');
        const second = createPickerSubscription('account-b', 'Account B');
        Object.assign(first, { tenantId: 'shared-tenant', account: { label: 'Account A' } });
        Object.assign(second, { tenantId: 'shared-tenant', account: { label: 'Account B' } });
        controller.dataClient.listSubscriptionContexts = async showAll => showAll ? [second] : [first, second];
        const context = await createTestActionContext();
        await controller.handleMessage({ command: 'initialize' }, context);
        const original = responses.at(-1);
        assert.ok(original && original.command === 'subscriptionsLoaded');
        await controller.handleMessage({ command: 'loadAllSubscriptions' }, context);
        const refreshed = responses.at(-1);
        assert.ok(refreshed && refreshed.command === 'subscriptionsLoaded');
        assert.ok(original.subscriptions.every(option => option.id !== refreshed.subscriptions[0].id));
        assert.strictEqual(getSubscriptionSelectionAfterRefresh(refreshed.subscriptions, original.subscriptions[0].id), '');
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
        assert.ok(!html.includes('class="search-field"'));
        assert.match(html, /<button[^>]*disabled=""[^>]*>Create functions/);
    });

    test('disables creation with no selection or while a creation is running', () => {
        assert.match(renderEvents([]), /<button[^>]*disabled=""[^>]*>Create functions/);
        const html = renderEvents(['FirstEvent'], true);
        assert.strictEqual((html.match(/type="checkbox"[^>]*disabled=""/g) ?? []).length, 3);
    });

    test('does not show a project location on the events step', () => {
        const html = renderEvents(['FirstEvent']);
        assert.doesNotMatch(html, /Project location/);
        assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Create functions/);
    });

    test('Browse picks the project location that creation uses', async () => {
        const responses: ConnectorTriggerPickerResponse[] = [];
        const { controller, calls } = createCreationHost(responses, ProjectLanguage.Python, undefined);
        const chosenPath = vscode.Uri.file('/chosen-connector-project').fsPath;
        const browseContext = await createTestActionContext();

        await browseContext.ui.runWithInputs([chosenPath], async () =>
            await controller.handleMessage({ command: 'selectProjectFolder' }, browseContext));
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
        controller.dataClient.listSubscriptionContexts = async () => await request;
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
): string {
    return renderToStaticMarkup(createElement(ConnectorEventStep, {
        connector, labels: createConnectorTriggerPickerViewModel().labels, operations: eventOperations, selectedOperationIds,
        projectCreating, operationsError: '', operationsLoading: false, projectCreationDetail: '', projectCreationError: '',
        templateUnavailable: false,
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
        subscriptionOptions: new Map(), nextSubscriptionOptionId: 0,
        postMessage: async (message: ConnectorTriggerPickerResponse) => { responses.push(message); },
    }) as HostHarness;
}

function createPickerSubscription(accountId: string, label: string): ISubscriptionContext {
    return Object.assign(createSubscriptionContext({
        subscriptionId: 'shared-subscription', name: 'Shared subscription', tenantId: `tenant-${accountId.at(-1)}`,
        environment: Environment.AzureCloud, isCustomCloud: false,
        authentication: {
            getSession: () => assert.fail('Unexpected authentication.'),
            getSessionWithScopes: () => assert.fail('Unexpected authentication.'),
        },
    }), { account: { id: accountId, label } });
}

function pickerAccountId(subscription: ISubscriptionContext): string {
    return (subscription as ISubscriptionContext & { account: { id: string } }).account.id;
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
