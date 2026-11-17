/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError } from '@microsoft/vscode-azext-utils';
import { McpTool, registerMcpTool } from '@microsoft/vscode-inproc-mcp/mcp';
import { startInProcHttpServer } from '@microsoft/vscode-inproc-mcp/vscode';
import * as assert from 'assert';
import * as z from 'zod/mini';
import { parseInvocationCollection, serializeInvocationCollection } from '../../src/azureInvoke/collectionFile';
import { createHttpInvocationTool } from '../../src/chat/tools/azureInvoke/createHttpInvocationTool';
import { listHttpInvocationsTool } from '../../src/chat/tools/azureInvoke/listHttpInvocationsTool';
import { runHttpInvocationTool } from '../../src/chat/tools/azureInvoke/runHttpInvocationTool';
import { mcpServerId } from '../../src/constants';
import { getTestApi } from '../utils/testApiAccess';
import { invokeServer, useInvokeTestServer, request, accountChain, invocation, createInvokeWithEditors, runEditorScript, createMcpClient, runResultSchema, findInvocationTab, waitForInvocationTab } from './azureInvokeTestUtils';

suite('Azure Invoke MCP tools', () => {
    useInvokeTestServer();

    test('MCP discovers and creates populated session invocations without sending requests', async () => {
        const extensionContext = (await getTestApi()).extensionVariables.getContext();
        assert.ok(extensionContext);
        assert.ok(extensionContext.extension.packageJSON.contributes.mcpServerDefinitionProviders.some(
            (provider: { id: string }) => provider.id === mcpServerId));
        const invoke = await createInvokeWithEditors();
        const mcp = await startInProcHttpServer({
            id: mcpServerId,
            serverLabel: 'Azure Invoke test',
            serverVersion: '1.0.0',
            transport: 'tcp',
            registerTools: server => {
                registerMcpTool(server, createHttpInvocationTool(invoke.collection));
                registerMcpTool(server, runHttpInvocationTool(invoke.collection, invoke.chainRunner));
            },
        });
        const rpc = createMcpClient(mcp);
        try {
            await rpc('initialize', {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 'azure-invoke-test', version: '1.0.0' },
            });
            await rpc('notifications/initialized', {}, true);
            const discovery = z.object({
                result: z.object({
                    tools: z.array(z.object({
                        name: z.string(),
                        inputSchema: z.object({ required: z.array(z.string()), properties: z.record(z.string(), z.unknown()) }),
                        annotations: z.object({ readOnlyHint: z.boolean(), destructiveHint: z.boolean(), idempotentHint: z.boolean(), openWorldHint: z.boolean() }),
                    })),
                }),
            }).parse(await rpc('tools/list', {}));
            assert.strictEqual(discovery.result.tools.length, 2);
            const tool = discovery.result.tools.find(tool => tool.name === 'create_http_invocation');
            assert.ok(tool);
            assert.deepStrictEqual(tool.inputSchema.required, ['name', 'url']);
            assert.deepStrictEqual(Object.keys(tool.inputSchema.properties).sort(), ['bindings', 'body', 'dependsOn', 'headers', 'method', 'name', 'query', 'url']);
            assert.deepStrictEqual(tool.annotations, { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
            const runTool = discovery.result.tools.find(tool => tool.name === 'run_http_invocation');
            assert.ok(runTool);
            assert.deepStrictEqual(runTool.inputSchema.required, ['id']);
            assert.deepStrictEqual(Object.keys(runTool.inputSchema.properties), ['id', 'runDependencies']);
            assert.deepStrictEqual(runTool.annotations, { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });

            const existing = invocation();
            invoke.collection.save(existing);
            const before = invokeServer.receivedRequests;
            const input = { name: 'AI-created request', ...invocation().request };
            const successSchema = z.object({
                result: z.object({
                    isError: z.optional(z.boolean()),
                    structuredContent: z.object({ id: z.string(), message: z.string() }),
                    content: z.array(z.object({ type: z.string(), text: z.string() })),
                }),
            });
            const created = successSchema.parse(await rpc('tools/call', { name: tool.name, arguments: input })).result;
            assert.notStrictEqual(created.isError, true);
            assert.ok(created.structuredContent.message.includes('has not been sent'));
            assert.ok(!JSON.stringify(created).includes('example-key'));
            const saved = invoke.collection.get(created.structuredContent.id);
            assert.deepStrictEqual(saved, { id: created.structuredContent.id, name: input.name, request: invocation().request });
            assert.ok(!findInvocationTab(input.name));
            assert.strictEqual(invoke.editorManager.size, 0);
            assert.deepStrictEqual(invoke.collection.get(existing.id), existing);

            const second = successSchema.parse(await rpc('tools/call', {
                name: tool.name,
                arguments: { name: 'Default GET', url: `${invokeServer.baseUrl}/echo` },
            })).result;
            assert.notStrictEqual(second.structuredContent.id, created.structuredContent.id);
            assert.deepStrictEqual(invoke.collection.get(second.structuredContent.id)?.request, request());
            assert.strictEqual(invoke.editorManager.size, 0);
            assert.strictEqual(invokeServer.receivedRequests, before);

            const credentialUrl = new URL(invokeServer.baseUrl);
            credentialUrl.username = 'example-user';
            credentialUrl.password = 'private-value';
            for (const invalid of [
                { ...input, name: ' ' },
                { ...input, name: 'a\nb' },
                { ...input, name: 'a'.repeat(61) },
                { ...input, method: 'TRACE' },
                { ...input, url: 'file:///private-value' },
                { ...input, url: 'private-value invalid URL' },
                { ...input, url: credentialUrl.toString() },
                { ...input, headers: [null] },
                { ...input, query: Array.from({ length: 101 }, () => ({ name: 'tag', value: 'private-value' })) },
                { ...input, body: '\u20ac'.repeat(2 * 1024 * 1024) },
            ]) {
                const response = await rpc('tools/call', { name: tool.name, arguments: invalid });
                const result = z.object({
                    result: z.optional(z.object({ isError: z.optional(z.boolean()) })),
                    error: z.optional(z.object({ code: z.number() })),
                }).parse(response);
                assert.ok(result.result?.isError || result.error);
                assert.ok(!JSON.stringify(response).includes('private-value'));
                assert.strictEqual(invoke.collection.list().length, 3);
                assert.strictEqual(invoke.editorManager.size, 0);
            }
            assert.strictEqual(invokeServer.receivedRequests, before);
            invoke.editorManager.closeAll();
            assert.strictEqual(invoke.editorManager.size, 0);
            assert.strictEqual(invoke.collection.list().length, 3);
            assert.ok(saved);
            invoke.editorManager.open(saved, true);
            await waitForInvocationTab(input.name);
            assert.strictEqual(invoke.editorManager.size, 1);
        } finally {
            mcp.disposable.dispose();
            invoke.dispose();
        }
    });

    test('MCP creation stays headless and cancellation creates no saved invocations', async () => {
        const invoke = await createInvokeWithEditors();
        try {
            const definition = createHttpInvocationTool(invoke.collection);
            const tool = new McpTool(definition.name, definition.execute, definition);
            const abort = new AbortController();
            abort.abort();
            const input = { name: 'private-value', url: `${invokeServer.baseUrl}/echo` };
            const cancelled = await tool.executeMcp(input, { signal: abort.signal, requestId: 'cancelled' });
            assert.ok('isError' in cancelled && cancelled.isError);
            assert.deepStrictEqual(invoke.collection.list(), []);
            assert.strictEqual(invoke.editorManager.size, 0);

            invoke.editorManager.open = () => { throw new Error('private-value editor failure'); };
            const created = await tool.executeMcp(input, { signal: new AbortController().signal, requestId: 'created' });
            assert.ok(!('isError' in created && created.isError));
            assert.ok(!JSON.stringify(created).includes('private-value'));
            assert.strictEqual(invoke.collection.list().length, 1);
            assert.strictEqual(invoke.editorManager.size, 0);
        } finally {
            invoke.dispose();
        }
    });

    test('agents can distinguish failed saved requests from requests that have not run', async () => {
        const invoke = await createInvokeWithEditors();
        const failed = { id: 'saved-failure', name: 'Failed request', group: 'Accounts', request: request({ url: `${invokeServer.baseUrl}/error` }) };
        const pending = { id: 'saved-pending', name: 'Not run', group: 'Accounts', request: request() };
        invoke.collection.saveAll([failed, pending]);
        const definition = listHttpInvocationsTool(invoke.collection, invoke.chainRunner);
        const tool = new McpTool(definition.name, definition.execute, definition);
        try {
            const editor = invoke.editorManager.open(failed, true);
            await runEditorScript(editor, `
                document.querySelector('#send').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
            `);
            const result = z.object({ structuredContent: z.object({
                invocations: z.array(z.object({ id: z.string(), status: z.optional(z.string()), statusCode: z.optional(z.number()), lastRunAt: z.optional(z.string()) })),
            }) }).parse(await tool.executeMcp(undefined, { signal: new AbortController().signal, requestId: 'saved-status' }));
            assert.deepStrictEqual(result.structuredContent.invocations.map(item => item.status), ['failed', 'notRun']);
            assert.strictEqual(result.structuredContent.invocations[0].statusCode, 503);
            assert.ok(result.structuredContent.invocations[0].lastRunAt);
            assert.strictEqual(result.structuredContent.invocations[1].lastRunAt, undefined);
            const slow = { ...pending, request: request({ url: `${invokeServer.baseUrl}/slow` }) };
            invoke.collection.save(slow);
            const abort = new AbortController();
            const started = new Promise<void>(resolve => invokeServer.server.once('request', () => resolve()));
            const running = invoke.chainRunner.send(await createTestActionContext(), slow, { signal: abort.signal, saved: true });
            await started;
            assert.strictEqual(invoke.chainRunner.getStatus(slow.id)?.state, 'running');
            abort.abort();
            await assert.rejects(running, isUserCancelledError);
            assert.strictEqual(invoke.chainRunner.getStatus(slow.id)?.state, 'cancelled');
        } finally {
            invoke.dispose();
        }
    });

    test('AI-authored GUID inputs stay consistent per request and dependent runs reuse the actual credentials', async () => {
        const invoke = await createInvokeWithEditors();
        const createDefinition = createHttpInvocationTool(invoke.collection);
        const create = new McpTool(createDefinition.name, createDefinition.execute, createDefinition);
        const listDefinition = listHttpInvocationsTool(invoke.collection, invoke.chainRunner);
        const list = new McpTool(listDefinition.name, listDefinition.execute, listDefinition);
        const runDefinition = runHttpInvocationTool(invoke.collection, invoke.chainRunner);
        const run = new McpTool(runDefinition.name, runDefinition.execute, runDefinition);
        const extras = { signal: new AbortController().signal, requestId: 'generated-inputs' };
        const savedSchema = z.object({ structuredContent: z.object({ id: z.string() }) });
        const before = invokeServer.receivedRequests;
        try {
            const source = savedSchema.parse(await create.executeMcp({
                name: 'Create unique account', method: 'POST', url: `${invokeServer.baseUrl}/accounts`,
                headers: [{ name: 'Content-Type', value: 'application/json' }],
                body: '{"email":"invoke-{{guid}}@example.com","password":"Invoke-{{guid}}-Aa1!"}',
            }, extras)).structuredContent.id;
            const target = savedSchema.parse(await create.executeMcp({
                name: 'Reuse account credentials', method: 'POST', url: `${invokeServer.baseUrl}/echo/{{guid}}`,
                query: [{ name: 'run', value: '{{guid}}' }],
                headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-run-id', value: '{{guid}}' }],
                body: '{"email":"{{accountEmail}}","password":"{{accountPassword}}","run":"{{guid}}","repeat":"{{guid}}"}',
                bindings: [
                    { name: 'accountEmail', sourceId: source, pointer: '/request/body/email' },
                    { name: 'accountPassword', sourceId: source, pointer: '/request/body/password' },
                ],
            }, extras)).structuredContent.id;
            const listed = await list.executeMcp(undefined, extras);
            assert.deepStrictEqual(z.object({
                structuredContent: z.object({ invocations: z.array(z.object({ id: z.string(), name: z.string(), method: z.string(), dependencyIds: z.array(z.string()) })) }),
            }).parse(listed).structuredContent.invocations, [
                { id: source, name: 'Create unique account', method: 'POST', dependencyIds: [] },
                { id: target, name: 'Reuse account credentials', method: 'POST', dependencyIds: [source] },
            ]);
            assert.ok(!JSON.stringify(listed).includes('password'));
            assert.ok(!JSON.stringify(listed).includes(invokeServer.baseUrl));
            assert.strictEqual(invokeServer.receivedRequests, before);
            const emails = new Set<string>();
            let lastEmail = '';
            for (const runDependencies of [undefined, undefined, false]) {
                const result = runResultSchema.parse(await run.executeMcp({ id: target, ...(runDependencies === undefined ? {} : { runDependencies }) }, extras));
                assert.notStrictEqual(result.isError, true);
                const echoed = JSON.parse(result.structuredContent.body ?? '');
                const body = JSON.parse(echoed.body);
                const created = JSON.parse(invokeServer.accountBodies[invokeServer.accountBodies.length - 1]);
                const sourceGuid = created.email.slice('invoke-'.length, -'@example.com'.length);
                assert.match(sourceGuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
                assert.strictEqual(created.password, `Invoke-${sourceGuid}-Aa1!`);
                assert.strictEqual(body.email, created.email);
                assert.strictEqual(body.password, created.password);
                assert.strictEqual(body.run, body.repeat);
                assert.strictEqual(body.run, echoed.headers['x-run-id']);
                assert.strictEqual(body.run, new URL(echoed.url, invokeServer.baseUrl).searchParams.get('run'));
                assert.strictEqual(new URL(echoed.url, invokeServer.baseUrl).pathname, `/echo/${body.run}`);
                assert.notStrictEqual(body.run, sourceGuid, 'Separate requests shared an implicit UUID.');
                if (runDependencies === false) {
                    assert.strictEqual(body.email, lastEmail, 'Cached Send regenerated source credentials.');
                } else {
                    assert.ok(!emails.has(body.email), 'A fresh chain reused an account email.');
                    emails.add(body.email);
                    lastEmail = body.email;
                }
                const exported = serializeInvocationCollection(invoke.collection.list());
                assert.ok(exported.includes('{{guid}}'));
                assert.ok(!exported.includes(created.email));
                assert.ok(!exported.includes(created.password));
                assert.deepStrictEqual(parseInvocationCollection(exported), invoke.collection.list());
            }
            assert.strictEqual(invokeServer.receivedRequests, before + 5);
            assert.strictEqual(invoke.editorManager.size, 0);
        } finally {
            invoke.dispose();
        }
    });

    test('MCP never exposes non-local prerequisite values through a localhost dependent response', async () => {
        const invoke = await createInvokeWithEditors();
        const [source, target] = accountChain();
        invoke.collection.replace([{ ...source, request: { ...source.request, url: 'https://example.invalid/accounts' } }, target]);
        invoke.chainRunner.send = async () => ({ status: 200, duration: 12, body: 'private-remote-value', headers: [{ name: 'content-type', value: 'application/json' }] });
        const definition = runHttpInvocationTool(invoke.collection, invoke.chainRunner);
        const tool = new McpTool(definition.name, definition.execute, definition);
        try {
            const result = runResultSchema.parse(await tool.executeMcp({ id: target.id, runDependencies: true }, { signal: new AbortController().signal, requestId: 'private-chain' }));
            assert.deepStrictEqual(result.structuredContent, { status: 200, duration: 12 });
        } finally {
            invoke.dispose();
        }
    });

    test('MCP shares full responses only for localhost and literal loopback targets', async () => {
        const invoke = await createInvokeWithEditors();
        const saved = invocation();
        const body = 'private-response-' + '\u03c0'.repeat(40 * 1024);
        const headers = [{ name: 'Content-Type', value: 'text/plain' }];
        const before = invokeServer.receivedRequests;
        invoke.chainRunner.send = async (_context, input) => {
            assert.deepStrictEqual(input.request, invoke.collection.get(saved.id)?.request);
            return {
                status: 200, duration: 17, body,
                headers: [
                    ...headers,
                    { name: 'Set-Cookie', value: 'private-cookie' },
                    { name: 'Authorization', value: 'private-authorization' },
                    { name: 'x-functions-key', value: 'private-key' },
                    { name: 'x-custom-secret', value: 'private-header' },
                ],
            };
        };
        const definition = runHttpInvocationTool(invoke.collection, invoke.chainRunner);
        const tool = new McpTool(definition.name, definition.execute, definition);
        const extras = { signal: new AbortController().signal, requestId: 'run' };
        try {
            for (const host of ['localhost', 'LOCALHOST', 'localhost.', '127.0.0.1', '127.1', '127.255.0.1', '[::1]', '[0:0:0:0:0:0:0:1]']) {
                invoke.collection.save({ ...saved, request: { ...saved.request, url: `http://${host}:7071/api/test` } });
                const result = await tool.executeMcp({ id: saved.id }, extras);
                assert.deepStrictEqual(runResultSchema.parse(result).structuredContent, { status: 200, duration: 17, body, headers });
                assert.ok(!JSON.stringify(result).includes('private-cookie'));
                assert.ok(!JSON.stringify(result).includes('private-header'));
            }
            for (const url of [
                'https://example.invalid/api/test',
                'http://localhost.example.invalid/',
                'http://127.0.0.1.example.invalid/',
                'http://example.invalid/localhost?host=127.0.0.1',
                'http://[::2]/',
                'http://192.168.1.1/',
                'http://0.0.0.0/',
            ]) {
                invoke.collection.save({ ...saved, request: { ...saved.request, url } });
                const result = await tool.executeMcp({ id: saved.id }, extras);
                assert.deepStrictEqual(runResultSchema.parse(result).structuredContent, { status: 200, duration: 17 });
                assert.ok(!JSON.stringify(result).includes('private-'));
                assert.ok(!JSON.stringify(result).includes('Content-Type'));
            }
            const missing = await tool.executeMcp({ id: 'private-missing-id' }, extras);
            assert.ok('isError' in missing && missing.isError);
            assert.ok(!JSON.stringify(missing).includes('private-missing-id'));
            const abort = new AbortController();
            abort.abort();
            const cancelled = await tool.executeMcp({ id: saved.id }, { signal: abort.signal, requestId: 'cancelled' });
            assert.ok('isError' in cancelled && cancelled.isError);
            assert.strictEqual(invokeServer.receivedRequests, before);
        } finally {
            invoke.dispose();
        }
    });

    test('MCP runs saved snapshots without overwriting unsaved editor fields and replays the full response', async () => {
        const invoke = await createInvokeWithEditors();
        const saved = invocation();
        invoke.collection.save(saved);
        const editor = invoke.editorManager.open(saved, true);
        const definition = runHttpInvocationTool(invoke.collection, invoke.chainRunner);
        const tool = new McpTool(definition.name, definition.execute, definition);
        const extras = { signal: new AbortController().signal, requestId: 'run' };
        let pending: ReturnType<typeof tool.executeMcp> | undefined;
        const subscription = editor.panel.webview.onDidReceiveMessage((message: unknown) => {
            if (message && typeof message === 'object' && 'testRun' in message) {
                pending = tool.executeMcp({ id: saved.id }, extras);
            }
        });
        try {
            await runEditorScript(editor, `
                document.querySelector('#url').value = '${invokeServer.baseUrl}/unsaved';
                document.querySelector('#body').value = 'unsaved body';
                document.querySelector('#url').dispatchEvent(new Event('input', { bubbles: true }));
                window.testApi.postMessage({ command: 'ready', testRun: true });
                await waitFor(() => !document.querySelector('#response-body').hidden);
                const response = JSON.parse(document.querySelector('#response-body').textContent);
                if (response.body !== '{"hello":"world"}' || response.method !== 'POST') throw new Error('The saved snapshot was not sent.');
                if (document.querySelector('#url').value !== '${invokeServer.baseUrl}/unsaved' || document.querySelector('#body').value !== 'unsaved body') throw new Error('Running overwrote unsaved fields.');
                if (document.querySelector('#save').disabled || document.querySelector('#saved-invocation-hint').hidden) throw new Error('Saved-snapshot state is not visible.');
            `);
            assert.ok(pending);
            const result = runResultSchema.parse(await pending).structuredContent;
            const echoed = JSON.parse(result.body ?? '');
            assert.strictEqual(echoed.url, '/echo?tag=a+%26+b');
            assert.strictEqual(echoed.headers['x-functions-key'], 'example-key');
            assert.deepStrictEqual(invoke.collection.get(saved.id), saved);
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#response-body').hidden);
                if (JSON.parse(document.querySelector('#response-body').textContent).body !== '{"hello":"world"}') throw new Error('Completed response was lost during initialization.');
                if (document.querySelector('#send').disabled || !document.querySelector('#abort').hidden) throw new Error('The completed request is still busy.');
            `);
            for (const method of ['GET', 'HEAD'] as const) {
                const snapshot = { ...saved, request: request({ method, body: 'preserved for POST' }) };
                invoke.collection.save(snapshot);
                const response = runResultSchema.parse(await tool.executeMcp({ id: saved.id }, extras)).structuredContent;
                assert.strictEqual(response.status, 200);
                assert.strictEqual(method === 'HEAD' ? response.body : JSON.parse(response.body ?? '').body, '');
                assert.deepStrictEqual(invoke.collection.get(saved.id), snapshot);
            }
            for (const [route, status] of [['/error', 503], ['/redirect', 302], ['/limit', 200], ['/private-response', 200]] as const) {
                invoke.collection.save({ ...saved, request: request({ url: `${invokeServer.baseUrl}${route}` }) });
                const before = invokeServer.receivedRequests;
                const response = runResultSchema.parse(await tool.executeMcp({ id: saved.id }, extras)).structuredContent;
                assert.strictEqual(response.status, status);
                assert.strictEqual(invokeServer.receivedRequests, before + 1);
                if (route === '/limit') {
                    assert.strictEqual(Buffer.byteLength(response.body ?? ''), 5 * 1024 * 1024);
                }
                if (route === '/private-response') {
                    assert.strictEqual(response.body, 'private-response-body');
                    assert.ok(!JSON.stringify(response).includes('private-cookie'));
                    await runEditorScript(editor, `
                        await waitFor(() => !document.querySelector('#response-body').hidden);
                        if (!document.querySelector('#response-headers pre').textContent.includes('private-cookie')) throw new Error('The local editor lost full headers.');
                    `);
                }
            }
            invoke.collection.save({ ...saved, request: request({ url: `${invokeServer.baseUrl}/drop?code=private-key` }) });
            const failed = await tool.executeMcp({ id: saved.id }, extras);
            assert.ok('isError' in failed && failed.isError);
            assert.strictEqual(invoke.chainRunner.getStatus(saved.id)?.state, 'failed');
            assert.ok(!JSON.stringify(failed).includes('private-key'));
            assert.ok(!serializeInvocationCollection(invoke.collection.list()).includes('private-response-body'));
        } finally {
            subscription.dispose();
            invoke.dispose();
        }
    });

    test('MCP execution supports editor cancellation, busy rejection, client cancellation, and closing the panel', async () => {
        const invoke = await createInvokeWithEditors();
        const saved = { ...invocation(), request: request({ url: `${invokeServer.baseUrl}/slow-body` }) };
        invoke.collection.save(saved);
        const definition = runHttpInvocationTool(invoke.collection, invoke.chainRunner);
        const tool = new McpTool(definition.name, definition.execute, definition);
        const extras = { signal: new AbortController().signal, requestId: 'run' };
        const editor = invoke.editorManager.open(saved, true);
        let pending: ReturnType<typeof tool.executeMcp> | undefined;
        let busy: ReturnType<typeof tool.executeMcp> | undefined;
        const subscription = editor.panel.webview.onDidReceiveMessage((message: unknown) => {
            if (message && typeof message === 'object' && 'testRun' in message) {
                if (message.testRun === 'start') {
                    pending = tool.executeMcp({ id: saved.id }, extras);
                } else if (message.testRun === 'busy') {
                    busy = tool.executeMcp({ id: saved.id }, extras);
                    void busy.then(() => editor.panel.webview.postMessage({ command: 'testBusyComplete' }));
                }
            }
        });
        try {
            await runEditorScript(editor, `
                let busyComplete = false;
                window.addEventListener('message', event => {
                    if (event.data.command === 'testBusyComplete') busyComplete = true;
                });
                window.testApi.postMessage({ command: 'ready', testRun: 'start' });
                await waitFor(() => !document.querySelector('#abort').hidden);
                window.testApi.postMessage({ command: 'ready', testRun: 'busy' });
                await waitFor(() => busyComplete);
                if (!document.querySelector('#send').disabled || document.querySelector('#abort').hidden) throw new Error('Busy rejection changed the active request state.');
                document.querySelector('#abort').click();
                await waitFor(() => !document.querySelector('#error').hidden);
                if (document.querySelector('#error').textContent !== 'Request cancelled.') throw new Error('Cancellation was not displayed.');
            `);
            assert.ok(pending);
            assert.ok(busy);
            for (const result of [await pending, await busy]) {
                assert.ok('isError' in result && result.isError);
                assert.ok(!JSON.stringify(result).includes('nonNull'));
            }
            for (const close of [false, true]) {
                const abort = new AbortController();
                const started = new Promise<void>(resolve => invokeServer.server.once('request', () => resolve()));
                const running = tool.executeMcp({ id: saved.id }, { signal: abort.signal, requestId: 'cancelled' });
                await started;
                if (close) {
                    editor.panel.dispose();
                } else {
                    abort.abort();
                }
                const result = await running;
                assert.ok('isError' in result && result.isError);
                assert.strictEqual(invoke.chainRunner.getStatus(saved.id)?.state, 'cancelled');
                assert.ok(!JSON.stringify(result).includes('nonNull'));
            }
            assert.deepStrictEqual(invoke.collection.get(saved.id), saved);
        } finally {
            subscription.dispose();
            invoke.dispose();
        }
    });
});
