/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError } from '@microsoft/vscode-azext-utils';
import { McpTool } from '@microsoft/vscode-inproc-mcp/mcp';
import * as assert from 'assert';
import { createServer } from 'http';
import { type AddressInfo } from 'net';
import * as os from 'os';
import * as vscode from 'vscode';
import * as z from 'zod/mini';
import { parseInvocationCollection, serializeInvocationCollection } from '../../src/azureInvoke/collectionFile';
import { planInvocationChain } from '../../src/azureInvoke/httpInvocation';
import { type HttpInvocation } from '../../src/azureInvoke/models/httpSchema';
import { listHttpInvocationsTool } from '../../src/chat/tools/azureInvoke/listHttpInvocationsTool';
import { accountChain, createInvokeWithEditors, getTreeItem, request, runEditorScript, testServer, useInvokeTestServer } from './azureInvokeTestUtils';
import { invokeErrorPatterns } from './invokeTestExpectations';

const chainErrorPatterns = {
    invalidBindingName: /other than guid/,
    prerequisiteFailed: /prerequisite returned a non-success/,
    dependencyCycle: /cycle/,
    missingDependency: /unavailable/,
    invocationBusy: /already running/,
};

suite('Azure Invoke request chains', () => {
    useInvokeTestServer();

    // ---- Planning and binding resolution ----

    test('plans each prerequisite once, before the requests that need it, with the target last', () => {
        // target needs left and right, and both of them need shared.
        const shared = { id: 'shared', name: 'Shared', request: request() };
        const left = { id: 'left', name: 'Left', request: request({ dependsOn: [shared.id] }) };
        const right = { id: 'right', name: 'Right', request: request({ dependsOn: [shared.id] }) };
        const target = { id: 'target', name: 'Target', request: request({ dependsOn: [left.id, right.id] }) };
        const invocations = [shared, left, right, target];

        const plan = planInvocationChain(target, id => invocations.find(invocation => invocation.id === id));

        assert.deepStrictEqual(plan.map(invocation => invocation.id), [shared.id, left.id, right.id, target.id]);
    });

    test('generated inputs reject reserved binding names and invalid or stale linked request fields', async () => {
        const invoke = await createInvokeWithEditors();
        const source = { id: 'input-source', name: 'Input source', request: request({ method: 'POST', body: '{"email":"invoke-{{guid}}@example.com"}' }) };
        const target = {
            id: 'use-input', name: 'Use input',
            request: request({ query: [{ name: 'email', value: '{{email}}' }], bindings: [{ name: 'email', sourceId: source.id, pointer: '/request/body/email' }] }),
        };
        invoke.collection.saveMany([target, source]);
        try {
            const action = await createTestActionContext();
            const before = testServer.receivedRequests;
            for (const name of ['guid', '', 'a'.repeat(65), 'account id', 'account\nid', 'account{id}']) {
                assert.throws(() => invoke.collection.save({ ...target, request: { ...target.request, bindings: [{ name, sourceId: source.id, pointer: '/body' }] } }), chainErrorPatterns.invalidBindingName);
            }
            await assert.rejects(invoke.chainRunner.sendRequest(action, { ...target, request: { ...target.request, url: 'http://{{guid}}/echo' } }, { saved: true, runDependencies: true }), invokeErrorPatterns.variableInUrlHost);
            assert.strictEqual(testServer.receivedRequests, before, 'An invalid generator destination ran its prerequisite.');
            await invoke.chainRunner.sendRequest(action, target, { saved: true, runDependencies: true });
            invoke.collection.save({ ...source, request: { ...source.request, body: '{"email":"changed-{{guid}}@example.com"}' } });
            await assert.rejects(invoke.chainRunner.sendRequest(action, target, { saved: true }), invokeErrorPatterns.noSuccessfulPrerequisite);
            invoke.collection.save({ ...source, request: { ...source.request, body: 'not JSON' } });
            await assert.rejects(invoke.chainRunner.sendRequest(action, target, { saved: true, runDependencies: true }), invokeErrorPatterns.invalidLinkedRequestJson);
            invoke.collection.save({ ...source, request: { ...source.request, body: '{}' } });
            await assert.rejects(invoke.chainRunner.sendRequest(action, target, { saved: true, runDependencies: true }), invokeErrorPatterns.missingBindingField);
        } finally {
            invoke.dispose();
        }
    });

    test('response links preserve JSON types, safely encode values, and select headers, arrays, and escaped keys', async () => {
        const invoke = await createInvokeWithEditors();
        const [source] = accountChain();
        invoke.collection.save(source);
        const target: HttpInvocation = {
            id: 'typed-values', name: 'Use response values',
            request: request({
                method: 'POST', headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-account', value: '{{account-id}}' }],
                query: [{ name: 'id', value: '{{account-id}}' }, { name: 'unused', value: '{{notDefined}}', enabled: false }],
                body: '{"id":"{{account-id}}","count":"{{2faCount}}","active":"{{active}}","nothing":"{{nothing}}","profile":"{{profile}}","text":"Hello {{display}}","first":"{{first}}","escaped":"{{escaped}}","status":"{{status}}","location":"{{location}}"}',
                bindings: [
                    ['account-id', '/body/id'], ['2faCount', '/body/count'], ['active', '/body/active'], ['nothing', '/body/nothing'],
                    ['profile', '/body/profile'], ['display', '/body/profile/name'], ['first', '/body/items/0/id'],
                    ['escaped', '/body/a~1b/~0id'], ['status', '/status'], ['location', '/headers/location'],
                ].map(([name, pointer]) => ({ name, pointer, sourceId: source.id })),
            }),
        };
        invoke.collection.save(target);
        try {
            const result = await invoke.chainRunner.sendRequest(await createTestActionContext(), target, { saved: true, runDependencies: true });
            const echo = JSON.parse(result.body);
            const body = JSON.parse(echo.body);
            assert.strictEqual(body.count, 0);
            assert.strictEqual(body.active, false);
            assert.strictEqual(body.nothing, null);
            assert.deepStrictEqual(body.profile, { name: 'A "quoted" name\n' });
            assert.strictEqual(body.text, 'Hello A "quoted" name\n');
            assert.strictEqual(body.first, 'first');
            assert.strictEqual(body.escaped, 42);
            assert.strictEqual(body.status, 201);
            assert.strictEqual(body.location, `${testServer.baseUrl}/accounts/${encodeURIComponent(body.id)}`);
            assert.strictEqual(echo.headers['x-account'], body.id);
            assert.strictEqual(new URL(echo.url, testServer.baseUrl).searchParams.get('id'), body.id);
            assert.strictEqual(new URL(echo.url, testServer.baseUrl).searchParams.has('unused'), false);
        } finally {
            invoke.dispose();
        }
    });

    // ---- Failure, recovery, and run isolation ----

    // Exercise both an HTTP error response and a connection that closes without a response.
    for (const route of ['/error', '/drop']) {
        test(`requests blocked by prerequisite failures show warning icons (${route})`, async () => {
            const invoke = await createInvokeWithEditors();
            const source = { id: 'failed-prerequisite', name: 'Failing prerequisite', request: request({ url: `${testServer.baseUrl}${route}` }) };
            const middle = { id: 'blocked-middle', name: 'Blocked intermediate', request: request({ dependsOn: [source.id] }) };
            const target = { id: 'blocked-target', name: 'Blocked request', request: request({ dependsOn: [middle.id] }) };
            invoke.collection.saveMany([source, middle, target]);
            const before = testServer.receivedRequests;
            try {
                const editor = invoke.editorManager.open(target, true);
                await runEditorScript(editor, `
                    document.querySelector('#run-chain').click();
                    await waitFor(() => !document.querySelector('#error').hidden);
                    if (!document.querySelector('#error').classList.contains('request-warning')) throw new Error('The blocked request is still presented as a failure.');
                `);
                assert.strictEqual(testServer.receivedRequests, before + 1, 'A blocked request was sent.');
                assert.strictEqual((getTreeItem(invoke, source.id).iconPath as vscode.ThemeIcon).id, 'error');
                for (const invocation of [middle, target]) {
                    assert.strictEqual((getTreeItem(invoke, invocation.id).iconPath as vscode.ThemeIcon).id, 'warning');
                    assert.strictEqual(invoke.chainRunner.getStatus(invocation.id)?.state, 'blocked');
                }
                const definition = listHttpInvocationsTool(invoke.collection, invoke.chainRunner);
                const list = new McpTool(definition.name, definition.execute, definition);
                const statuses = z.object({ structuredContent: z.object({ invocations: z.array(z.object({ status: z.string() })) }) })
                    .parse(await list.executeMcp(undefined, { signal: new AbortController().signal, requestId: 'blocked-status' }));
                assert.deepStrictEqual(statuses.structuredContent.invocations.map(invocation => invocation.status), ['failed', 'blocked', 'blocked']);

                // Repair the prerequisite and verify that the entire chain can run again.
                invoke.collection.save({ ...source, request: request() });
                await invoke.chainRunner.sendRequest(await createTestActionContext(), target, { saved: true, runDependencies: true });
                assert.strictEqual(testServer.receivedRequests, before + 4);
                for (const invocation of [source, middle, target]) {
                    assert.strictEqual((getTreeItem(invoke, invocation.id).iconPath as vscode.ThemeIcon).id, 'pass');
                }
            } finally {
                invoke.dispose();
            }
        });
    }

    test('dependent runs reject missing fields, failed or changed prerequisites, and invalid templates without stale fallback', async () => {
        const invoke = await createInvokeWithEditors();
        const [source, target] = accountChain();
        invoke.collection.replaceAll([target, source]);
        try {
            const action = await createTestActionContext();
            const requestCountBeforeSend = testServer.receivedRequests;
            await assert.rejects(invoke.chainRunner.sendRequest(action, target, { saved: true }), invokeErrorPatterns.noSuccessfulPrerequisite);
            assert.strictEqual(testServer.receivedRequests, requestCountBeforeSend);

            // A successful prerequisite is not enough if its response is missing the bound field.
            await invoke.chainRunner.sendRequest(action, source, { saved: true });
            const requestCountAfterPrerequisite = testServer.receivedRequests;
            const targetWithMissingField = {
                ...target,
                request: { ...target.request, bindings: [{ name: 'accountId', sourceId: source.id, pointer: '/body/missing' }] },
            };
            await assert.rejects(invoke.chainRunner.sendRequest(action, targetWithMissingField, { saved: true }), invokeErrorPatterns.missingBindingField);
            assert.strictEqual(testServer.receivedRequests, requestCountAfterPrerequisite);

            // Establish a working chain, then invalidate its successful result by editing the prerequisite.
            await invoke.chainRunner.sendRequest(action, target, { saved: true });
            invoke.collection.save({ ...source, request: { ...source.request, body: '{"changed":true}' } });
            await assert.rejects(invoke.chainRunner.sendRequest(action, target, { saved: true }), invokeErrorPatterns.noSuccessfulPrerequisite);
            invoke.collection.save({ ...source, request: request({ url: `${testServer.baseUrl}/error` }) });
            const requestCountBeforeFailingChain = testServer.receivedRequests;
            await assert.rejects(invoke.chainRunner.sendRequest(action, target, { saved: true, runDependencies: true }), chainErrorPatterns.prerequisiteFailed);
            assert.strictEqual(testServer.receivedRequests, requestCountBeforeFailingChain + 1);
            await assert.rejects(invoke.chainRunner.sendRequest(action, target, { saved: true }), invokeErrorPatterns.noSuccessfulPrerequisite);

            // A malformed target must fail preflight before the now-valid prerequisite can run.
            invoke.collection.save(source);
            const beforeInvalid = testServer.receivedRequests;
            for (const invalid of [
                { ...target.request, url: `${testServer.baseUrl}/accounts/{{missing}}` },
                { ...target.request, url: 'http://{{accountId}}/accounts' },
                { ...target.request, url: `${testServer.baseUrl}/accounts/{id}` },
                { ...target.request, method: 'POST' as const, body: '{"id":{{accountId}}}' },
                { ...target.request, method: 'POST' as const, body: '{"{{guid}}":"value"}' },
            ]) {
                await assert.rejects(invoke.chainRunner.sendRequest(action, { ...target, request: invalid }, { saved: true, runDependencies: true }));
            }
            assert.strictEqual(testServer.receivedRequests, beforeInvalid, 'An invalid target ran a mutating prerequisite.');
        } finally {
            invoke.dispose();
        }
    });

    test('dependency graphs reject cycles and missing sources and execute shared prerequisites only once', async () => {
        const invoke = await createInvokeWithEditors();
        const [source, target] = accountChain();
        const left = { ...target, id: 'left', name: 'Left' };
        const right = { ...target, id: 'right', name: 'Right' };
        const root = { id: 'root', name: 'Both', request: request({ dependsOn: [left.id, right.id] }) };
        invoke.collection.replaceAll([root, left, right, source]);
        try {
            assert.throws(() => invoke.collection.save({ ...source, request: { ...source.request, dependsOn: [root.id] } }), chainErrorPatterns.dependencyCycle);
            assert.throws(() => invoke.collection.save({ ...root, request: request({ dependsOn: ['missing'] }) }), chainErrorPatterns.missingDependency);
            const content = serializeInvocationCollection([source, target]);
            const file = JSON.parse(content);
            assert.throws(() => parseInvocationCollection(JSON.stringify({ ...file, invocations: file.invocations.slice(1) })), chainErrorPatterns.missingDependency);
            assert.deepStrictEqual(parseInvocationCollection(content), [source, target]);
            const before = testServer.receivedRequests;
            const accounts = testServer.accountBodies.length;
            await invoke.chainRunner.sendRequest(await createTestActionContext(), root, { saved: true, runDependencies: true });
            assert.strictEqual(testServer.receivedRequests, before + 4);
            assert.strictEqual(testServer.accountBodies.length, accounts + 1);
            await invoke.chainRunner.sendRequest(await createTestActionContext(), root, { saved: true });
            assert.strictEqual(testServer.receivedRequests, before + 5);
            await invoke.chainRunner.sendRequest(await createTestActionContext(), source, { saved: true });
            const afterSource = testServer.receivedRequests;
            await assert.rejects(invoke.chainRunner.sendRequest(await createTestActionContext(), root, { saved: true }), invokeErrorPatterns.noSuccessfulPrerequisite);
            assert.strictEqual(testServer.receivedRequests, afterSource, 'An old transitive result was reused.');
        } finally {
            invoke.dispose();
        }
    });

    test('chain cancellation aborts its prerequisite and overlapping runs cannot repeat side effects', async () => {
        const invoke = await createInvokeWithEditors();
        const source = { id: 'slow-source', name: 'Slow source', request: request({ url: `${testServer.baseUrl}/slow` }) };
        const target = { id: 'after-slow', name: 'After slow', request: request({ dependsOn: [source.id] }) };
        invoke.collection.replaceAll([source, target]);
        const abort = new AbortController();
        // Wait until the server has received the prerequisite before trying to run it again.
        const prerequisiteStarted = new Promise<void>(resolve => testServer.server.once('request', () => resolve()));
        const requestCountBeforeRun = testServer.receivedRequests;
        const chainRun = invoke.chainRunner.sendRequest(await createTestActionContext(), target, { signal: abort.signal, saved: true, runDependencies: true });
        try {
            await prerequisiteStarted;
            await assert.rejects(invoke.chainRunner.sendRequest(await createTestActionContext(), source, { saved: true }), chainErrorPatterns.invocationBusy);
            abort.abort();
            await assert.rejects(chainRun, isUserCancelledError);
            assert.strictEqual(testServer.receivedRequests, requestCountBeforeRun + 1);

            // Sending only the target cannot reuse a cancelled prerequisite.
            await assert.rejects(invoke.chainRunner.sendRequest(await createTestActionContext(), target, { saved: true }), invokeErrorPatterns.noSuccessfulPrerequisite);
            assert.strictEqual(testServer.receivedRequests, requestCountBeforeRun + 1);
        } finally {
            abort.abort();
            await chainRun.catch(() => { /* no-op */ });
            invoke.dispose();
        }
    });

    test('non-loopback targets are blocked before any request in their chain is sent', async () => {
        const address = Object.values(os.networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal);
        assert.ok(address);
        let remoteRequests = 0;
        const fixture = createServer((_request, response) => {
            remoteRequests++;
            response.end('private non-local response');
        });
        await new Promise<void>(resolve => fixture.listen(0, address.address, resolve));
        const invoke = await createInvokeWithEditors();
        const [source] = accountChain();
        const target = { id: 'non-local-target', name: 'Remote request', request: request({ url: `http://${address.address}:${(fixture.address() as AddressInfo).port}/echo`, dependsOn: [source.id] }) };
        invoke.collection.saveMany([source, target]);
        const before = testServer.receivedRequests;
        const accounts = testServer.accountBodies.length;
        try {
            const editor = invoke.editorManager.open(target, true);
            await runEditorScript(editor, `
                for (const action of ['#run-chain', '#send']) {
                    document.querySelector('#error').hidden = true;
                    document.querySelector(action).click();
                    await waitFor(() => !document.querySelector('#error').hidden);
                    if (!${invokeErrorPatterns.loopbackOnly}.test(document.querySelector('#error').textContent)) throw new Error(action + ' did not explain the local-only limit.');
                    if (!document.querySelector('#response-body').hidden) throw new Error(action + ' displayed a response.');
                }
            `);
            await assert.rejects(invoke.chainRunner.sendRequest(await createTestActionContext(), target, { saved: true, runDependencies: true }), invokeErrorPatterns.loopbackOnly);
            assert.strictEqual(remoteRequests, 0, 'A non-loopback request was sent.');
            assert.strictEqual(testServer.receivedRequests, before, 'A local prerequisite ran before the chain was rejected.');
            assert.strictEqual(testServer.accountBodies.length, accounts);
            assert.deepStrictEqual(invoke.collection.get(target.id), target, 'Remote URLs can still be saved.');
        } finally {
            invoke.dispose();
            fixture.closeAllConnections();
            await new Promise<void>((resolve, reject) => fixture.close(error => error ? reject(error) : resolve()));
        }
    });
});
