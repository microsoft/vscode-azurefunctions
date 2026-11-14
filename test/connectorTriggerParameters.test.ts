/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type * as vscode from 'vscode';
import { type ConnectorTriggerAuthoringContext } from '../src/connectorTrigger/connectorTriggerSelection';
import { ConnectorTriggerParameterForm } from '../src/debug/connectorNamespace/ConnectorTriggerParameterForm';
import { ConnectorTriggerSetupController, createConnectorTriggerParametersViewModel } from '../src/debug/connectorNamespace/ConnectorTriggerSetupController';
import { ConnectorTriggerSetupForm, createConnectorTriggerSetupViewModel } from '../src/debug/connectorNamespace/ConnectorTriggerSetupForm';
import {
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerInputOption,
    type ConnectorTriggerOperationResolver,
    type ConnectorTriggerParameterRequest,
    type ConnectorTriggerSetupRequest,
    type ConnectorTriggerGateway,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerSetupScopes,
} from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { ConnectorTriggerSetupPage } from '../src/webview/connectorTriggerParameters/ConnectorTriggerSetupView';
import {
    applyConnectorSetupAction,
    isConnectorSetupMessage,
    type ConnectorSetupAction,
    type ConnectorSetupResourceState,
} from '../src/webview/connectorTriggerParameters/ConnectorTriggerSetupViewModel';
import {
    isConnectorParameterMessage,
    type ConnectorParameterAction,
    type ConnectorParameterFormState,
} from '../src/webview/connectorTriggerParameters/ConnectorTriggerParametersViewModel';

