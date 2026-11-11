/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { ConnectorTriggerParameterForm } from '../src/debug/connectorNamespace/ConnectorTriggerParameterForm';
import {
    type ConnectorTriggerDynamicResolution,
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerOperationResolver,
} from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';

suite('Connector Trigger parameter form', () => {
    const forms: ConnectorTriggerParameterForm[] = [];

    teardown(() => {
        forms.splice(0).forEach(form => form.dispose());
    });

    test('allows an optional lookup and its optional dependency to be omitted', async () => {
        const form = await createForm([
            { name: 'survey', label: 'Survey', type: 'string', required: false },
            { name: 'page', label: 'Page', type: 'string', required: false, dynamic: { kind: 'values', dependsOn: ['survey'], metadata: {} } },
        ]);
        await form.handleMessage({ command: 'initialize' });

        assert.strictEqual(form.state.fields.find(field => field.name === 'survey')?.required, false);
        assert.strictEqual(form.state.fields.find(field => field.name === 'page')?.status, 'idle');
        assert.strictEqual(form.state.canSubmit, true);
        assert.deepStrictEqual(await form.handleMessage({ command: 'submit', revision: 1 }), {});
    });

    test('requires transitive dependencies of a required lookup', async () => {
        const form = await createForm([
            { name: 'question', label: 'Question', type: 'string', required: true, dynamic: { kind: 'values', dependsOn: ['page'], metadata: {} } },
            { name: 'page', label: 'Page', type: 'string', required: false, dynamic: { kind: 'values', dependsOn: ['survey'], metadata: {} } },
            { name: 'survey', label: 'Survey', type: 'string', required: false },
        ]);
        await form.handleMessage({ command: 'initialize' });

        assert.deepStrictEqual(form.state.fields.map(field => [field.name, field.required]), [
            ['survey', true], ['page', true], ['question', true],
        ]);
        assert.strictEqual(form.state.canSubmit, false);
        await form.handleMessage({ command: 'edit', name: 'survey', text: 'survey-1', revision: 1 });
        const page = form.state.fields.find(field => field.name === 'page');
        assert.ok(page);
        await form.handleMessage({ command: 'select', name: 'page', optionIds: [page.options[0].id], revision: 2 });
        const question = form.state.fields.find(field => field.name === 'question');
        assert.ok(question);
        await form.handleMessage({ command: 'select', name: 'question', optionIds: [question.options[0].id], revision: 3 });
        assert.strictEqual(form.state.canSubmit, true);
    });

    test('requires dependencies only while their optional dependent is selected', async () => {
        const form = await createForm([
            { name: 'survey', label: 'Survey', type: 'string', required: false, defaultValue: 'survey-1' },
            { name: 'page', label: 'Page', type: 'string', required: false, dynamic: { kind: 'values', dependsOn: ['survey'], metadata: {} } },
        ]);
        await form.handleMessage({ command: 'initialize' });
        assert.strictEqual(form.state.fields.find(field => field.name === 'survey')?.required, false);
        const page = form.state.fields.find(field => field.name === 'page');
        assert.ok(page);
        await form.handleMessage({ command: 'select', name: 'page', optionIds: [page.options[0].id], revision: 1 });
        assert.strictEqual(form.state.fields.find(field => field.name === 'survey')?.required, true);
        await form.handleMessage({ command: 'select', name: 'page', optionIds: [], revision: 2 });
        assert.strictEqual(form.state.fields.find(field => field.name === 'survey')?.required, false);
        assert.deepStrictEqual(await form.handleMessage({ command: 'submit', revision: 3 }), { survey: 'survey-1' });
    });

    test('allows a failed unused optional lookup without hiding its error', async () => {
        const form = await createForm([
            { name: 'page', label: 'Page', type: 'string', required: false, dynamic: { kind: 'values', metadata: {} } },
        ], async () => { throw new Error('Fixture lookup unavailable.'); });
        await form.handleMessage({ command: 'initialize' });

        assert.strictEqual(form.state.fields[0].status, 'error');
        assert.ok(form.state.fields[0].error);
        assert.strictEqual(form.state.canSubmit, true);
        assert.deepStrictEqual(await form.handleMessage({ command: 'submit', revision: 1 }), {});
    });

    test('allows an unused optional lookup to remain loading', async () => {
        let finish!: (result: ConnectorTriggerDynamicResolution) => void;
        const result = new Promise<ConnectorTriggerDynamicResolution>(resolve => { finish = resolve; });
        const form = await createForm([
            { name: 'page', label: 'Page', type: 'string', required: false, dynamic: { kind: 'values', metadata: {} } },
        ], async () => result);
        const initialization = form.handleMessage({ command: 'initialize' });
        try {
            assert.strictEqual(form.state.fields[0].status, 'loading');
            assert.strictEqual(form.state.canSubmit, true);
            assert.deepStrictEqual(await form.handleMessage({ command: 'submit', revision: 1 }), {});
        } finally {
            finish({ options: [] });
            await initialization;
        }
    });

    test('blocks failed required lookups and invalid nonblank optional text', async () => {
        const required = await createForm([
            { name: 'page', label: 'Page', type: 'string', required: true, dynamic: { kind: 'values', metadata: {} } },
        ], async () => { throw new Error('Fixture lookup unavailable.'); });
        await required.handleMessage({ command: 'initialize' });
        assert.strictEqual(required.state.canSubmit, false);

        const optional = await createForm([{ name: 'count', label: 'Count', type: 'integer', required: false }]);
        await optional.handleMessage({ command: 'edit', name: 'count', text: 'invalid', revision: 1 });
        assert.strictEqual(optional.state.canSubmit, false);
    });

    test('does not ignore lookup errors for a selected optional field', async () => {
        const form = await createForm([
            { name: 'page', label: 'Page', type: 'string', required: false, dynamic: { kind: 'tree', metadata: {} } },
        ], async (_context, request) => {
            if (request.parent) {
                throw new Error('Fixture child lookup unavailable.');
            }
            return { options: [{ label: 'Page', value: 'page-1', hasChildren: true }] };
        });
        await form.handleMessage({ command: 'initialize' });
        const optionId = form.state.fields[0].options[0].id;
        await form.handleMessage({ command: 'select', name: 'page', optionIds: [optionId], revision: 1 });
        await form.handleMessage({ command: 'browse', name: 'page', optionId, revision: 2 });

        assert.strictEqual(form.state.fields[0].status, 'error');
        assert.strictEqual(form.state.canSubmit, false);
        await form.handleMessage({ command: 'reload', name: 'page', revision: 3 });
        assert.strictEqual(form.state.canSubmit, true);
        assert.deepStrictEqual(await form.handleMessage({ command: 'submit', revision: 4 }), {});
    });

    test('preserves array defaults and their order for required and optional multi-select fields', async () => {
        for (const required of [true, false]) {
            const form = await createForm([{
                name: 'pages', label: 'Pages', type: 'array', required, allowMultiple: true,
                defaultValue: ['b', 'a'],
                options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
            }]);
            assert.deepStrictEqual(form.state.fields[0].selectedLabels, ['B', 'A']);
            assert.strictEqual(form.state.canSubmit, true);
            assert.deepStrictEqual(await form.handleMessage({ command: 'submit', revision: 1 }), { pages: ['b', 'a'] });
        }
    });

    test('normalizes scalar multi-select defaults to arrays', async () => {
        for (const required of [true, false]) {
            const form = await createForm([{
                name: 'pages', label: 'Pages', type: 'array', required, allowMultiple: true,
                defaultValue: 'a', options: [{ label: 'A', value: 'a' }],
            }]);
            assert.strictEqual(form.state.canSubmit, true);
            assert.deepStrictEqual(await form.handleMessage({ command: 'submit', revision: 1 }), { pages: ['a'] });
        }
    });

    test('keeps single-select defaults scalar and omits unmatched multi-select defaults', async () => {
        const form = await createForm([
            { name: 'page', label: 'Page', type: 'string', required: true, defaultValue: 'a', options: [{ label: 'A', value: 'a' }] },
            { name: 'pages', label: 'Pages', type: 'array', required: false, allowMultiple: true, defaultValue: ['missing'], options: [{ label: 'A', value: 'a' }] },
        ]);
        assert.deepStrictEqual(await form.handleMessage({ command: 'submit', revision: 1 }), { page: 'a' });
    });

    async function createForm(
        inputs: ConnectorTriggerInputDefinition[],
        resolveDynamicInput: ConnectorTriggerOperationResolver['resolveDynamicInput'] = async () => ({
            options: [{ label: 'Fixture option', value: 'fixture-option' }],
        }),
    ): Promise<ConnectorTriggerParameterForm> {
        const form = new ConnectorTriggerParameterForm(await createTestActionContext(), {
            target: {
                version: 1, connectorId: 'fixture', operationId: 'fixture-event', region: 'fixture-region',
                subscription: {
                    id: 'fixture-subscription', tenantId: 'fixture-tenant',
                    environment: { name: 'AzureCloud', resourceManagerEndpointUrl: 'https://management.azure.com/' },
                },
            },
            namespace: { id: 'fixture-namespace', name: 'fixture-namespace', resourceGroupName: 'fixture-group', location: 'fixture-region' },
            connection: { id: 'fixture-connection', name: 'fixture-connection', connectorId: 'fixture' },
            operation: { inputs },
        }, {
            resolveDynamicInput,
            resolveOperation: async () => { throw new Error('Unexpected operation lookup.'); },
            serializeParameters: () => { throw new Error('Unexpected parameter serialization.'); },
        }, () => undefined);
        forms.push(form);
        return form;
    }
});
