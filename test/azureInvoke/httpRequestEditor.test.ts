/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerOnActionStartHandler, TestUserInput } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseInvocationCollection, serializeInvocationCollection } from '../../src/azureInvoke/collectionFile';
import { HttpRequestController } from '../../src/webviews/azureInvoke/extension/HttpRequestController';
import { formatResponseBody } from '../../src/webviews/azureInvoke/views/formatResponseBody';
import { getTestApi } from '../utils/testApiAccess';
import { invokeServer, useInvokeTestServer, compactResponseJson, formattedResponseJson, request, accountChain, createInvoke, createInvokeWithEditors, runEditorScript } from './azureInvokeTestUtils';

suite('Azure Invoke request editor', () => {
    useInvokeTestServer();

    test('renames, saves, closes, and reopens a real request editor with its saved fields', async () => {
        const extensionContext = (await getTestApi()).extensionVariables.getContext();
        assert.ok(extensionContext);
        const invoke = createInvoke();
        const draft = { ...invoke.collection.createDraft(), group: 'Customers' };
        const name = "Customer's </script><img src=x>";
        const ui = new TestUserInput(vscode);
        const handler = registerOnActionStartHandler(context => {
            if (context.callbackId === 'azureFunctions.azureInvoke.rename') {
                context.ui = ui;
            }
        });
        const controllers: HttpRequestController[] = [];
        try {
            const controller = new HttpRequestController(extensionContext, draft, false, saved => invoke.collection.save(saved));
            controllers.push(controller);
            await ui.runWithInputs([name], () => runEditorScript(controller, `
                document.querySelector('#rename').click();
                await waitFor(() => document.querySelector('#invocation-name').textContent === decodeURIComponent('${encodeURIComponent(name).replace(/'/g, '%27')}'));
                document.querySelector('#url').value = '${invokeServer.baseUrl}/echo';
                document.querySelector('#body').value = 'saved body for a future POST';
                document.querySelector('#query-rows input').value = 'tag';
                document.querySelectorAll('#query-rows input')[1].value = 'saved query';
                document.querySelector('#header-rows input').value = 'x-functions-key';
                document.querySelectorAll('#header-rows input')[1].value = 'example-key';
                document.querySelector('#request-form').dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('#save').click();
                await waitFor(() => document.querySelector('#save').disabled && document.querySelector('#save-status').textContent === 'Saved for this session');
                document.querySelector('#url').value = '${invokeServer.baseUrl}/unsaved';
                document.querySelector('#url').dispatchEvent(new Event('input', { bubbles: true }));
                if (document.querySelector('#save').disabled) throw new Error('Editing did not enable Save.');
            `));
            assert.strictEqual(controller.panel.title, name);
            controller.panel.dispose();
            const saved = invoke.collection.get(draft.id);
            assert.ok(saved);
            assert.strictEqual(saved.name, name);
            assert.strictEqual(saved.group, 'Customers');
            assert.strictEqual(saved.request.url, `${invokeServer.baseUrl}/echo`);
            assert.strictEqual(saved.request.body, 'saved body for a future POST');
            assert.strictEqual(saved.request.headers[0].value, 'example-key');

            const reopened = new HttpRequestController(extensionContext, saved, true, updated => invoke.collection.save(updated));
            controllers.push(reopened);
            await runEditorScript(reopened, `
                if (document.querySelector('#invocation-name').textContent !== decodeURIComponent('${encodeURIComponent(name).replace(/'/g, '%27')}')) throw new Error('Saved name was not restored.');
                if (document.querySelector('#invocation-name img')) throw new Error('Name was interpreted as HTML.');
                if (document.querySelector('#url').value !== '${invokeServer.baseUrl}/echo') throw new Error('Saved URL was not restored.');
                if (document.querySelector('#body').value !== 'saved body for a future POST' || !document.querySelector('#body').disabled) throw new Error('Disabled request body was not retained.');
                if (document.querySelectorAll('#query-rows input')[1].value !== 'saved query') throw new Error('Query parameters were not restored.');
                if (document.querySelectorAll('#header-rows input')[1].value !== 'example-key') throw new Error('Headers were not restored.');
                if (!document.querySelector('#save').disabled) throw new Error('Unchanged saved request was marked dirty.');
                document.querySelector('#send').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                if (JSON.parse(document.querySelector('#response-body').textContent).body !== '') throw new Error('GET sent the disabled body.');
            `);
        } finally {
            controllers.forEach(controller => controller.panel.dispose());
            handler.dispose();
            invoke.dispose();
        }
    });

    test('response formatting preserves non-JSON bodies, malformed JSON, primitives, and original JSON tokens', () => {
        assert.strictEqual(formatResponseBody(compactResponseJson), formattedResponseJson);
        for (const body of ['', '  plain text\nunchanged  ', '<html>Not JSON</html>', '{"incomplete":', '{"trailing":true,}', '/* comment */ {"value":1}', 'null', 'true', '42', '[]', '{}', '"literal\\nvalue"']) {
            assert.strictEqual(formatResponseBody(body), body);
        }
        assert.strictEqual(formatResponseBody('{"escaped":"\\u0061\\n\\\"","duplicate":1,"duplicate":2}'),
            '{\n  "escaped": "\\u0061\\n\\\"",\n  "duplicate": 1,\n  "duplicate": 2\n}');
    });

    test('JSON responses are indented in the request editor without changing values', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const invoke = createInvoke();
        const invocation = { ...invoke.collection.createDraft(), request: request({ url: `${invokeServer.baseUrl}/format-json` }) };
        const editor = new HttpRequestController(context, invocation, false, saved => invoke.collection.save(saved));
        try {
            await runEditorScript(editor, `
                document.querySelector('#send').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                if (document.querySelector('#response-body').textContent !== ${JSON.stringify(formattedResponseJson)}) throw new Error('The request editor did not indent JSON while preserving its original values.');
                if (document.querySelector('#response-body img')) throw new Error('The response was interpreted as HTML.');
            `);
            invoke.collection.save(invocation);
        } finally {
            editor.panel.dispose();
            invoke.dispose();
        }
    });

    test('dependency pickers filter by name or ID, support keyboard selection, and list only chosen prerequisites', async () => {
        const invoke = await createInvokeWithEditors();
        const sources = Array.from({ length: 30 }, (_, index) => ({ id: `source-${index}`, name: `Create resource ${index}`, request: request() }));
        invoke.collection.saveAll(sources);
        const target = { id: 'search-target', name: 'Search dependencies', request: request() };
        const controller = invoke.editors.open(target, false);
        try {
            await runEditorScript(controller, `
                document.querySelector('#dependencies-tab').click();
                const section = document.querySelector('.response-bindings');
                const picker = section.querySelector('.request-picker input');
                if (section.querySelectorAll('.prerequisite-list label').length) throw new Error('Available requests were all listed.');
                picker.focus();
                picker.value = 'RESOURCE 29';
                picker.dispatchEvent(new Event('input', { bubbles: true }));
                if (section.querySelectorAll('.request-options [role="option"]').length !== 1) throw new Error('Case-insensitive filtering failed.');
                picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
                if (!picker.getAttribute('aria-activedescendant')) throw new Error('Keyboard navigation is not accessible.');
                picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                if (section.querySelectorAll('.prerequisite-list label').length !== 1) throw new Error('Selected prerequisite was not displayed.');
                section.querySelector('.prerequisite-list input').click();
                if (section.querySelectorAll('.prerequisite-list label').length) throw new Error('Removed prerequisite is still selected.');
                section.querySelector(':scope > button').click();
                const row = section.querySelector('.binding-row');
                row.querySelector('input').value = 'accountId';
                const source = row.querySelector('.request-picker input');
                source.focus();
                source.value = 'does not exist';
                source.dispatchEvent(new Event('input', { bubbles: true }));
                if (row.querySelector('.request-picker-empty').hidden) throw new Error('Empty search gives no feedback.');
                source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                source.value = 'source-7';
                source.dispatchEvent(new Event('input', { bubbles: true }));
                const options = row.querySelectorAll('[role="option"]');
                if (options.length !== 1 || options[0].dataset.sourceId !== 'source-7') throw new Error('ID search selected the wrong request.');
                source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
                source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                if (source.value !== 'Create resource 7') throw new Error('Chosen request label is missing.');
                source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
                source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                if (source.getAttribute('aria-expanded') !== 'false') throw new Error('Escape did not close the picker.');
                if (!section.querySelector('.prerequisite-list input').disabled) throw new Error('Implied prerequisite can be removed.');
                document.querySelector('#save').click();
                await waitFor(() => document.querySelector('#save').disabled);
            `);
            assert.deepStrictEqual(invoke.collection.get(target.id)?.request.bindings, [{ name: 'accountId', sourceId: 'source-7', pointer: '/body/id' }]);
            assert.strictEqual(invoke.collection.get(target.id)?.request.dependsOn, undefined);
            const saved = invoke.collection.get(target.id);
            assert.ok(saved);
            controller.panel.dispose();
            invoke.collection.save({ ...sources[7], name: 'Renamed source' });
            await runEditorScript(invoke.editors.open(saved, true), `
                await waitFor(() => document.querySelector('.binding-row .request-picker input').value === 'Renamed source');
                if (document.documentElement.scrollWidth > window.innerWidth) throw new Error('Dependency picker overflows the page.');
            `);
        } finally {
            invoke.dispose();
        }
    });

    test('users can author response links, run a chain, and reuse its output without repeating POST', async () => {
        const invoke = await createInvokeWithEditors();
        const [source, target] = accountChain();
        invoke.collection.save(source);
        const editor = invoke.editors.open({ ...target, request: { ...target.request, bindings: undefined } }, false);
        const before = invokeServer.receivedRequests;
        const accounts = invokeServer.accountBodies.length;
        try {
            await runEditorScript(editor, `
                document.querySelector('#dependencies-tab').click();
                if (document.querySelectorAll('.prerequisite-list label').length) throw new Error('Every available request is listed as a prerequisite.');
                document.querySelector('.response-bindings > button').click();
                const row = document.querySelector('.binding-row');
                row.querySelector('input').value = 'accountId';
                const picker = row.querySelector('.request-picker input');
                picker.focus();
                picker.value = 'create acc';
                picker.dispatchEvent(new Event('input', { bubbles: true }));
                row.querySelector('[role="option"]').click();
                row.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
                if (document.querySelector('#run-chain').hidden) throw new Error('Run chain is unavailable.');
                document.querySelector('#save').click();
                await waitFor(() => document.querySelector('#save').disabled);
                document.querySelector('#send').click();
                await waitFor(() => !document.querySelector('#error').hidden);
                if (!document.querySelector('#error').textContent.includes('current successful result')) throw new Error('Missing prerequisites were not explained.');
                document.querySelector('#run-chain').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                const first = JSON.parse(document.querySelector('#response-body').textContent);
                if (!first.id.startsWith('account/') || !first.id.endsWith(' ?#')) throw new Error('The response ID was not encoded into the URL correctly.');
                if (!document.querySelector('#url').value.includes('{{accountId}}')) throw new Error('The variable was replaced in the saved definition.');
                document.querySelector('#send').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                if (JSON.parse(document.querySelector('#response-body').textContent).id !== first.id) throw new Error('Send did not reuse the prior result.');
            `);
            assert.strictEqual(invokeServer.receivedRequests, before + 3);
            assert.strictEqual(invokeServer.accountBodies.length, accounts + 1);
            assert.deepStrictEqual(invoke.collection.get(target.id)?.request.bindings, target.request.bindings);
            const content = serializeInvocationCollection(invoke.collection.list());
            assert.strictEqual(JSON.parse(content).version, 2);
            assert.ok(!content.includes(`account/${invokeServer.accountNumber} ?#`));
            assert.deepStrictEqual(parseInvocationCollection(content), invoke.collection.list());
            assert.strictEqual(invoke.editors.size, 1);
        } finally {
            invoke.dispose();
        }
    });
});