suite('Connector Trigger parameter webview', () => {
    test('keeps API metadata and option IDs host-side and applies only an explicit valid selection', async () => {
        const fixture = await createForm([folderInput()], async () => [
            { label: 'Inbox', value: 'real-folder-id', hasChildren: true, metadata: { Id: 'navigation-id', private: 'host-only' } },
        ]);
        await fixture.initialize();
        const field = fixture.field('folder');
        assert.strictEqual(fixture.form.state.canSubmit, false);
        assert.doesNotMatch(JSON.stringify(fixture.form.state), /real-folder-id|navigation-id|host-only|private-endpoint/);
        assert.strictEqual(await fixture.send({ command: 'submit' }), undefined);
        assert.strictEqual(await fixture.send({ command: 'edit', name: 'folder', text: 'forged-folder-id' }), undefined);
        assert.match(fixture.field('folder').error ?? '', /select.*current value/i);
        await fixture.send({ command: 'select', name: 'folder', optionIds: [field.options[0].id] });
        assert.strictEqual(fixture.form.state.canSubmit, true);
        assert.deepStrictEqual(await fixture.send({ command: 'submit' }), { folder: 'real-folder-id' });
        assert.ok(fixture.context.valuesToMask.includes('real-folder-id'));
        assert.ok(fixture.context.valuesToMask.includes('Inbox'));
        assert.doesNotMatch(JSON.stringify(fixture.context.telemetry.properties), /real-folder-id|Inbox/);
    });

    test('uses separate tree navigation and selection and restores cached parents on Back', async () => {
        const parents: unknown[] = [];
        const fixture = await createForm([folderInput()], async request => {
            parents.push(request.parent?.metadata);
            return request.parent ? [
                { label: 'Projects', value: '/mail/Inbox/Projects', hasChildren: false, selectable: true },
            ] : [{
                label: 'Inbox',
                value: '/mail/Inbox',
                hasChildren: true,
                selectable: false,
                metadata: { Id: 'browse-id' },
            }];
        });
        await fixture.initialize();
        const inbox = fixture.field('folder').options[0];
        await fixture.send({ command: 'select', name: 'folder', optionIds: [inbox.id] });
        assert.strictEqual(fixture.form.state.canSubmit, false);
        await fixture.send({ command: 'browse', name: 'folder', optionId: inbox.id });
        assert.deepStrictEqual(parents, [undefined, { Id: 'browse-id' }]);
        assert.strictEqual(fixture.field('folder').parent?.selectable, false);
        const projects = fixture.field('folder').options[0];
        await fixture.send({ command: 'back', name: 'folder' });
        assert.strictEqual(fixture.field('folder').canGoBack, false);
        assert.strictEqual(fixture.field('folder').options[0].id, inbox.id);
        await fixture.send({ command: 'browse', name: 'folder', optionId: inbox.id });
        assert.notStrictEqual(fixture.field('folder').options[0].id, projects.id);
        await fixture.send({ command: 'select', name: 'folder', optionIds: [fixture.field('folder').options[0].id] });
        assert.deepStrictEqual(await fixture.send({ command: 'submit' }), { folder: '/mail/Inbox/Projects' });
    });

    test('waits for valid dependencies and discards late results after upstream edits', async () => {
        let finishOld: ((options: ConnectorTriggerInputOption[]) => void) | undefined;
        const calls: unknown[] = [];
        const fixture = await createForm([
            { name: 'mailbox', label: 'Mailbox', type: 'string', required: false },
            { ...folderInput(), dynamic: { kind: 'values', dependsOn: ['mailbox'], metadata: {} } },
        ], async request => {
            calls.push(request.values.mailbox);
            return request.values.mailbox === 'old' ? await new Promise(resolve => { finishOld = resolve; }) :
                [{ label: 'Current folder', value: `${String(request.values.mailbox)}-id` }];
        });
        await fixture.initialize();
        assert.deepStrictEqual(calls, []);
        assert.strictEqual(fixture.field('mailbox').required, true);
        assert.deepStrictEqual(fixture.field('folder').dependencyLabels, ['Mailbox']);
        const old = fixture.send({ command: 'edit', name: 'mailbox', text: 'old' });
        await fixture.send({ command: 'edit', name: 'mailbox', text: 'new' });
        assert.ok(finishOld);
        finishOld([{ label: 'Stale folder', value: 'stale-id' }]);
        await old;
        assert.deepStrictEqual(fixture.field('folder').options.map(option => option.label), ['Current folder']);
        const optionId = fixture.field('folder').options[0].id;
        await fixture.send({ command: 'select', name: 'folder', optionIds: [optionId] });
        assert.deepStrictEqual(await fixture.send({ command: 'submit' }), { mailbox: 'new', folder: 'new-id' });
        await fixture.send({ command: 'edit', name: 'mailbox', text: 'changed' });
        assert.deepStrictEqual(fixture.field('folder').selected, []);
        await fixture.send({ command: 'select', name: 'folder', optionIds: [optionId] });
        assert.match(fixture.field('folder').error ?? '', /current value/i);
        assert.strictEqual(await fixture.send({ command: 'submit' }), undefined);
    });

    test('reload invalidates a pending browse and closing discards outstanding replies', async () => {
        let finishBrowse: ((options: ConnectorTriggerInputOption[]) => void) | undefined;
        const fixture = await createForm([folderInput()], async request => request.parent ?
            await new Promise(resolve => { finishBrowse = resolve; }) :
            [{ label: 'Inbox', value: 'inbox-id', hasChildren: true }]);
        await fixture.initialize();
        const browse = fixture.send({ command: 'browse', name: 'folder', optionId: fixture.field('folder').options[0].id });
        await fixture.send({ command: 'reload', name: 'folder' });
        assert.ok(finishBrowse);
        finishBrowse([{ label: 'Late child', value: 'late-id' }]);
        await browse;
        assert.strictEqual(fixture.field('folder').parent, undefined);
        assert.deepStrictEqual(fixture.field('folder').options.map(option => option.label), ['Inbox']);

        const pending = fixture.send({ command: 'browse', name: 'folder', optionId: fixture.field('folder').options[0].id });
        fixture.form.dispose();
        const changesBeforeReply = fixture.changes.length;
        finishBrowse([{ label: 'Discarded child', value: 'discarded-id' }]);
        await pending;
        assert.strictEqual(fixture.changes.length, changesBeforeReply);
        assert.strictEqual(await fixture.send({ command: 'submit' }), undefined);
    });

    test('surfaces safe API errors inline and reloads without losing unrelated text', async () => {
        let fail = true;
        const fixture = await createForm([
            { name: 'note', label: 'Note', type: 'string', required: true },
            folderInput(),
        ], async () => {
            if (fail) {
                throw new Error('private-endpoint secret-response-value');
            }
            return [{ label: 'Inbox', value: 'inbox-id' }];
        });
        await fixture.initialize();
        assert.strictEqual(fixture.field('folder').status, 'error');
        assert.match(fixture.field('folder').error ?? '', /could not load choices/i);
        assert.doesNotMatch(JSON.stringify(fixture.form.state), /secret-response-value|private-endpoint/);
        await fixture.send({ command: 'edit', name: 'note', text: 'keep-note' });
        fail = false;
        await fixture.send({ command: 'reload', name: 'folder' });
        assert.strictEqual(fixture.field('note').text, 'keep-note');
        await fixture.send({ command: 'select', name: 'folder', optionIds: [fixture.field('folder').options[0].id] });
        assert.deepStrictEqual(await fixture.send({ command: 'submit' }), { note: 'keep-note', folder: 'inbox-id' });
        assert.strictEqual(fixture.context.telemetry.properties.connectorF5ParameterLoadResult, 'failed');
    });

    test('blocks empty required choices but permits omitting an optional empty list', async () => {
        const fixture = await createForm([folderInput(), { ...folderInput(), name: 'optional', required: false }], async () => []);
        await fixture.initialize();
        assert.match(fixture.field('folder').error ?? '', /no values.*required parameter/i);
        assert.strictEqual(fixture.field('optional').error, undefined);
        assert.strictEqual(await fixture.send({ command: 'submit' }), undefined);
        const optional = await createForm([{ ...folderInput(), required: false }], async () => []);
        await optional.initialize();
        assert.deepStrictEqual(await optional.send({ command: 'submit' }), {});
    });

    test('validates typed text and preserves false, zero, objects, arrays, and enum numbers', async () => {
        const fixture = await createForm([
            { name: 'count', label: 'Count', type: 'integer', required: true },
            { name: 'enabled', label: 'Enabled', type: 'boolean', required: true },
            { name: 'score', label: 'Score', type: 'number', required: true, options: [{ label: 'Half', value: 0.5 }] },
            { name: 'object', label: 'Object', type: 'object', required: true, sensitive: true },
            { name: 'array', label: 'Array', type: 'array', required: true },
        ]);
        await fixture.initialize();
        await fixture.send({ command: 'edit', name: 'count', text: '1.2' });
        assert.match(fixture.field('count').error ?? '', /whole number/i);
        await fixture.send({ command: 'edit', name: 'count', text: '0' });
        await fixture.send({ command: 'edit', name: 'object', text: '[]' });
        assert.match(fixture.field('object').error ?? '', /JSON object/i);
        await fixture.send({ command: 'edit', name: 'object', text: '{"key":"masked-value"}' });
        await fixture.send({ command: 'edit', name: 'array', text: '[1,false]' });
        await fixture.send({ command: 'select', name: 'enabled', optionIds: [fixture.field('enabled').options[1].id] });
        await fixture.send({ command: 'select', name: 'score', optionIds: [fixture.field('score').options[0].id] });
        assert.deepStrictEqual(await fixture.send({ command: 'submit' }), {
            count: 0, object: { key: 'masked-value' }, array: [1, false], enabled: false, score: 0.5,
        });
        assert.ok(fixture.context.valuesToMask.includes('{"key":"masked-value"}'));
    });

    test('does not turn user cancellation into an API failure', async () => {
        const fixture = await createForm([folderInput()], async () => { throw new UserCancelledError(); });
        await assert.rejects(fixture.initialize(), error => error instanceof UserCancelledError);
        assert.strictEqual(fixture.context.telemetry.properties.connectorF5ParameterLoadResult, undefined);
    });

    test('validates message revisions and ignores duplicate selection or submission requests', async () => {
        for (const message of [
            { command: 'edit', name: 'text', text: 'value' },
            { command: 'submit', revision: -1 },
            { command: 'browse', revision: 1, name: 'folder', optionId: {} },
            { command: 'select', revision: 1, name: 'folder', optionIds: ['valid', 42] },
        ]) {
            assert.strictEqual(isConnectorParameterMessage(message), false);
        }
        const fixture = await createForm([folderInput()], async () => [{ label: 'Inbox', value: 'inbox-id' }]);
        await fixture.initialize();
        await fixture.form.handleMessage({ command: 'select', revision: 2, name: 'folder', optionIds: [fixture.field('folder').options[0].id] });
        await fixture.form.handleMessage({ command: 'select', revision: 1, name: 'folder', optionIds: [] });
        assert.strictEqual(fixture.form.state.canSubmit, true);
        assert.strictEqual(await fixture.form.handleMessage({ command: 'submit', revision: 2 }), undefined);
        assert.deepStrictEqual(await fixture.form.handleMessage({ command: 'submit', revision: 3 }), { folder: 'inbox-id' });
    });

    test('renders gallery styling, authenticated context, accessible fields, errors and explicit Apply', async () => {
        const fixture = await createForm([folderInput()], async () => []);
        await fixture.initialize();
        const setup = await createSetupForm();
        await setup.initialize();
        await setup.send({ command: 'approveSetup' });
        setup.form.setStatus('parameters');
        const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
            viewModel: createConnectorTriggerSetupViewModel(setup.request),
            resources: setup.form.state,
            parameterModel: createConnectorTriggerParametersViewModel(fixture.request),
            parameters: fixture.form.state,
            sendResource: () => undefined,
            sendParameter: () => undefined,
            cancel: () => undefined,
        }));
        assert.match(html, /gallery-header/);
        assert.strictEqual((html.match(/<h1>/g) ?? []).length, 1);
        assert.match(html, /id="setup-namespace" disabled=""/);
        assert.match(html, /Resource choices are locked/);
        assert.match(html, /Authenticated/);
        assert.match(html, /Office 365 Outlook/);
        assert.match(html, /When a new email arrives/);
        assert.match(html, /role="alert"/);
        assert.match(html, /type="submit" disabled=""[^>]*>Apply and continue/);
        assert.match(html, /Reload choices/);
        assert.match(html, /Cancel setup/);
        assert.doesNotMatch(html, /private-endpoint/);
    });

    test('renders editable resource fields and read-only computed settings before authentication', async () => {
        const fixture = await createSetupForm();
        await fixture.initialize();
        const viewModel = createConnectorTriggerSetupViewModel(fixture.request);
        assert.deepStrictEqual(viewModel.localSettings.map(setting => setting.action), ['Add key', 'Set existing key']);
        const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
            viewModel, resources: fixture.form.state,
            sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
        }));
        assert.match(html, /gallery-header/);
        assert.match(html, /Fixture subscription/);
        assert.match(html, /setup-subscription/);
        assert.match(html, /setup-region/);
        assert.match(html, /fixture-tenant/);
        assert.match(html, /OnNewEmailV3/);
        assert.doesNotMatch(html, /Planned changes|planned changes|<details/);
        assert.doesNotMatch(html, /subscription-\d+/);
        assert.strictEqual((html.match(/class="setup-review-table"/g) ?? []).length, 1);
        assert.match(html, /authorizes the namespace runtime and connection developer identities/);
        assert.match(html, /CustomConnection__pollingEndpoint/);
        assert.match(html, /CustomTriggerConfig/);
        assert.match(html, /environment variable overrides this key/i);
        assert.match(html, /Not available until setup completes/);
        assert.match(html, /scope="col"/);
        assert.match(html, /Set up and authenticate/);
        assert.match(html, /id="setup-namespaceName"/);
        assert.match(html, /id="setup-connectionName"/);
        assert.match(html, /id="setup-resourceGroupName"/);
        assert.match(html, /id="setup-namespace"/);
        assert.match(html, /id="setup-connection"/);
        assert.match(html, /account-specific choices here/);
        assert.doesNotMatch(html, /type="submit"/);
        assert.match(html, /Cancel setup/);
        assert.doesNotMatch(html, /https:\/\/management|receiveUri|consent\?/);
        assert.doesNotMatch(html, /<input[^>]*(?:CustomTriggerConfig|pollingEndpoint)/);
    });

    test('reuses searchable Azure context fields without a permanent sign-in button while signed out or authenticated', async () => {
        for (const subscriptions of [[], [{ id: 'opaque-subscription', label: 'Authenticated subscription' }]]) {
            const fixture = await createSetupForm(undefined, createSetupScopes({ listSubscriptions: async () => subscriptions }));
            await fixture.initialize(false);
            const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
                viewModel: createConnectorTriggerSetupViewModel(fixture.request), resources: fixture.form.state,
                sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
            }));
            assert.match(html, /class="azure-context-fields"/);
            assert.match(html, /role="combobox"/);
            assert.doesNotMatch(html, /<select[^>]*id="setup-subscription"/);
            assert.doesNotMatch(html, /<button[^>]*>Sign in to Azure/);
            assert.match(html, /id="setup-region"[^>]*disabled/);
            assert.doesNotMatch(html, /Planned changes/);
        }
    });

    test('immediately shows busy approval feedback before receiving a host reply and preserves the resource choices', async () => {
        const fixture = await createSetupForm();
        await fixture.initialize();
        const viewModel = createConnectorTriggerSetupViewModel(fixture.request);
        const before = fixture.form.state;
        const resources = applyConnectorSetupAction(before, { command: 'approveSetup' }, viewModel.labels.provisioning);
        assert.strictEqual(resources.phase, 'provisioning');
        assert.strictEqual(resources.canApprove, false);
        assert.strictEqual(resources.status, viewModel.labels.provisioning);
        assert.deepStrictEqual(resources.names, before.names);
        assert.strictEqual(before.phase, 'resources');
        const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
            viewModel, resources,
            sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
        }));
        assert.match(html, /class="setup-progress" role="status" aria-live="polite"/);
        assert.match(html, /role="progressbar"/);
        assert.match(html, /Setting up the namespace and connector connection/);
        assert.match(html, /aria-busy="true"/);
        assert.match(html, /Working\.\.\./);
        const button = html.match(/<button\b[^>]*class="[^"]*parameter-primary[^"]*"[^>]*>[\s\S]*?<\/button>/)?.[0];
        assert.ok(button);
        assert.match(button, /disabled=""/);
        assert.match(html, /Cancel setup/);
        assert.doesNotMatch(html, /Set up and authenticate<\/button>/);
    });

    test('announces every setup phase, leaves cancellation available and stops spinning when parameters are ready', async () => {
        const fixture = await createSetupForm();
        await fixture.initialize();
        await fixture.send({ command: 'approveSetup' });
        for (const phase of ['provisioning', 'authenticating', 'loadingParameters', 'saving', 'parameters'] as const) {
            fixture.form.setStatus(phase);
            const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
                viewModel: createConnectorTriggerSetupViewModel(fixture.request), resources: fixture.form.state,
                sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
            }));
            assert.ok(html.includes(fixture.form.state.status));
            assert.match(html, /Cancel setup/);
            assert.match(html, /id="setup-namespace" disabled=""/);
            if (phase === 'parameters') {
                assert.doesNotMatch(html, /setup-progress|role="progressbar"|Working\.\.\./);
            } else {
                assert.match(html, /class="setup-progress" role="status"/);
                assert.match(html, /role="progressbar"/);
                assert.match(html, /Working\.\.\./);
            }
        }
    });

    test('shows loading immediately for sign-in and reload without changing the editable phase', async () => {
        const fixture = await createSetupForm();
        await fixture.initialize(false);
        const viewModel = createConnectorTriggerSetupViewModel(fixture.request);
        for (const command of ['signInSetup', 'reloadSetup'] as const) {
            const resources = applyConnectorSetupAction({ ...fixture.form.state, error: 'Previous load failure' }, { command }, viewModel.labels.provisioning);
            assert.strictEqual(resources.loading, true);
            assert.strictEqual(resources.phase, 'resources');
            assert.strictEqual(resources.canApprove, false);
            assert.strictEqual(resources.error, undefined);
            const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
                viewModel, resources,
                sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
            }));
            assert.match(html, /class="setup-progress" role="status"/);
            assert.match(html, /Loading Azure resources/);
        }
    });

    test('carries shared Recommended region metadata without exposing real region IDs', async () => {
        const fixture = await createSetupForm(undefined, createSetupScopes({
            listRegions: async () => [
                { id: 'eastus', label: 'East US', regionCategory: 'Recommended' },
                { id: 'westus', label: 'West US', regionCategory: 'Other' },
            ],
        }));
        await fixture.initialize();
        const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
            viewModel: createConnectorTriggerSetupViewModel(fixture.request), resources: fixture.form.state,
            sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
        }));
        assert.match(html, /<optgroup label="Recommended">.*East US.*<\/optgroup><optgroup label="Other">.*West US/s);
        assert.doesNotMatch(html, /value="eastus"|value="westus"/);
    });
});

