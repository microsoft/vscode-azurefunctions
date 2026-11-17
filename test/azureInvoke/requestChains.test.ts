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
import { parseInvocationCollection } from '../../src/azureInvoke/collectionFile';
import { listHttpInvocationsTool } from '../../src/chat/tools/azureInvoke/listHttpInvocationsTool';
import { type HttpInvocation } from '../../src/azureInvoke/model';
import { invokeServer, useInvokeTestServer, request, accountChain, createInvokeWithEditors, getTreeItem, runEditorScript } from './azureInvokeTestUtils';

suite('Azure Invoke request chains', () => {
    useInvokeTestServer();

    test('generated inputs reject reserved binding names and invalid or stale linked request fields', async () => {
        const invoke = await createInvokeWithEditors();
        const source = { id: 'input-source', name: 'Input source', request: request({ method: 'POST', body: '{"email":"invoke-{{guid}}@example.com"}' }) };
        const target = {
            id: 'use-input', name: 'Use input',
            request: request({ query: [{ name: 'email', value: '{{email}}' }], bindings: [{ name: 'email', sourceId: source.id, pointer: '/request/body/email' }] }),
        };
        invoke.collection.saveAll([target, source]);
        try {
            const action = await createTestActionContext();
            const before = invokeServer.receivedRequests;
            assert.throws(() => invoke.collection.save({ ...target, request: { ...target.request, bindings: [{ name: 'guid', sourceId: source.id, pointer: '/body' }] } }), /other than guid/);
            await assert.rejects(invoke.chainRunner.send(action, { ...target, request: { ...target.request, url: 'http://{{guid}}/echo' } }, { saved: true, runDependencies: true }), /fixed HTTP/);
            assert.strictEqual(invokeServer.receivedRequests, before, 'An invalid generator destination ran its prerequisite.');
            await invoke.chainRunner.send(action, target, { saved: true, runDependencies: true });
            invoke.collection.save({ ...source, request: { ...source.request, body: '{"email":"changed-{{guid}}@example.com"}' } });
            await assert.rejects(invoke.chainRunner.send(action, target, { saved: true }), /current successful result/);
            invoke.collection.save({ ...source, request: { ...source.request, body: 'not JSON' } });
            await assert.rejects(invoke.chainRunner.send(action, target, { saved: true, runDependencies: true }), /linked request body is not valid JSON/);
            invoke.collection.save({ ...source, request: { ...source.request, body: '{}' } });
            await assert.rejects(invoke.chainRunner.send(action, target, { saved: true, runDependencies: true }), /selected request or response field is missing/);
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
                method: 'POST', headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-account', value: '{{accountId}}' }],
                query: [{ name: 'id', value: '{{accountId}}' }, { name: 'unused', value: '{{notDefined}}', enabled: false }],
                body: '{"id":"{{accountId}}","count":"{{count}}","active":"{{active}}","nothing":"{{nothing}}","profile":"{{profile}}","text":"Hello {{display}}","first":"{{first}}","escaped":"{{escaped}}","status":"{{status}}","location":"{{location}}"}',
                bindings: [
                    ['accountId', '/body/id'], ['count', '/body/count'], ['active', '/body/active'], ['nothing', '/body/nothing'],
                    ['profile', '/body/profile'], ['display', '/body/profile/name'], ['first', '/body/items/0/id'],
                    ['escaped', '/body/a~1b/~0id'], ['status', '/status'], ['location', '/headers/location'],
                ].map(([name, pointer]) => ({ name, pointer, sourceId: source.id })),
            }),
        };
        invoke.collection.save(target);
        try {
            const result = await invoke.chainRunner.send(await createTestActionContext(), target, { saved: true, runDependencies: true });
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
            assert.strictEqual(body.location, `${invokeServer.baseUrl}/accounts/${encodeURIComponent(body.id)}`);
            assert.strictEqual(echo.headers['x-account'], body.id);
            assert.strictEqual(new URL(echo.url, invokeServer.baseUrl).searchParams.get('id'), body.id);
            assert.strictEqual(new URL(echo.url, invokeServer.baseUrl).searchParams.has('unused'), false);
        } finally {
            invoke.dispose();
        }
    });

    for (const route of ['/error', '/drop']) {
        test(`requests blocked by prerequisite failures show warning icons (${route})`, async () => {
            const invoke = await createInvokeWithEditors();
            const source = { id: 'failed-prerequisite', name: 'Failing prerequisite', request: request({ url: `${invokeServer.baseUrl}${route}` }) };
            const middle = { id: 'blocked-middle', name: 'Blocked intermediate', request: request({ dependsOn: [source.id] }) };
            const target = { id: 'blocked-target', name: 'Blocked request', request: request({ dependsOn: [middle.id] }) };
            invoke.collection.saveAll([source, middle, target]);
            const before = invokeServer.receivedRequests;
            try {
                const editor = invoke.editorManager.open(target, true);
                await runEditorScript(editor, `
                    document.querySelector('#run-chain').click();
                    await waitFor(() => !document.querySelector('#error').hidden);
                    if (!document.querySelector('#error').classList.contains('request-warning')) throw new Error('The blocked request is still presented as a failure.');
                `);
                assert.strictEqual(invokeServer.receivedRequests, before + 1, 'A blocked request was sent.');
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
                invoke.collection.save({ ...source, request: request() });
                await invoke.chainRunner.send(await createTestActionContext(), target, { saved: true, runDependencies: true });
                assert.strictEqual(invokeServer.receivedRequests, before + 4);
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
        invoke.collection.replace([target, source]);
        try {
            const action = await createTestActionContext();
            const before = invokeServer.receivedRequests;
            await assert.rejects(invoke.chainRunner.send(action, target, { saved: true }), /current successful result/);
            assert.strictEqual(invokeServer.receivedRequests, before);
            await invoke.chainRunner.send(action, source, { saved: true });
            const afterSource = invokeServer.receivedRequests;
            await assert.rejects(invoke.chainRunner.send(action, { ...target, request: {
                ...target.request, bindings: [{ name: 'accountId', sourceId: source.id, pointer: '/body/missing' }],
            } }, { saved: true }), /selected request or response field is missing/);
            assert.strictEqual(invokeServer.receivedRequests, afterSource);
            await invoke.chainRunner.send(action, target, { saved: true });
            invoke.collection.save({ ...source, request: { ...source.request, body: '{"changed":true}' } });
            await assert.rejects(invoke.chainRunner.send(action, target, { saved: true }), /current successful result/);
            invoke.collection.save({ ...source, request: request({ url: `${invokeServer.baseUrl}/error` }) });
            const afterFailure = invokeServer.receivedRequests;
            await assert.rejects(invoke.chainRunner.send(action, target, { saved: true, runDependencies: true }), /prerequisite returned a non-success/);
            assert.strictEqual(invokeServer.receivedRequests, afterFailure + 1);
            await assert.rejects(invoke.chainRunner.send(action, target, { saved: true }), /current successful result/);
            invoke.collection.save(source);
            const beforeInvalid = invokeServer.receivedRequests;
            for (const invalid of [
                { ...target.request, url: `${invokeServer.baseUrl}/accounts/{{missing}}` },
                { ...target.request, url: 'http://{{accountId}}/accounts' },
                { ...target.request, url: `${invokeServer.baseUrl}/accounts/{id}` },
                { ...target.request, method: 'POST' as const, body: '{"id":{{accountId}}}' },
                { ...target.request, method: 'POST' as const, body: '{"{{guid}}":"value"}' },
            ]) {
                await assert.rejects(invoke.chainRunner.send(action, { ...target, request: invalid }, { saved: true, runDependencies: true }));
            }
            assert.strictEqual(invokeServer.receivedRequests, beforeInvalid, 'An invalid target ran a mutating prerequisite.');
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
        invoke.collection.replace([root, left, right, source]);
        try {
            assert.throws(() => invoke.collection.save({ ...source, request: { ...source.request, dependsOn: [root.id] } }), /cycle/);
            assert.throws(() => invoke.collection.save({ ...root, request: request({ dependsOn: ['missing'] }) }), /unavailable/);
            assert.throws(() => parseInvocationCollection(JSON.stringify({ version: 2, invocations: [target] })), /unavailable/);
            assert.throws(() => parseInvocationCollection(JSON.stringify({ version: 1, invocations: [source, target] })), /version 2/);
            const before = invokeServer.receivedRequests;
            const accounts = invokeServer.accountBodies.length;
            await invoke.chainRunner.send(await createTestActionContext(), root, { saved: true, runDependencies: true });
            assert.strictEqual(invokeServer.receivedRequests, before + 4);
            assert.strictEqual(invokeServer.accountBodies.length, accounts + 1);
            await invoke.chainRunner.send(await createTestActionContext(), root, { saved: true });
            assert.strictEqual(invokeServer.receivedRequests, before + 5);
            await invoke.chainRunner.send(await createTestActionContext(), source, { saved: true });
            const afterSource = invokeServer.receivedRequests;
            await assert.rejects(invoke.chainRunner.send(await createTestActionContext(), root, { saved: true }), /current successful result/);
            assert.strictEqual(invokeServer.receivedRequests, afterSource, 'An old transitive result was reused.');
        } finally {
            invoke.dispose();
        }
    });

    test('chain cancellation aborts its prerequisite and overlapping runs cannot repeat side effects', async () => {
        const invoke = await createInvokeWithEditors();
        const source = { id: 'slow-source', name: 'Slow source', request: request({ url: `${invokeServer.baseUrl}/slow` }) };
        const target = { id: 'after-slow', name: 'After slow', request: request({ dependsOn: [source.id] }) };
        invoke.collection.replace([source, target]);
        const abort = new AbortController();
        const started = new Promise<void>(resolve => invokeServer.server.once('request', () => resolve()));
        const before = invokeServer.receivedRequests;
        const pending = invoke.chainRunner.send(await createTestActionContext(), target, { signal: abort.signal, saved: true, runDependencies: true });
        try {
            await started;
            await assert.rejects(invoke.chainRunner.send(await createTestActionContext(), source, { saved: true }), /already running/);
            abort.abort();
            await assert.rejects(pending, isUserCancelledError);
            assert.strictEqual(invokeServer.receivedRequests, before + 1);
            await assert.rejects(invoke.chainRunner.send(await createTestActionContext(), target, { saved: true }), /current successful result/);
            assert.strictEqual(invokeServer.receivedRequests, before + 1);
        } finally {
            abort.abort();
            await pending.catch(() => { /* no-op */ });
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
        invoke.collection.saveAll([source, target]);
        const before = invokeServer.receivedRequests;
        const accounts = invokeServer.accountBodies.length;
        try {
            const editor = invoke.editorManager.open(target, true);
            await runEditorScript(editor, `
                for (const action of ['#run-chain', '#send']) {
                    document.querySelector('#error').hidden = true;
                    document.querySelector(action).click();
                    await waitFor(() => !document.querySelector('#error').hidden);
                    if (!document.querySelector('#error').textContent.includes('limited support')) throw new Error(action + ' did not explain the local-only limit.');
                    if (!document.querySelector('#response-body').hidden) throw new Error(action + ' displayed a response.');
                }
            `);
            await assert.rejects(invoke.chainRunner.send(await createTestActionContext(), target, { saved: true, runDependencies: true }), /limited support/);
            assert.strictEqual(remoteRequests, 0, 'A non-loopback request was sent.');
            assert.strictEqual(invokeServer.receivedRequests, before, 'A local prerequisite ran before the chain was rejected.');
            assert.strictEqual(invokeServer.accountBodies.length, accounts);
            assert.deepStrictEqual(invoke.collection.get(target.id), target, 'Remote URLs can still be saved.');
        } finally {
            invoke.dispose();
            fixture.closeAllConnections();
            await new Promise<void>((resolve, reject) => fixture.close(error => error ? reject(error) : resolve()));
        }
    });
});