suite('Connector Trigger editable setup webview', () => {
    const savedAzureContext = {
        subscriptionId: 'fixture-subscription', accountId: 'account-b',
        tenantId: 'fixture-tenant', environmentName: 'AzureCloud', region: 'westus',
    };

    test('prepopulates the saved authoring account, subscription and supported region while keeping them editable', async () => {
        const lookups: { accountId?: string; region: string }[] = [];
        const fixture = await createSetupForm({
            listNamespaces: async (_context, target) => {
                lookups.push({ accountId: target.subscription.accountId, region: target.region });
                return [];
            },
            listConnections: async () => [],
        }, createSetupScopes({
            listSubscriptions: async () => [
                { id: 'fixture-subscription', label: 'Shared subscription', accountId: 'account-a', accountLabel: 'First account' },
                { id: 'fixture-subscription', label: 'Shared subscription', accountId: 'account-b', accountLabel: 'Second account' },
                { id: 'other-subscription', label: 'Another subscription', accountId: 'account-b' },
            ],
        }), true, savedAzureContext);

        await fixture.initialize(false);

        assert.strictEqual(fixture.form.state.subscriptionId, fixture.form.state.subscriptionOptions[1].id);
        assert.strictEqual(fixture.form.state.regionId, fixture.form.state.regionOptions[1].id);
        assert.strictEqual(fixture.form.state.canApprove, true);
        assert.deepStrictEqual(lookups, [{ accountId: 'account-b', region: 'westus' }]);
        await fixture.send({ command: 'selectSubscription', id: fixture.form.state.subscriptionOptions[2].id });
        assert.strictEqual(fixture.form.state.regionId, '');
        await fixture.send({ command: 'selectRegion', id: fixture.form.state.regionOptions[0].id });
        assert.strictEqual((await fixture.send({ command: 'approveSetup' }))?.target.region, 'eastus');
        assert.doesNotMatch(JSON.stringify(fixture.context.telemetry.properties), /fixture-subscription|account-b|westus|fixture-tenant/);
    });

    for (const mismatch of ['account', 'tenant', 'cloud', 'region'] as const) {
        test(`does not silently apply a saved authoring context with an unavailable ${mismatch}`, async () => {
            let resourceLookups = 0;
            const fixture = await createSetupForm({
                listNamespaces: async () => { resourceLookups++; return []; },
                listConnections: async () => [],
            }, createSetupScopes({
                listSubscriptions: async () => [{
                    id: 'fixture-subscription', label: 'Fixture subscription',
                    accountId: mismatch === 'account' ? 'another-account' : 'account-b',
                }],
                getSubscription: async (_context, { id, accountId }) => ({
                    id, accountId, tenantId: mismatch === 'tenant' ? 'another-tenant' : 'fixture-tenant',
                    environment: {
                        name: mismatch === 'cloud' ? 'AnotherCloud' : 'AzureCloud',
                        resourceManagerEndpointUrl: 'https://management.azure.com/',
                    },
                }),
                listRegions: async () => mismatch === 'region' ? [{ id: 'eastus', label: 'East US' }] :
                    [{ id: 'westus', label: 'West US' }],
            }), true, savedAzureContext);

            await fixture.initialize(false);

            assert.strictEqual(fixture.form.state.regionId, '');
            assert.strictEqual(fixture.form.state.canApprove, false);
            assert.strictEqual(resourceLookups, 0);
            if (mismatch !== 'region') {
                assert.strictEqual(fixture.form.state.subscriptionId, '');
            }
        });
    }

    test('does not guess between accounts when older saved scope has no account identifier', async () => {
        const { accountId: _accountId, ...azureContext } = savedAzureContext;
        const fixture = await createSetupForm(undefined, createSetupScopes({
            listSubscriptions: async () => [
                { id: 'fixture-subscription', label: 'First account', accountId: 'account-a' },
                { id: 'fixture-subscription', label: 'Second account', accountId: 'account-b' },
            ],
            getSubscription: async () => assert.fail('An ambiguous account must not be resolved.'),
        }), true, azureContext);
        await fixture.initialize(false);
        assert.strictEqual(fixture.form.state.subscriptionId, '');
        assert.strictEqual(fixture.form.state.regionId, '');
        assert.strictEqual(fixture.form.state.canApprove, false);
    });

    test('can apply a saved authoring scope when the user shows all subscriptions', async () => {
        const fixture = await createSetupForm(undefined, createSetupScopes({
            listSubscriptions: async (_context, showAll) => showAll ? [{
                id: 'fixture-subscription', label: 'Saved subscription', accountId: 'account-b',
            }] : [],
        }), true, savedAzureContext);
        await fixture.initialize(false);
        assert.strictEqual(fixture.form.state.subscriptionId, '');
        await fixture.send({ command: 'loadAllSubscriptions' });
        assert.strictEqual(fixture.form.state.subscriptionId, fixture.form.state.subscriptionOptions[0].id);
        assert.strictEqual(fixture.form.state.regionId, fixture.form.state.regionOptions[1].id);
        assert.strictEqual(fixture.form.state.canApprove, true);
    });

    test('explicitly associates a metadata-free single event using only selected-connector API metadata', async () => {
        const calls: string[] = [];
        const fixture = await createSetupForm({
            listNamespaces: async (_context, target) => {
                calls.push('namespaces');
                assert.strictEqual(target.connectorId, 'office365');
                assert.strictEqual(target.operationId, 'OnNewEmailV3');
                return [];
            },
            listConnections: async () => [],
        }, createSetupScopes({
            listConnectors: async () => {
                calls.push('connectors');
                return [{ id: 'office365', label: 'Office 365 Outlook' }];
            },
            listEvents: async (_context, _scope, connectorId) => {
                calls.push(`events:${connectorId}`);
                return [{ id: 'OnNewEmailV3', label: 'When a new email arrives (V3)' }];
            },
        }), false);
        await fixture.initialize();
        assert.deepStrictEqual(calls, ['connectors']);
        assert.strictEqual(fixture.form.state.canApprove, false);
        assert.strictEqual(fixture.form.state.connectorId, '');
        assert.strictEqual(fixture.form.state.eventId, '');
        const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
            viewModel: createConnectorTriggerSetupViewModel(fixture.request), resources: fixture.form.state,
            sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
        }));
        assert.match(html, /without a saved connector\/event association/);
        assert.match(html, /id="setup-connector"/);
        assert.match(html, /id="setup-event"/);
        assert.doesNotMatch(html, /id="setup-event-trigger"/);
        const multiEventHtml = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
            viewModel: createConnectorTriggerSetupViewModel({
                ...fixture.request,
                events: {
                    choices: [
                        { id: '0', label: 'OnFlaggedEmailV3', configured: true },
                        { id: '1', label: 'OnNewEmailV3', configured: false },
                    ],
                    selectedId: '1',
                },
            }),
            resources: fixture.form.state,
            sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
            selectSetupEvent: () => undefined,
        }));
        assert.match(multiEventHtml, /<select id="setup-event-trigger"/);
        assert.match(multiEventHtml, /<option value="0" disabled="">OnFlaggedEmailV3 \(configured\)<\/option>/);
        assert.match(multiEventHtml, /<option value="1" selected="">OnNewEmailV3<\/option>/);
        await fixture.send({ command: 'selectConnector', id: fixture.form.state.connectorOptions[0].id });
        assert.deepStrictEqual(calls, ['connectors', 'events:office365']);
        assert.strictEqual(fixture.form.state.canApprove, false);
        await fixture.send({ command: 'selectEvent', id: fixture.form.state.eventOptions[0].id });
        assert.deepStrictEqual(calls, ['connectors', 'events:office365', 'namespaces']);
        assert.strictEqual(fixture.form.state.canApprove, true);
        const plan = await fixture.send({ command: 'approveSetup' });
        assert.strictEqual(plan?.target.connectorId, 'office365');
        assert.strictEqual(plan?.target.operationId, 'OnNewEmailV3');
        assert.strictEqual(fixture.request.metadata, undefined);
        await fixture.send({ command: 'selectConnector', id: fixture.form.state.connectorOptions[0].id });
        assert.match(fixture.form.state.error ?? '', /choices are locked/i);
        assert.deepStrictEqual(calls, ['connectors', 'events:office365', 'namespaces']);
    });

    test('scope changes discard stale event metadata and require a new explicit association', async () => {
        let finishEvents: ((events: { id: string; label: string }[]) => void) | undefined;
        const fixture = await createSetupForm(undefined, createSetupScopes({
            listEvents: async () => await new Promise(resolve => { finishEvents = resolve; }),
        }), false);
        await fixture.initialize();
        const pending = fixture.send({ command: 'selectConnector', id: fixture.form.state.connectorOptions[0].id });
        assert.ok(finishEvents);
        await fixture.send({ command: 'selectRegion', id: fixture.form.state.regionOptions[1].id });
        finishEvents([{ id: 'stale-event', label: 'Stale event' }]);
        await pending;
        assert.strictEqual(fixture.form.state.connectorId, '');
        assert.strictEqual(fixture.form.state.eventId, '');
        assert.deepStrictEqual(fixture.form.state.eventOptions, []);
        assert.strictEqual(fixture.form.state.scopeReady, false);
        assert.strictEqual(fixture.form.state.canApprove, false);
    });

    test('empty or inaccessible event metadata is explicit and cannot approve setup', async () => {
        for (const fails of [false, true]) {
            const fixture = await createSetupForm(undefined, createSetupScopes({
                listEvents: async () => {
                    if (fails) {
                        throw new Error('private-event-response');
                    }
                    return [];
                },
            }), false);
            await fixture.initialize();
            await fixture.send({ command: 'selectConnector', id: fixture.form.state.connectorOptions[0].id });
            assert.strictEqual(fixture.form.state.canApprove, false);
            assert.strictEqual(fixture.form.state.scopeReady, false);
            assert.match(fixture.form.state.error ?? '', fails ? /could not be loaded/i : /no supported polling events/i);
            assert.doesNotMatch(JSON.stringify(fixture.form.state), /private-event-response/);
        }
    });

    test('uses the Azure subscription filter by default, switches lists and preserves a still-visible scope', async () => {
        const modes: boolean[] = [];
        const fixture = await createSetupForm(undefined, createSetupScopes({
            listSubscriptions: async (_context, showAll) => {
                modes.push(showAll);
                return [
                    { id: 'fixture-subscription', label: 'Fixture subscription' },
                    ...(showAll ? [{ id: 'hidden-subscription', label: 'Hidden subscription' }] : []),
                ];
            },
        }));
        await fixture.initialize();
        assert.deepStrictEqual(modes, [false]);
        assert.strictEqual(fixture.form.state.showingAllSubscriptions, false);
        assert.strictEqual(fixture.form.state.scopeReady, true);
        await fixture.send({ command: 'loadAllSubscriptions' });
        assert.deepStrictEqual(modes, [false, true]);
        assert.strictEqual(fixture.form.state.showingAllSubscriptions, true);
        assert.strictEqual(fixture.form.state.scopeReady, true);
        assert.strictEqual(fixture.form.state.canApprove, true);
        assert.strictEqual(fixture.form.state.subscriptionOptions.length, 2);
        await fixture.send({ command: 'loadFilteredSubscriptions' });
        assert.deepStrictEqual(modes, [false, true, false]);
        assert.strictEqual(fixture.form.state.showingAllSubscriptions, false);
        assert.strictEqual(fixture.form.state.scopeReady, true);
        assert.strictEqual(fixture.form.state.canApprove, true);
        assert.strictEqual(fixture.form.state.subscriptionOptions.length, 1);
    });

    test('clears a selected scope excluded by the Azure subscription filter and prevents approval', async () => {
        const fixture = await createSetupForm(undefined, createSetupScopes({
            listSubscriptions: async (_context, showAll) => showAll ?
                [{ id: 'fixture-subscription', label: 'Excluded subscription' }] : [],
        }));
        await fixture.initialize(false);
        assert.strictEqual(fixture.form.state.subscriptionOptions.length, 0);
        assert.strictEqual(fixture.form.state.showingAllSubscriptions, false);
        await fixture.send({ command: 'loadAllSubscriptions' });
        await fixture.send({ command: 'selectSubscription', id: fixture.form.state.subscriptionOptions[0].id });
        await fixture.send({ command: 'selectRegion', id: fixture.form.state.regionOptions[0].id });
        assert.strictEqual(fixture.form.state.canApprove, true);
        await fixture.send({ command: 'loadFilteredSubscriptions' });
        assert.strictEqual(fixture.form.state.subscriptionId, '');
        assert.strictEqual(fixture.form.state.regionId, '');
        assert.strictEqual(fixture.form.state.tenant, undefined);
        assert.strictEqual(fixture.form.state.scopeReady, false);
        assert.strictEqual(fixture.form.state.canApprove, false);
        assert.strictEqual(fixture.form.state.error, undefined);
    });

    test('ignores stale subscription-mode responses and retains the last successful mode on failure', async () => {
        let finishAll: ((subscriptions: { id: string; label: string }[]) => void) | undefined;
        const fixture = await createSetupForm(undefined, createSetupScopes({
            listSubscriptions: async (_context, showAll) => showAll ?
                await new Promise(resolve => { finishAll = resolve; }) :
                [{ id: 'fixture-subscription', label: 'Filtered subscription' }],
        }));
        await fixture.initialize(false);
        const pending = fixture.send({ command: 'loadAllSubscriptions' });
        assert.ok(finishAll);
        await fixture.send({ command: 'loadFilteredSubscriptions' });
        finishAll([{ id: 'stale-subscription', label: 'Stale all subscription' }]);
        await pending;
        assert.strictEqual(fixture.form.state.showingAllSubscriptions, false);
        assert.deepStrictEqual(fixture.form.state.subscriptionOptions.map(option => option.label), ['Filtered subscription']);

        const failed = await createSetupForm(undefined, createSetupScopes({
            listSubscriptions: async (_context, showAll) => {
                if (showAll) {
                    throw new Error('private-subscription-error');
                }
                return [];
            },
        }));
        await failed.initialize(false);
        await failed.send({ command: 'loadAllSubscriptions' });
        assert.strictEqual(failed.form.state.showingAllSubscriptions, false);
        assert.strictEqual(failed.form.state.canApprove, false);
        assert.match(failed.form.state.error ?? '', /could not be loaded/i);
        assert.doesNotMatch(JSON.stringify(failed.form.state), /private-subscription-error/);
    });

    test('accepts both subscription-mode actions and immediately disables the dropdown during reload', async () => {
        const fixture = await createSetupForm();
        await fixture.initialize(false);
        const viewModel = createConnectorTriggerSetupViewModel(fixture.request);
        for (const command of ['loadAllSubscriptions', 'loadFilteredSubscriptions'] as const) {
            assert.strictEqual(isConnectorSetupMessage({ command, revision: 1 }), true);
            const state = applyConnectorSetupAction(fixture.form.state, { command }, viewModel.labels.provisioning);
            assert.strictEqual(state.loading, true);
            assert.strictEqual(state.canApprove, false);
            const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
                viewModel, resources: state,
                sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
            }));
            assert.match(html, /id="setup-subscription"[^>]*disabled/);
        }
    });

    test('requires explicit scope choices before resource lookup or approval when no authoring defaults exist', async () => {
        const targets: { subscription: string; region: string }[] = [];
        const fixture = await createSetupForm({
            listNamespaces: async (_context, target) => {
                targets.push({ subscription: target.subscription.id, region: target.region });
                return [];
            },
            listConnections: async () => assert.fail('No existing namespace was selected.'),
        });
        const metadataBefore = JSON.stringify(fixture.request.metadata);
        await fixture.initialize(false);
        assert.strictEqual(fixture.form.state.subscriptionId, '');
        assert.strictEqual(fixture.form.state.regionId, '');
        assert.strictEqual(fixture.form.state.scopeReady, false);
        assert.strictEqual(fixture.form.state.canApprove, false);
        assert.deepStrictEqual(targets, []);
        await fixture.send({ command: 'selectSubscription', id: fixture.form.state.subscriptionOptions[1].id });
        assert.strictEqual(fixture.form.state.regionId, '');
        assert.strictEqual(fixture.form.state.canApprove, false);
        assert.deepStrictEqual(targets, []);
        await fixture.send({ command: 'selectRegion', id: 'unlisted-region' });
        assert.strictEqual(fixture.form.state.canApprove, false);
        assert.deepStrictEqual(targets, []);
        await fixture.send({ command: 'selectRegion', id: fixture.form.state.regionOptions[1].id });
        assert.deepStrictEqual(targets, [{ subscription: 'other-subscription', region: 'westus' }]);
        const plan = await fixture.send({ command: 'approveSetup' });
        assert.strictEqual(plan?.target.subscription.id, 'other-subscription');
        assert.strictEqual(plan?.target.region, 'westus');
        assert.strictEqual(JSON.stringify(fixture.request.metadata), metadataBefore);
        assert.deepStrictEqual(Object.keys(fixture.request.metadata ?? {}).sort(), ['connectorId', 'operationId', 'version']);
        await fixture.send({ command: 'selectSubscription', id: fixture.form.state.subscriptionOptions[0].id });
        assert.strictEqual(fixture.form.state.subscriptionId, fixture.form.state.subscriptionOptions[1].id);
        assert.deepStrictEqual(targets, [{ subscription: 'other-subscription', region: 'westus' }]);
        const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
            viewModel: createConnectorTriggerSetupViewModel(fixture.request), resources: fixture.form.state,
            sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
        }));
        assert.match(html, /setup-subscription[^>]*disabled/);
        assert.match(html, /setup-region[^>]*disabled/);
        assert.match(html, /editable defaults/);
        assert.doesNotMatch(JSON.stringify(fixture.context.telemetry.properties), /other-subscription|westus|fixture-tenant/);
    });

    test('subscription changes discard stale region replies and reset all dependent resource choices', async () => {
        let finishFirst: ((regions: { id: string; label: string }[]) => void) | undefined;
        const calls: string[] = [];
        const fixture = await createSetupForm({
            listNamespaces: async (_context, target) => {
                calls.push(`${target.subscription.id}:${target.region}`);
                return [setupNamespace('selected-namespace')];
            },
            listConnections: async () => [],
        }, createSetupScopes({
            listRegions: async (_context, { id }) => id === 'fixture-subscription' ?
                await new Promise(resolve => { finishFirst = resolve; }) : [{ id: 'westus', label: 'West US' }],
        }));
        await fixture.initialize(false);
        const first = fixture.send({ command: 'selectSubscription', id: fixture.form.state.subscriptionOptions[0].id });
        assert.ok(finishFirst);
        await fixture.send({ command: 'selectSubscription', id: fixture.form.state.subscriptionOptions[1].id });
        assert.strictEqual(fixture.form.state.regionId, '');
        finishFirst([{ id: 'eastus', label: 'Late first region' }]);
        await first;
        assert.deepStrictEqual(fixture.form.state.regionOptions.map(option => option.label), ['West US']);
        assert.deepStrictEqual(calls, []);
        await fixture.send({ command: 'selectRegion', id: fixture.form.state.regionOptions[0].id });
        assert.deepStrictEqual(calls, ['other-subscription:westus']);
    });

    test('region changes discard stale namespace results and keep explicitly edited resource names', async () => {
        let finishFirst: ((namespaces: ConnectorTriggerNamespace[]) => void) | undefined;
        const fixture = await createSetupForm({
            listNamespaces: async (_context, target) => target.region === 'eastus' ?
                await new Promise(resolve => { finishFirst = resolve; }) :
                [{ ...setupNamespace('west-namespace'), location: 'westus' }],
            listConnections: async () => [],
        });
        await fixture.initialize(false);
        await fixture.send({ command: 'selectSubscription', id: fixture.form.state.subscriptionOptions[0].id });
        const first = fixture.send({ command: 'selectRegion', id: fixture.form.state.regionOptions[0].id });
        assert.ok(finishFirst);
        await fixture.send({ command: 'editResource', field: 'namespaceName', text: 'keep-edited-name' });
        await fixture.send({ command: 'selectRegion', id: fixture.form.state.regionOptions[1].id });
        const secondGroup = fixture.form.state.names.resourceGroupName;
        finishFirst([setupNamespace('late-east-namespace')]);
        await first;
        assert.doesNotMatch(JSON.stringify(fixture.form.state), /late-east-namespace/);
        assert.strictEqual(fixture.form.state.names.namespaceName, 'keep-edited-name');
        assert.strictEqual(fixture.form.state.names.resourceGroupName, secondGroup);
        assert.strictEqual(fixture.form.state.canApprove, true);
        assert.strictEqual((await fixture.send({ command: 'approveSetup' }))?.target.region, 'westus');
    });

    test('sign-in refreshes subscriptions without choosing a scope and loading failures remain safe and blocking', async () => {
        let fails = true;
        let signIns = 0;
        const fixture = await createSetupForm({
            listNamespaces: async () => assert.fail('A scope must be chosen first.'),
            listConnections: async () => assert.fail('A scope must be chosen first.'),
        }, createSetupScopes({
            listSubscriptions: async () => {
                if (fails) {
                    throw new Error('private-subscription-response');
                }
                return [{ id: 'current-subscription', label: 'Current subscription' }];
            },
            signIn: async () => { signIns++; },
        }));
        await fixture.initialize(false);
        assert.match(fixture.form.state.error ?? '', /could not be loaded/i);
        assert.doesNotMatch(JSON.stringify(fixture.form.state), /private-subscription-response/);
        assert.strictEqual(fixture.form.state.canApprove, false);
        fails = false;
        const beforeSignIn = fixture.changes.length;
        await fixture.send({ command: 'signInSetup' });
        assert.strictEqual(signIns, 1);
        assert.strictEqual(fixture.changes[beforeSignIn].loading, true);
        assert.strictEqual(fixture.changes[beforeSignIn].error, undefined);
        assert.strictEqual(fixture.form.state.error, undefined);
        assert.strictEqual(fixture.form.state.subscriptionId, '');
        assert.strictEqual(fixture.form.state.regionId, '');
        assert.strictEqual(fixture.form.state.canApprove, false);
        assert.deepStrictEqual(fixture.form.state.subscriptionOptions.map(option => option.label), ['Current subscription']);
    });

    test('validates new names, approves the edited plan once, and never accepts computed-setting edits', async () => {
        const fixture = await createSetupForm({
            listNamespaces: async () => [],
            listConnections: async () => assert.fail('A planned namespace must not be queried.'),
        });
        await fixture.initialize();
        await fixture.send({ command: 'editResource', field: 'namespaceName', text: 'invalid/name' });
        await fixture.send({ command: 'editResource', field: 'resourceGroupName', text: 'invalid.' });
        await fixture.send({ command: 'editResource', field: 'connectionName', text: ' ' });
        assert.strictEqual(fixture.form.state.canApprove, false);
        assert.ok(fixture.form.state.errors.namespaceName);
        assert.ok(fixture.form.state.errors.resourceGroupName);
        assert.ok(fixture.form.state.errors.connectionName);
        assert.strictEqual(await fixture.send({ command: 'approveSetup' }), undefined);
        await fixture.send({ command: 'editResource', field: 'namespaceName', text: 'custom-namespace' });
        await fixture.form.handleMessage({ command: 'editResource', field: 'namespaceName', text: 'stale-name', revision: 1 });
        assert.strictEqual(fixture.form.state.names.namespaceName, 'custom-namespace');
        await fixture.send({ command: 'editResource', field: 'resourceGroupName', text: 'custom-group' });
        await fixture.send({ command: 'editResource', field: 'connectionName', text: 'custom-connection' });
        assert.strictEqual(fixture.form.state.canApprove, true);
        const plan = await fixture.send({ command: 'approveSetup' });
        assert.deepStrictEqual(plan?.namespace, { kind: 'create', namespaceName: 'custom-namespace', resourceGroupName: 'custom-group' });
        assert.deepStrictEqual(plan?.connection, { kind: 'create', connectionName: 'custom-connection' });
        assert.strictEqual(fixture.form.state.phase, 'provisioning');
        assert.strictEqual(await fixture.send({ command: 'approveSetup' }), undefined);
        await fixture.send({ command: 'editResource', field: 'namespaceName', text: 'too-late' });
        assert.strictEqual(fixture.form.state.names.namespaceName, 'custom-namespace');
        assert.ok(fixture.context.valuesToMask.includes('custom-namespace'));
        assert.doesNotMatch(JSON.stringify(fixture.context.telemetry.properties), /custom-namespace|custom-group|custom-connection/);
        assert.strictEqual(isConnectorSetupMessage({ command: 'editResource', revision: 1, field: 'pollingEndpoint', text: 'https://invalid.example/' }), false);
        assert.strictEqual(isConnectorSetupMessage({ command: 'approveSetup', revision: 0 }), false);
        assert.strictEqual(isConnectorSetupMessage({ command: 'selectNamespace', revision: 1, id: {} }), false);
    });

    test('loads only selected namespace connections, filters scope, and discards stale selections and replies', async () => {
        const first = setupNamespace('first');
        const second = setupNamespace('second');
        const wrongRegion = { ...setupNamespace('wrong-region'), location: 'westus' };
        let finishFirst: ((connections: Awaited<ReturnType<ConnectorTriggerGateway['listConnections']>>) => void) | undefined;
        const calls: string[] = [];
        const fixture = await createSetupForm({
            listNamespaces: async () => [first, second, wrongRegion],
            listConnections: async (_context, _handoff, namespace) => {
                calls.push(namespace.name);
                return namespace === first ? await new Promise(resolve => { finishFirst = resolve; }) : [
                    { id: '/connections/second', name: 'second-connection', connectorId: 'office365' },
                    { id: '/connections/wrong', name: 'wrong-connector', connectorId: 'teams' },
                ];
            },
        });
        await fixture.initialize();
        assert.deepStrictEqual(calls, []);
        assert.doesNotMatch(JSON.stringify(fixture.form.state), /wrong-region|namespaces\/first/);
        const firstId = fixture.form.state.namespaceOptions.find(option => option.label.startsWith('first '))?.id;
        const secondId = fixture.form.state.namespaceOptions.find(option => option.label.startsWith('second '))?.id;
        assert.ok(firstId && secondId);
        const pending = fixture.send({ command: 'selectNamespace', id: firstId });
        await fixture.send({ command: 'selectNamespace', id: secondId });
        assert.ok(finishFirst);
        finishFirst([{ id: '/connections/first', name: 'late-first-connection', connectorId: 'office365' }]);
        await pending;
        assert.deepStrictEqual(calls, ['first', 'second']);
        assert.deepStrictEqual(fixture.form.state.connectionOptions.map(option => option.label), [
            'Create a new connector connection', 'second-connection',
        ]);
        assert.strictEqual(fixture.form.state.names.namespaceName, 'second');
        const connectionId = fixture.form.state.connectionOptions[1].id;
        await fixture.send({ command: 'selectConnection', id: connectionId });
        await fixture.send({ command: 'selectNamespace', id: 'new' });
        assert.strictEqual(fixture.form.state.connectionId, 'new');
        await fixture.send({ command: 'selectConnection', id: connectionId });
        assert.strictEqual(fixture.form.state.canApprove, false);
        assert.match(fixture.form.state.error ?? '', /current list/);
    });

    test('reports safe resource loading failures, preserves new names on reload, and ignores disposed replies', async () => {
        let fails = true;
        let finish: ((namespaces: ConnectorTriggerNamespace[]) => void) | undefined;
        const fixture = await createSetupForm({
            listNamespaces: async () => {
                if (fails) {
                    throw new Error('private-service-response');
                }
                return await new Promise(resolve => { finish = resolve; });
            },
            listConnections: async () => [],
        });
        await fixture.initialize();
        assert.match(fixture.form.state.error ?? '', /could not be loaded/i);
        assert.doesNotMatch(JSON.stringify(fixture.form.state), /private-service-response/);
        assert.strictEqual(fixture.form.state.canApprove, false);
        await fixture.send({ command: 'editResource', field: 'namespaceName', text: 'keep-this-name' });
        assert.strictEqual(fixture.form.state.canApprove, false);
        fails = false;
        const pending = fixture.send({ command: 'reloadSetup' });
        assert.ok(finish);
        fixture.form.dispose();
        const beforeReply = fixture.changes.length;
        finish([]);
        await pending;
        assert.strictEqual(fixture.changes.length, beforeReply);
        assert.strictEqual(fixture.form.state.names.namespaceName, 'keep-this-name');
        assert.strictEqual(fixture.context.telemetry.properties.connectorF5ResourceLoadResult, 'failed');
    });

    test('rejects new names colliding with existing namespaces or connections before approval', async () => {
        const namespace = setupNamespace('existing');
        const fixture = await createSetupForm({
            listNamespaces: async () => [namespace, { ...setupNamespace('other-region'), location: 'westus' }],
            listConnections: async () => [{ id: '/connections/occupied', name: 'occupied', connectorId: 'teams' }],
        });
        await fixture.initialize();
        await fixture.send({ command: 'editResource', field: 'namespaceName', text: 'existing' });
        await fixture.send({ command: 'editResource', field: 'resourceGroupName', text: namespace.resourceGroupName });
        assert.match(fixture.form.state.errors.namespaceName ?? '', /already exists/);
        const existingId = fixture.form.state.namespaceOptions.find(option => option.label.startsWith('existing '))?.id;
        assert.ok(existingId);
        await fixture.send({ command: 'selectNamespace', id: existingId });
        await fixture.send({ command: 'editResource', field: 'connectionName', text: 'occupied' });
        assert.match(fixture.form.state.errors.connectionName ?? '', /already exists/);
        assert.strictEqual(fixture.form.state.canApprove, false);
    });

    test('keeps failed connection enumeration blocking approval until a successful reload', async () => {
        let fails = true;
        const fixture = await createSetupForm({
            listNamespaces: async () => [setupNamespace('existing')],
            listConnections: async () => {
                if (fails) {
                    throw new Error('private-connection-response');
                }
                return [];
            },
        });
        await fixture.initialize();
        await fixture.send({ command: 'selectNamespace', id: fixture.form.state.namespaceOptions[1].id });
        await fixture.send({ command: 'editResource', field: 'connectionName', text: 'keep-this-connection' });
        assert.strictEqual(fixture.form.state.canApprove, false);
        assert.match(fixture.form.state.error ?? '', /could not be loaded/i);
        assert.doesNotMatch(JSON.stringify(fixture.form.state), /private-connection-response/);
        fails = false;
        await fixture.send({ command: 'reloadSetup' });
        assert.strictEqual(fixture.form.state.canApprove, true);
        assert.strictEqual(fixture.form.state.names.connectionName, 'keep-this-connection');
        assert.strictEqual(fixture.form.state.names.namespaceName, 'existing');
    });

    test('disambiguates same-named subscriptions with their subscription IDs and targets the selected one', async () => {
        const first = '11111111-1111-4111-8111-111111111111';
        const second = '22222222-2222-4222-8222-222222222222';
        const targets: string[] = [];
        const fixture = await createSetupForm({
            listNamespaces: async (_context, target) => {
                targets.push(target.subscription.id);
                return [];
            },
            listConnections: async () => [],
        }, createSetupScopes({
            listSubscriptions: async () => [
                { id: first, label: 'Shared development' },
                { id: second, label: 'Shared development' },
                { id: 'unique-subscription', label: 'Unique subscription' },
            ],
        }));
        await fixture.initialize(false);
        const options = fixture.form.state.subscriptionOptions;
        assert.deepStrictEqual(options.map(option => option.label), [
            `Shared development (${first})`, `Shared development (${second})`, 'Unique subscription',
        ]);
        assert.doesNotMatch(JSON.stringify(options.map(option => option.id)), /1111|2222|unique-subscription/);
        await fixture.send({ command: 'selectSubscription', id: options[1].id });
        await fixture.send({ command: 'selectRegion', id: fixture.form.state.regionOptions[0].id });
        assert.strictEqual(fixture.form.state.tenant, 'fixture-tenant');
        assert.strictEqual(fixture.form.state.cloud, 'AzureCloud');
        assert.deepStrictEqual(targets, [second]);
        const html = renderToStaticMarkup(createElement(ConnectorTriggerSetupPage, {
            viewModel: createConnectorTriggerSetupViewModel(fixture.request), resources: fixture.form.state,
            sendResource: () => undefined, sendParameter: () => undefined, cancel: () => undefined,
        }));
        assert.match(html, new RegExp(`value="Shared development \\(${second}\\)"`));
        assert.strictEqual((await fixture.send({ command: 'approveSetup' }))?.target.subscription.id, second);
        assert.doesNotMatch(JSON.stringify(fixture.context.telemetry.properties), /1111|2222|Shared development/);
    });

    test('keeps the selected account through region, catalog, reload and approval when accounts share a subscription', async () => {
        const subscriptionId = '44444444-4444-4444-8444-444444444444';
        const calls: string[] = [];
        const fixture = await createSetupForm({
            listNamespaces: async (_context, target) => {
                calls.push(`namespaces:${target.subscription.accountId}`);
                return [];
            },
            listConnections: async () => [],
        }, createSetupScopes({
            listSubscriptions: async () => [
                { id: subscriptionId, label: 'Shared development', accountId: 'account-a', accountLabel: 'alice@contoso.test' },
                { id: subscriptionId, label: 'Shared development', accountId: 'account-b', accountLabel: 'bob@contoso.test' },
            ],
            getSubscription: async (_context, { id, accountId }) => {
                calls.push(`subscription:${accountId}`);
                return {
                    id, accountId, tenantId: 'shared-tenant',
                    environment: { name: 'AzureCloud', resourceManagerEndpointUrl: 'https://management.azure.com/' },
                };
            },
            listRegions: async (_context, { accountId }) => {
                calls.push(`regions:${accountId}`);
                return [{ id: 'eastus', label: 'East US' }];
            },
            listConnectors: async (_context, scope) => {
                calls.push(`connectors:${scope.subscription.accountId}`);
                return [{ id: 'office365', label: 'Office 365 Outlook' }];
            },
            listEvents: async (_context, scope) => {
                calls.push(`events:${scope.subscription.accountId}`);
                return [{ id: 'OnNewEmailV3', label: 'When a new email arrives (V3)' }];
            },
        }), false);
        await fixture.initialize(false);
        assert.deepStrictEqual(fixture.form.state.subscriptionOptions.map(option => option.label), [
            `Shared development (${subscriptionId}, alice@contoso.test)`,
            `Shared development (${subscriptionId}, bob@contoso.test)`,
        ]);
        assert.doesNotMatch(JSON.stringify(fixture.form.state.subscriptionOptions.map(option => option.id)), /account|contoso/);
        await fixture.send({ command: 'selectSubscription', id: fixture.form.state.subscriptionOptions[1].id });
        await fixture.send({ command: 'selectRegion', id: fixture.form.state.regionOptions[0].id });
        await fixture.send({ command: 'loadAllSubscriptions' });
        const selected = fixture.form.state.subscriptionOptions.find(option => option.id === fixture.form.state.subscriptionId);
        assert.strictEqual(selected?.label, `Shared development (${subscriptionId}, bob@contoso.test)`);
        assert.strictEqual(fixture.form.state.tenant, 'shared-tenant');
        await fixture.send({ command: 'selectConnector', id: fixture.form.state.connectorOptions[0].id });
        await fixture.send({ command: 'selectEvent', id: fixture.form.state.eventOptions[0].id });
        assert.ok(calls.length > 0 && calls.every(call => call.endsWith(':account-b')), calls.join(', '));
        for (const call of ['regions', 'connectors', 'events', 'namespaces']) {
            assert.ok(calls.includes(`${call}:account-b`), call);
        }
        const plan = await fixture.send({ command: 'approveSetup' });
        assert.deepStrictEqual(
            [plan?.target.subscription.id, plan?.target.subscription.accountId], [subscriptionId, 'account-b']);
        assert.doesNotMatch(JSON.stringify(fixture.context.telemetry.properties), /account-|contoso|4444/);
    });

    test('propagates cancellation from chained subscription, region and connection loads', async () => {
        let cancelSubscription = false;
        let cancelConnections = false;
        let cancelSubscriptions = false;
        const cancelled = (error: unknown) => error instanceof UserCancelledError;
        const fixture = await createSetupForm({
            listNamespaces: async () => [{ ...setupNamespace('existing'), resourceGroupName: 'existing-group' }],
            listConnections: async () => {
                if (cancelConnections) {
                    throw new UserCancelledError('connections');
                }
                return [];
            },
        }, createSetupScopes({
            listSubscriptions: async () => {
                if (cancelSubscriptions) {
                    throw new UserCancelledError('subscriptions');
                }
                return [{ id: 'fixture-subscription', label: 'Fixture subscription' }];
            },
            getSubscription: async (_context, { id, accountId }) => {
                if (cancelSubscription) {
                    throw new UserCancelledError('subscription');
                }
                return {
                    id, accountId, tenantId: 'fixture-tenant',
                    environment: { name: 'AzureCloud', resourceManagerEndpointUrl: 'https://management.azure.com/' },
                };
            },
        }));
        await fixture.initialize();
        await fixture.send({ command: 'selectNamespace', id: fixture.form.state.namespaceOptions[1].id });

        cancelConnections = true;
        await assert.rejects(fixture.send({ command: 'reloadSetup' }), cancelled);
        cancelConnections = false;

        cancelSubscription = true;
        await assert.rejects(fixture.send({ command: 'loadAllSubscriptions' }), cancelled);
        cancelSubscription = false;

        cancelSubscriptions = true;
        await assert.rejects(fixture.send({ command: 'signInSetup' }), cancelled);
    });

    test('replays the active event parameters when the setup webview is recreated', async () => {
        const parameters = await createForm([{ name: 'subject', label: 'Subject', type: 'string', required: true }]);
        const setup = await createSetupForm();
        const resolver: ConnectorTriggerOperationResolver = {
            resolveOperation: async () => parameters.request.operation,
            resolveDynamicInput: async () => assert.fail('No dynamic choices expected.'),
            serializeParameters: () => assert.fail('Only the F5 execute step serializes parameters.'),
        };
        const extensionContext = { extensionPath: path.join(__dirname, '..'), subscriptions: [] } as unknown as vscode.ExtensionContext;
        const gateway = { listNamespaces: async () => [], listConnections: async () => [] } as unknown as ConnectorTriggerGateway;
        const controller = ConnectorTriggerSetupController.open(
            extensionContext, setup.context, setup.request, gateway, resolver, createSetupScopes());
        const resourceSelection = controller.selectResources().catch((error: unknown) => error);
        const posted: { command?: string; viewModel?: unknown; state?: ConnectorParameterFormState }[] = [];
        controller.panel.webview.postMessage = async (message: { command?: string }) => {
            posted.push(message);
            return true;
        };
        const send = async (message: unknown) => await controller['handleMessage'](message);
        const latestParameters = () => [...posted].reverse().find(message => message.command === 'parameterState')?.state;
        try {
            await send({ command: 'initializeSetup' });
            const values = controller.collectParameters(parameters.request);
            const configuration = posted.find(message => message.command === 'parameterConfiguration');
            assert.ok(configuration);
            await send({ command: 'initialize' });
            await send({ command: 'edit', name: 'subject', text: 'Kept subject', revision: 1 });

            posted.length = 0;
            await send({ command: 'initializeSetup' });
            assert.deepStrictEqual(posted.find(message => message.command === 'parameterConfiguration')?.viewModel, configuration.viewModel);
            assert.ok(posted.some(message => message.command === 'setupState'));
            await send({ command: 'initialize' });
            assert.strictEqual(latestParameters()?.fields[0].text, 'Kept subject');
            assert.strictEqual(latestParameters()?.canSubmit, true);

            await send({ command: 'submit', revision: 2 });
            assert.deepStrictEqual(await values, { subject: 'Kept subject' });
            posted.length = 0;
            await send({ command: 'initializeSetup' });
            assert.ok(!posted.some(message => message.command === 'parameterConfiguration'));
        } finally {
            controller.dispose();
        }
        assert.ok(await resourceSelection instanceof UserCancelledError);
    });
});

function setupNamespace(name: string): ConnectorTriggerNamespace {
    return { id: `/namespaces/${name}`, name, resourceGroupName: 'existing-group', location: 'eastus' };
}

async function createSetupForm(
    gateway: Pick<ConnectorTriggerGateway, 'listNamespaces' | 'listConnections'> = {
        listNamespaces: async () => [], listConnections: async () => [],
    },
    scopes: ConnectorTriggerSetupScopes = createSetupScopes(),
    hasMetadata = true,
    azureContext?: ConnectorTriggerAuthoringContext,
) {
    const context = await createTestActionContext();
    const request: ConnectorTriggerSetupRequest = {
        metadata: hasMetadata ? {
            version: 1, connectorId: 'office365', operationId: 'OnNewEmailV3',
            ...(azureContext ? { azureContext } : {}),
        } : undefined,
        projectPath: 'C:\\fixture-project',
        workspaceId: 'fixture-workspace',
        binding: { connectionSettingName: 'CustomConnection', triggerConfigSettingName: 'CustomTriggerConfig' },
        localSettings: [
            { name: 'CustomConnection__pollingEndpoint', exists: false, purpose: 'pollingEndpoint', environmentOverride: false },
            { name: 'CustomTriggerConfig', exists: true, purpose: 'triggerConfig', environmentOverride: true },
        ],
    };
    const changes: ConnectorSetupResourceState[] = [];
    const form = new ConnectorTriggerSetupForm(context, request, gateway, scopes, state => changes.push(state));
    let revision = 0;
    const send = async (action: ConnectorSetupAction) => await form.handleMessage({ ...action, revision: ++revision });
    return {
        form, request, context, changes,
        initialize: async (selectScope = true) => {
            await form.handleMessage({ command: 'initializeSetup' });
            if (selectScope) {
                await send({ command: 'selectSubscription', id: form.state.subscriptionOptions[0].id });
                await send({ command: 'selectRegion', id: form.state.regionOptions[0].id });
            }
        },
        send,
    };
}

function createSetupScopes(overrides: Partial<ConnectorTriggerSetupScopes> = {}): ConnectorTriggerSetupScopes {
    return {
        listSubscriptions: async () => [
            { id: 'fixture-subscription', label: 'Fixture subscription' },
            { id: 'other-subscription', label: 'Other subscription' },
        ],
        getSubscription: async (_context, { id, accountId }) => ({
            id, accountId, tenantId: 'fixture-tenant',
            environment: { name: 'AzureCloud', resourceManagerEndpointUrl: 'https://management.azure.com/' },
        }),
        listRegions: async () => [{ id: 'eastus', label: 'East US' }, { id: 'westus', label: 'West US' }],
        listConnectors: async () => [{ id: 'office365', label: 'Office 365 Outlook' }],
        listEvents: async () => [{ id: 'OnNewEmailV3', label: 'When a new email arrives (V3)' }],
        signIn: async () => undefined,
        ...overrides,
    };
}

function folderInput(): ConnectorTriggerInputDefinition {
    return {
        name: 'folder', label: 'Folder', type: 'string', required: true,
        dynamic: { kind: 'tree', metadata: { endpoint: 'private-endpoint' } },
    };
}

async function createForm(
    inputs: ConnectorTriggerInputDefinition[],
    load: (request: Parameters<ConnectorTriggerOperationResolver['resolveDynamicInput']>[1]) => Promise<ConnectorTriggerInputOption[]> =
        async () => assert.fail('No dynamic choices expected.'),
) {
    const context = await createTestActionContext();
    const request: ConnectorTriggerParameterRequest = {
        target: {
            version: 1,
            subscription: { id: 'subscription', tenantId: 'tenant', environment: { name: 'AzureCloud', resourceManagerEndpointUrl: 'https://management.azure.com/' } },
            region: 'eastus', connectorId: 'office365', operationId: 'OnNewEmailV3',
        },
        namespace: { id: '/connectorGateways/fixture', name: 'fixture-namespace', resourceGroupName: 'fixture-group', location: 'eastus' },
        connection: { id: '/connections/fixture', name: 'fixture-connection', connectorId: 'office365', status: 'Connected' },
        operation: { inputs, label: 'When a new email arrives', connectorLabel: 'Office 365 Outlook' },
    };
    const resolver: ConnectorTriggerOperationResolver = {
        resolveOperation: async () => request.operation,
        resolveDynamicInput: async (_context, request) => ({ options: await load(request) }),
        serializeParameters: () => assert.fail('Only the F5 execute step serializes parameters.'),
    };
    const changes: ConnectorParameterFormState[] = [];
    const form = new ConnectorTriggerParameterForm(context, request, resolver, state => changes.push(state));
    let revision = 0;
    return {
        form, request, context, changes,
        initialize: async () => await form.handleMessage({ command: 'initialize' }),
        send: async (action: ConnectorParameterAction) => await form.handleMessage({ ...action, revision: ++revision }),
        field: (name: string) => {
            const field = form.state.fields.find(field => field.name === name);
            assert.ok(field);
            return field;
        },
    };
}
