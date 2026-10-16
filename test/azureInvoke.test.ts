/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError, registerOnActionStartHandler, TestUserInput, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { McpTool, registerMcpTool } from '@microsoft/vscode-inproc-mcp/mcp';
import { startInProcHttpServer } from '@microsoft/vscode-inproc-mcp/vscode';
import * as assert from 'assert';
import * as fs from 'fs-extra';
import { createServer, type Server } from 'http';
import { type AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as z from 'zod/mini';
import { createHttpInvocationTool } from '../src/chat/tools/azureInvoke/createHttpInvocationTool';
import { draftHttpInvocationTool, getInvocationCollectionReviewTool, proposeInvocationCollectionTool } from '../src/chat/tools/azureInvoke/collectionReviewTools';
import { listHttpInvocationsTool } from '../src/chat/tools/azureInvoke/listHttpInvocationsTool';
import { runHttpInvocationTool } from '../src/chat/tools/azureInvoke/runHttpInvocationTool';
import { openCollectionFile, saveCollectionFile } from '../src/commands/azureInvoke/collectionFiles';
import { mcpServerId } from '../src/constants';
import { AzureInvokeTreeDataProvider } from '../src/tree/azureInvoke/AzureInvokeTreeDataProvider';
import { parseInvocationCollection, serializeInvocationCollection } from '../src/tree/azureInvoke/invocationCollection';
import { HttpRequestController } from '../src/webviews/azureInvoke/extension/HttpRequestController';
import { HttpRequestEditors } from '../src/webviews/azureInvoke/extension/HttpRequestEditors';
import { CollectionReviews } from '../src/webviews/azureInvoke/extension/CollectionReviews';
import { CollectionReviewController } from '../src/webviews/azureInvoke/extension/CollectionReviewController';
import { sendHttpRequest } from '../src/webviews/azureInvoke/extension/sendHttpRequest';
import { type HttpInvocation, type HttpRequest } from '../src/webviews/azureInvoke/shared/httpRequest';
import { type HttpInvocationCandidate, type InvocationCandidate } from '../src/webviews/azureInvoke/shared/collectionReview';
import { getTestApi } from './utils/testApiAccess';

suite('Azure Invoke', () => {
    let server: Server;
    let baseUrl: string;
    let receivedRequests = 0;
    const accountBodies: string[] = [];
    let accountNumber = 0;

    suiteSetup(async () => {
        server = createServer(async (request, response) => {
            receivedRequests++;
            if (request.url === '/slow') {
                return;
            }
            if (request.url === '/slow-body') {
                response.writeHead(200);
                response.write('waiting');
                return;
            }
            if (request.url === '/redirect') {
                response.writeHead(302, { location: `${baseUrl}/echo` });
                response.end('redirect');
                return;
            }
            if (request.url === '/large') {
                response.end('x'.repeat(5 * 1024 * 1024 + 1));
                return;
            }
            if (request.url === '/limit') {
                response.end('x'.repeat(5 * 1024 * 1024));
                return;
            }
            if (request.url === '/private-response') {
                response.writeHead(200, {
                    'content-type': 'text/plain',
                    'set-cookie': 'session=private-cookie',
                    'x-functions-key': 'private-key',
                    'x-custom-secret': 'private-header',
                });
                response.end('private-response-body');
                return;
            }
            if (request.url?.startsWith('/drop')) {
                request.socket.destroy();
                return;
            }
            if (request.url === '/error') {
                response.writeHead(503, { 'content-type': 'application/json' });
                response.end('{"error":"try again"}');
                return;
            }
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
                chunks.push(Buffer.from(chunk));
            }
            response.setHeader('content-type', 'application/json');
            if (request.method === 'POST' && request.url === '/accounts') {
                accountBodies.push(Buffer.concat(chunks).toString());
                const id = `account/${++accountNumber} ?#`;
                response.writeHead(201, { location: `${baseUrl}/accounts/${encodeURIComponent(id)}` });
                response.end(JSON.stringify({ id, count: 0, active: false, nothing: null, profile: { name: 'A "quoted" name\n' }, items: [{ id: 'first' }], 'a/b': { '~id': 42 } }));
                return;
            }
            if (request.method === 'GET' && request.url?.startsWith('/accounts/')) {
                response.end(JSON.stringify({ id: decodeURIComponent(request.url.slice('/accounts/'.length)) }));
                return;
            }
            response.end(JSON.stringify(request.url === '/size' ? { size: Buffer.concat(chunks).length } : {
                method: request.method,
                url: request.url,
                headers: request.headers,
                body: Buffer.concat(chunks).toString(),
            }));
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    suiteTeardown(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    });

    function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
        return { method: 'GET', url: `${baseUrl}/echo`, headers: [], query: [], body: '', ...overrides };
    }

    function httpCandidate(overrides: Partial<HttpInvocationCandidate> = {}): HttpInvocationCandidate {
        return { id: 'http', name: 'Get order', group: 'Orders', trigger: 'http', auth: 'anonymous', request: request(), description: 'An HTTP request template.', ...overrides };
    }

    function accountChain(): [HttpInvocation, HttpInvocation] {
        return [
            { id: 'create-account', name: 'Create account', request: request({ method: 'POST', url: `${baseUrl}/accounts`, body: '{}' }) },
            {
                id: 'get-account', name: 'Get account',
                request: request({ url: `${baseUrl}/accounts/{{accountId}}`, bindings: [{ name: 'accountId', sourceId: 'create-account', pointer: '/body/id' }] }),
            },
        ];
    }

    async function send(input: unknown, abort = new AbortController(), timeout = 2000) {
        return await sendHttpRequest(await createTestActionContext(), input, abort.signal, timeout);
    }

    test('sends method, query parameters, headers, and raw body to a local endpoint', async () => {
        const result = await send(request({
            method: 'POST',
            url: `${baseUrl}/echo?tag=first`,
            query: [{ name: 'tag', value: 'second' }, { name: 'name', value: 'a & b' }],
            headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-functions-key', value: 'example-key' }],
            body: '{"hello":"world"}',
        }));
        const echoed = JSON.parse(result.body);
        assert.strictEqual(result.status, 200);
        assert.ok(result.duration >= 0);
        assert.strictEqual(echoed.method, 'POST');
        assert.strictEqual(echoed.url, '/echo?tag=first&tag=second&name=a+%26+b');
        assert.strictEqual(echoed.headers['content-type'], 'application/json');
        assert.strictEqual(echoed.headers['x-functions-key'], 'example-key');
        assert.strictEqual(echoed.body, '{"hello":"world"}');
        assert.ok(result.headers.some(header => header.name === 'content-type'));
    });

    test('returns HTTP failures and their bodies without retrying', async () => {
        const count = receivedRequests;
        const result = await send(request({ method: 'POST', url: `${baseUrl}/error`, body: 'payload' }));
        assert.strictEqual(result.status, 503);
        assert.strictEqual(result.body, '{"error":"try again"}');
        assert.strictEqual(receivedRequests, count + 1);
    });

    test('does not follow redirects with function keys', async () => {
        const count = receivedRequests;
        const result = await send(request({
            url: `${baseUrl}/redirect`,
            headers: [{ name: 'x-functions-key', value: 'example-key' }],
        }));
        assert.strictEqual(result.status, 302);
        assert.strictEqual(result.body, 'redirect');
        assert.strictEqual(receivedRequests, count + 1);
    });

    test('HEAD responses have no body', async () => {
        const result = await send(request({ method: 'HEAD' }));
        assert.strictEqual(result.status, 200);
        assert.strictEqual(result.body, '');
    });

    test('keeps disabled parameter names without sending their empty or private values', async () => {
        const input = request({
            query: [{ name: 'page', value: '', enabled: false }, { name: 'empty', value: '', enabled: true }],
            headers: [{ name: 'x-functions-key', value: 'unused-private-key', enabled: false }],
        });
        const response = await send(input);
        const echoed = JSON.parse(response.body);
        assert.strictEqual(echoed.url, '/echo?empty=');
        assert.strictEqual(echoed.headers['x-functions-key'], undefined);
        const saved = { id: 'disabled-parameters', name: 'Get posts', request: input };
        assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection([saved])), [saved]);
        await assert.rejects(send({ ...input, query: [{ name: 'page', value: '', enabled: 'invalid' }] }), /Invalid HTTP request/);
    });

    test('validates input before sending a request', async () => {
        const count = receivedRequests;
        for (const invalid of [
            null,
            { ...request(), method: 'TRACE' },
            { ...request(), headers: [null] },
            request({ url: 'file:///etc/passwd' }),
            request({ url: 'not a URL' }),
            request({ url: `${baseUrl}/api/posts/{id}` }),
            request({ url: `${baseUrl}/api/posts/%7Bid%7D` }),
            request({ url: `${baseUrl}/api/posts/:id` }),
            request({ url: 'https://name:password@example.com' }),
            request({ body: 'GET body' }),
            request({ method: 'POST', body: 'x'.repeat(5 * 1024 * 1024 + 1) }),
            request({ query: [{ name: '', value: 'value' }] }),
            request({ headers: [{ name: 'bad\r\nheader', value: 'value' }] }),
            request({ headers: [{ name: 'x-test', value: 'bad\r\nvalue' }] }),
            request({ headers: Array.from({ length: 101 }, () => ({ name: 'x-test', value: 'value' })) }),
        ]) {
            await assert.rejects(send(invalid));
        }
        assert.strictEqual(receivedRequests, count);
    });

    test('rejects responses above the display limit', async () => {
        await assert.rejects(send(request({ url: `${baseUrl}/large` })), /5 MB display limit/);
    });

    test('accepts request and response bodies exactly at the size limit', async () => {
        const body = 'x'.repeat(5 * 1024 * 1024);
        const uploaded = await send(request({ method: 'POST', url: `${baseUrl}/size`, body }));
        assert.strictEqual(JSON.parse(uploaded.body).size, Buffer.byteLength(body));
        const downloaded = await send(request({ url: `${baseUrl}/limit` }));
        assert.strictEqual(Buffer.byteLength(downloaded.body), Buffer.byteLength(body));
    });

    test('does not expose request secrets in transport errors', async () => {
        await assert.rejects(send(request({ url: `${baseUrl}/drop?code=example-key` })), (error: unknown) =>
            error instanceof Error && !error.message.includes('example-key') && !('cause' in error));
    });

    test('cancels an in-flight request', async () => {
        const abort = new AbortController();
        const pending = send(request({ url: `${baseUrl}/slow` }), abort);
        const timer = setTimeout(() => abort.abort(), 50);
        try {
            await assert.rejects(pending, isUserCancelledError);
        } finally {
            clearTimeout(timer);
        }
    });

    for (const route of ['/slow', '/slow-body']) {
        test(`times out requests to ${route}`, async () => {
            await assert.rejects(send(request({ url: `${baseUrl}${route}` }), undefined, 50), /Request timed out/);
        });
    }

    test('saves named snapshots without adding drafts or exposing request data in command arguments', () => {
        const provider = new AzureInvokeTreeDataProvider();
        try {
            assert.deepStrictEqual(provider.getChildren(), []);
            const first = provider.createRequest();
            const second = provider.createRequest();
            assert.deepStrictEqual(provider.getChildren(), []);
            const saved = { ...first, name: 'My endpoint', request: request({ headers: [{ name: 'x-functions-key', value: 'example-key' }] }) };
            provider.saveRequest(saved);
            const item = provider.getTreeItem(provider.getChildren()[0]);
            assert.strictEqual(item.label, saved.name);
            assert.strictEqual(item.command?.command, 'azureFunctions.azureInvoke.open');
            assert.deepStrictEqual(item.command?.arguments, [{ id: first.id }]);
            assert.deepStrictEqual(provider.getChildren(first), []);
            saved.request.headers[0].value = 'unsaved edit';
            assert.strictEqual(provider.getRequest(first.id)?.request.headers[0].value, 'example-key');
            const reopened = provider.getRequest(first.id);
            assert.ok(reopened);
            reopened.request.headers[0].value = 'another unsaved edit';
            assert.strictEqual(provider.getRequest(first.id)?.request.headers[0].value, 'example-key');
            provider.saveRequest({ ...reopened, name: 'Renamed endpoint' });
            assert.strictEqual(provider.getChildren().length, 1);
            assert.strictEqual(provider.getChildren()[0].name, 'Renamed endpoint');
            assert.notStrictEqual(first.id, second.id);
        } finally {
            provider.dispose();
        }
        assert.deepStrictEqual(provider.getChildren(), []);
        const nextSession = new AzureInvokeTreeDataProvider();
        assert.deepStrictEqual(nextSession.getChildren(), []);
        nextSession.dispose();
    });

    function invocation(): HttpInvocation {
        return {
            id: 'saved-invocation',
            name: "Customer's endpoint",
            request: request({
                method: 'POST',
                headers: [{ name: 'x-functions-key', value: 'example-key' }],
                query: [{ name: 'tag', value: 'a & b' }],
                body: '{"hello":"world"}',
            }),
        };
    }

    test('round trips a versioned collection with all request fields', () => {
        const saved = invocation();
        assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection([saved])), [saved]);
        assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection([])), []);
    });

    test('rejects invalid collections without replacing existing saved invocations', () => {
        const provider = new AzureInvokeTreeDataProvider();
        const saved = invocation();
        provider.saveRequest(saved);
        try {
            for (const invalid of [
                'private-value invalid JSON',
                'null',
                '[]',
                JSON.stringify({ version: 3, invocations: [] }),
                JSON.stringify({ version: 1, invocations: {} }),
                JSON.stringify({ version: 1, invocations: [saved, saved] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, name: ' ' }] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, name: 'a\nb' }] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, request: { ...saved.request, method: 'TRACE' } }] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, request: { ...saved.request, body: 'x'.repeat(5 * 1024 * 1024 + 1) } }] }),
            ]) {
                assert.throws(() => provider.replaceRequests(parseInvocationCollection(invalid)), (error: unknown) =>
                    error instanceof Error && !error.message.includes('private-value'));
                assert.deepStrictEqual(provider.getChildren(), [saved]);
            }
            assert.throws(() => provider.replaceRequests([saved, saved]), /duplicate invocation IDs/);
            assert.deepStrictEqual(provider.getChildren(), [saved]);
        } finally {
            provider.dispose();
        }
    });

    test('exports only after confirming plaintext credentials and an existing-file overwrite', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-invoke-'));
        const target = vscode.Uri.file(path.join(directory, 'collection.json'));
        const context = await createTestActionContext();
        const ui = new TestUserInput(vscode);
        context.ui = ui;
        const saved = invocation();
        try {
            const cancelledContext = await createTestActionContext();
            cancelledContext.ui.showWarningMessage = async () => { throw new UserCancelledError(); };
            await assert.rejects(saveCollectionFile(cancelledContext, [saved], target), isUserCancelledError);
            assert.strictEqual(await fs.pathExists(target.fsPath), false);
            await ui.runWithInputs(['Save Collection'], () => saveCollectionFile(context, [saved], target));
            assert.deepStrictEqual(await openCollectionFile(context, target), [saved]);

            const renamed = { ...saved, name: 'Renamed endpoint' };
            await assert.rejects(saveCollectionFile(cancelledContext, [renamed], target), isUserCancelledError);
            assert.deepStrictEqual(await openCollectionFile(context, target), [saved]);
            await ui.runWithInputs(['Save Collection', 'Overwrite'], () => saveCollectionFile(context, [renamed], target));
            assert.deepStrictEqual(await openCollectionFile(context, target), [renamed]);
            await assert.rejects(saveCollectionFile(context, [], target), /Save an invocation/);
        } finally {
            await fs.remove(directory);
        }
    });

    const editorDocuments = new WeakMap<object, string>();

    async function runEditorScript(controller: { readonly panel: vscode.WebviewPanel }, script: string): Promise<void> {
        let timer: NodeJS.Timeout | undefined;
        let subscription: vscode.Disposable | undefined;
        try {
            await new Promise<void>((resolve, reject) => {
                timer = setTimeout(() => reject(new Error('Azure Invoke editor did not finish the interaction.')), 10000);
                subscription = controller.panel.webview.onDidReceiveMessage((message: unknown) => {
                    if (message && typeof message === 'object' && 'testResult' in message) {
                        if (message.testResult === true) {
                            resolve();
                        } else {
                            reject(new Error(String(message.testResult)));
                        }
                    }
                });
                const html = editorDocuments.get(controller) ?? controller.panel.webview.html;
                editorDocuments.set(controller, html);
                const nonce = /nonce="([^"]+)"/.exec(html)?.[1];
                assert.ok(nonce);
                controller.panel.webview.html = html.replace('acquireVsCodeApi()', 'window.testApi = acquireVsCodeApi()')
                    .replace('</body>', `<script nonce="${nonce}">
                        async function waitFor(predicate) {
                            if (predicate()) return;
                            await new Promise((resolve, reject) => {
                                const observer = new MutationObserver(check);
                                const timer = setTimeout(() => finish(new Error('Editor state did not update: ' + predicate.toString())), 4000);
                                function finish(error) {
                                    observer.disconnect();
                                    clearTimeout(timer);
                                    window.removeEventListener('message', check);
                                    if (error) reject(error); else resolve();
                                }
                                function check() {
                                    try {
                                        if (predicate()) finish();
                                    } catch (error) {
                                        finish(error);
                                    }
                                }
                                observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
                                window.addEventListener('message', check);
                                check();
                            });
                        }
                        (async () => {
                            await waitFor(() => document.querySelector('#save') || document.querySelector('#confirm-collection'));
                            ${script}
                            window.testApi.postMessage({ command: 'ready', testResult: true });
                        })().catch(error => window.testApi.postMessage({ command: 'ready', testResult: error.message }));
                    </script></body>`);
            });
        } finally {
            clearTimeout(timer);
            subscription?.dispose();
        }
    }

    test('renames, saves, closes, and reopens a real request editor with its saved fields', async () => {
        const extensionContext = (await getTestApi()).extensionVariables.getContext();
        assert.ok(extensionContext);
        const provider = new AzureInvokeTreeDataProvider();
        const draft = provider.createRequest();
        const name = "Customer's </script><img src=x>";
        const ui = new TestUserInput(vscode);
        const handler = registerOnActionStartHandler(context => {
            if (context.callbackId === 'azureFunctions.azureInvoke.rename') {
                context.ui = ui;
            }
        });
        const controllers: HttpRequestController[] = [];
        try {
            const controller = new HttpRequestController(extensionContext, draft, false, saved => provider.saveRequest(saved));
            controllers.push(controller);
            await ui.runWithInputs([name], () => runEditorScript(controller, `
                document.querySelector('#rename').click();
                await waitFor(() => document.querySelector('#invocation-name').textContent === decodeURIComponent('${encodeURIComponent(name).replace(/'/g, '%27')}'));
                document.querySelector('#url').value = '${baseUrl}/echo';
                document.querySelector('#body').value = 'saved body for a future POST';
                document.querySelector('#query-rows input').value = 'tag';
                document.querySelectorAll('#query-rows input')[1].value = 'saved query';
                document.querySelector('#header-rows input').value = 'x-functions-key';
                document.querySelectorAll('#header-rows input')[1].value = 'example-key';
                document.querySelector('#request-form').dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('#save').click();
                await waitFor(() => document.querySelector('#save').disabled && document.querySelector('#save-status').textContent === 'Saved for this session');
                document.querySelector('#url').value = '${baseUrl}/unsaved';
                document.querySelector('#url').dispatchEvent(new Event('input', { bubbles: true }));
                if (document.querySelector('#save').disabled) throw new Error('Editing did not enable Save.');
            `));
            assert.strictEqual(controller.panel.title, name);
            controller.panel.dispose();
            const saved = provider.getRequest(draft.id);
            assert.ok(saved);
            assert.strictEqual(saved.name, name);
            assert.strictEqual(saved.request.url, `${baseUrl}/echo`);
            assert.strictEqual(saved.request.body, 'saved body for a future POST');
            assert.strictEqual(saved.request.headers[0].value, 'example-key');

            const reopened = new HttpRequestController(extensionContext, saved, true, updated => provider.saveRequest(updated));
            controllers.push(reopened);
            await runEditorScript(reopened, `
                if (document.querySelector('#invocation-name').textContent !== decodeURIComponent('${encodeURIComponent(name).replace(/'/g, '%27')}')) throw new Error('Saved name was not restored.');
                if (document.querySelector('#invocation-name img')) throw new Error('Name was interpreted as HTML.');
                if (document.querySelector('#url').value !== '${baseUrl}/echo') throw new Error('Saved URL was not restored.');
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
            provider.dispose();
        }
    });

    function createMcpClient(mcp: { serverUri: vscode.Uri; headers: Record<string, string> }) {
        let sessionId: string | undefined;
        let requestId = 0;
        return async (method: string, params: unknown, notification = false): Promise<unknown> => {
            const response = await fetch(mcp.serverUri.toString(), {
                method: 'POST',
                headers: {
                    ...mcp.headers,
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/event-stream',
                    ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
                },
                body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++requestId }), method, params }),
                signal: AbortSignal.timeout(5000),
            });
            sessionId = response.headers.get('mcp-session-id') ?? sessionId;
            assert.strictEqual(response.status, notification ? 202 : 200, `Unexpected HTTP status during MCP ${method}.`);
            if (notification) {
                await response.body?.cancel();
                return undefined;
            }
            const text = await response.text();
            const data = response.headers.get('content-type')?.includes('text/event-stream') ?
                text.split('\n').find(line => line.startsWith('data:'))?.slice(5) : text;
            assert.ok(data, 'MCP did not return a JSON-RPC message.');
            return JSON.parse(data);
        };
    }

    test('MCP discovers and creates populated session invocations without sending requests', async () => {
        const extensionContext = (await getTestApi()).extensionVariables.getContext();
        assert.ok(extensionContext);
        assert.ok(extensionContext.extension.packageJSON.contributes.mcpServerDefinitionProviders.some(
            (provider: { id: string }) => provider.id === mcpServerId));
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(extensionContext, provider);
        const mcp = await startInProcHttpServer({
            id: mcpServerId,
            serverLabel: 'Azure Invoke test',
            serverVersion: '1.0.0',
            transport: 'tcp',
            registerTools: server => {
                registerMcpTool(server, createHttpInvocationTool(provider));
                registerMcpTool(server, runHttpInvocationTool(provider, editors));
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
            provider.saveRequest(existing);
            const before = receivedRequests;
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
            const saved = provider.getRequest(created.structuredContent.id);
            assert.deepStrictEqual(saved, { id: created.structuredContent.id, name: input.name, request: invocation().request });
            assert.ok(!findInvocationTab(input.name));
            assert.strictEqual(editors.size, 0);
            assert.deepStrictEqual(provider.getRequest(existing.id), existing);

            const second = successSchema.parse(await rpc('tools/call', {
                name: tool.name,
                arguments: { name: 'Default GET', url: `${baseUrl}/echo` },
            })).result;
            assert.notStrictEqual(second.structuredContent.id, created.structuredContent.id);
            assert.deepStrictEqual(provider.getRequest(second.structuredContent.id)?.request, request());
            assert.strictEqual(editors.size, 0);
            assert.strictEqual(receivedRequests, before);

            const credentialUrl = new URL(baseUrl);
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
                assert.strictEqual(provider.getChildren().length, 3);
                assert.strictEqual(editors.size, 0);
            }
            assert.strictEqual(receivedRequests, before);
            editors.closeAll();
            assert.strictEqual(editors.size, 0);
            assert.strictEqual(provider.getChildren().length, 3);
            assert.ok(saved);
            editors.open(saved, true);
            await waitForInvocationTab(input.name);
            assert.strictEqual(editors.size, 1);
        } finally {
            mcp.disposable.dispose();
            editors.dispose();
            provider.dispose();
        }
    });

    test('MCP creation stays headless and cancellation creates no saved invocations', async () => {
        const extensionContext = (await getTestApi()).extensionVariables.getContext();
        assert.ok(extensionContext);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(extensionContext, provider);
        try {
            const definition = createHttpInvocationTool(provider);
            const tool = new McpTool(definition.name, definition.execute, definition);
            const abort = new AbortController();
            abort.abort();
            const input = { name: 'private-value', url: `${baseUrl}/echo` };
            const cancelled = await tool.executeMcp(input, { signal: abort.signal, requestId: 'cancelled' });
            assert.ok('isError' in cancelled && cancelled.isError);
            assert.deepStrictEqual(provider.getChildren(), []);
            assert.strictEqual(editors.size, 0);

            editors.open = () => { throw new Error('private-value editor failure'); };
            const created = await tool.executeMcp(input, { signal: new AbortController().signal, requestId: 'created' });
            assert.ok(!('isError' in created && created.isError));
            assert.ok(!JSON.stringify(created).includes('private-value'));
            assert.strictEqual(provider.getChildren().length, 1);
            assert.strictEqual(editors.size, 0);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    const runResultSchema = z.object({
        isError: z.optional(z.boolean()),
        structuredContent: z.object({
            status: z.number(),
            duration: z.number(),
            headers: z.optional(z.array(z.object({ name: z.string(), value: z.string() }))),
            body: z.optional(z.string()),
        }),
    });

    test('AI-authored GUID inputs stay consistent per request and dependent runs reuse the actual credentials', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const createDefinition = createHttpInvocationTool(provider);
        const create = new McpTool(createDefinition.name, createDefinition.execute, createDefinition);
        const listDefinition = listHttpInvocationsTool(provider);
        const list = new McpTool(listDefinition.name, listDefinition.execute, listDefinition);
        const runDefinition = runHttpInvocationTool(provider, editors);
        const run = new McpTool(runDefinition.name, runDefinition.execute, runDefinition);
        const extras = { signal: new AbortController().signal, requestId: 'generated-inputs' };
        const savedSchema = z.object({ structuredContent: z.object({ id: z.string() }) });
        const before = receivedRequests;
        try {
            const source = savedSchema.parse(await create.executeMcp({
                name: 'Create unique account', method: 'POST', url: `${baseUrl}/accounts`,
                headers: [{ name: 'Content-Type', value: 'application/json' }],
                body: '{"email":"invoke-{{guid}}@example.com","password":"Invoke-{{guid}}-Aa1!"}',
            }, extras)).structuredContent.id;
            const target = savedSchema.parse(await create.executeMcp({
                name: 'Reuse account credentials', method: 'POST', url: `${baseUrl}/echo/{{guid}}`,
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
            assert.ok(!JSON.stringify(listed).includes(baseUrl));
            assert.strictEqual(receivedRequests, before);
            const emails = new Set<string>();
            let lastEmail = '';
            for (const runDependencies of [undefined, undefined, false]) {
                const result = runResultSchema.parse(await run.executeMcp({ id: target, ...(runDependencies === undefined ? {} : { runDependencies }) }, extras));
                assert.notStrictEqual(result.isError, true);
                const echoed = JSON.parse(result.structuredContent.body ?? '');
                const body = JSON.parse(echoed.body);
                const created = JSON.parse(accountBodies[accountBodies.length - 1]);
                const sourceGuid = created.email.slice('invoke-'.length, -'@example.com'.length);
                assert.match(sourceGuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
                assert.strictEqual(created.password, `Invoke-${sourceGuid}-Aa1!`);
                assert.strictEqual(body.email, created.email);
                assert.strictEqual(body.password, created.password);
                assert.strictEqual(body.run, body.repeat);
                assert.strictEqual(body.run, echoed.headers['x-run-id']);
                assert.strictEqual(body.run, new URL(echoed.url, baseUrl).searchParams.get('run'));
                assert.strictEqual(new URL(echoed.url, baseUrl).pathname, `/echo/${body.run}`);
                assert.notStrictEqual(body.run, sourceGuid, 'Separate requests shared an implicit UUID.');
                if (runDependencies === false) {
                    assert.strictEqual(body.email, lastEmail, 'Cached Send regenerated source credentials.');
                } else {
                    assert.ok(!emails.has(body.email), 'A fresh chain reused an account email.');
                    emails.add(body.email);
                    lastEmail = body.email;
                }
                const exported = serializeInvocationCollection(provider.getChildren());
                assert.ok(exported.includes('{{guid}}'));
                assert.ok(!exported.includes(created.email));
                assert.ok(!exported.includes(created.password));
                assert.deepStrictEqual(parseInvocationCollection(exported), provider.getChildren());
            }
            assert.strictEqual(receivedRequests, before + 5);
            assert.strictEqual(editors.size, 0);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('generated inputs reject reserved binding names and invalid or stale linked request fields', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const source = { id: 'input-source', name: 'Input source', request: request({ method: 'POST', body: '{"email":"invoke-{{guid}}@example.com"}' }) };
        const target = {
            id: 'use-input', name: 'Use input',
            request: request({ query: [{ name: 'email', value: '{{email}}' }], bindings: [{ name: 'email', sourceId: source.id, pointer: '/request/body/email' }] }),
        };
        provider.saveRequests([target, source]);
        try {
            const action = await createTestActionContext();
            const before = receivedRequests;
            assert.throws(() => provider.saveRequest({ ...target, request: { ...target.request, bindings: [{ name: 'guid', sourceId: source.id, pointer: '/body' }] } }), /other than guid/);
            await assert.rejects(editors.sendRequest(action, { ...target, request: { ...target.request, url: 'http://{{guid}}/echo' } }, undefined, true), /fixed HTTP/);
            assert.strictEqual(receivedRequests, before, 'An invalid generator destination ran its prerequisite.');
            await editors.sendRequest(action, target, undefined, true);
            provider.saveRequest({ ...source, request: { ...source.request, body: '{"email":"changed-{{guid}}@example.com"}' } });
            await assert.rejects(editors.sendRequest(action, target), /current successful result/);
            provider.saveRequest({ ...source, request: { ...source.request, body: 'not JSON' } });
            await assert.rejects(editors.sendRequest(action, target, undefined, true), /linked request body is not valid JSON/);
            provider.saveRequest({ ...source, request: { ...source.request, body: '{}' } });
            await assert.rejects(editors.sendRequest(action, target, undefined, true), /selected request or response field is missing/);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('dependency pickers filter by name or ID, support keyboard selection, and list only chosen prerequisites', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const sources = Array.from({ length: 30 }, (_, index) => ({ id: `source-${index}`, name: `Create resource ${index}`, request: request() }));
        provider.saveRequests(sources);
        const target = { id: 'search-target', name: 'Search dependencies', request: request() };
        const controller = editors.open(target, false);
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
            assert.deepStrictEqual(provider.getRequest(target.id)?.request.bindings, [{ name: 'accountId', sourceId: 'source-7', pointer: '/body/id' }]);
            assert.strictEqual(provider.getRequest(target.id)?.request.dependsOn, undefined);
            const saved = provider.getRequest(target.id);
            assert.ok(saved);
            controller.panel.dispose();
            provider.saveRequest({ ...sources[7], name: 'Renamed source' });
            await runEditorScript(editors.open(saved, true), `
                await waitFor(() => document.querySelector('.binding-row .request-picker input').value === 'Renamed source');
                if (document.documentElement.scrollWidth > window.innerWidth) throw new Error('Dependency picker overflows the page.');
            `);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('batch saving validates the entire dependency graph before changing the collection', () => {
        const provider = new AzureInvokeTreeDataProvider();
        const existing = invocation();
        provider.saveRequest(existing);
        provider.updateRequestStatus(existing.id, { command: 'response', response: { status: 200, duration: 1, headers: [], body: '' } });
        let changes = 0;
        const subscription = provider.onDidChangeTreeData(() => changes++);
        const [source, target] = accountChain();
        try {
            assert.throws(() => provider.saveRequests([source, { ...target, request: { ...target.request, dependsOn: ['missing'] } }]), /prerequisite/);
            assert.throws(() => provider.saveRequests([source, source]), /duplicate/);
            assert.deepStrictEqual(provider.getChildren(), [existing]);
            assert.strictEqual(changes, 0);
            provider.saveRequests([target, source]);
            assert.strictEqual(changes, 1);
            assert.deepStrictEqual(provider.getChildren(), [existing, target, source]);
            assert.strictEqual(provider.getRequestStatus(existing.id), '200, 1 ms');
        } finally {
            subscription.dispose();
            provider.dispose();
        }
    });

    test('users can author response links, run a chain, and reuse its output without repeating POST', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const [source, target] = accountChain();
        provider.saveRequest(source);
        const editor = editors.open({ ...target, request: { ...target.request, bindings: undefined } }, false);
        const before = receivedRequests;
        const accounts = accountBodies.length;
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
            assert.strictEqual(receivedRequests, before + 3);
            assert.strictEqual(accountBodies.length, accounts + 1);
            assert.deepStrictEqual(provider.getRequest(target.id)?.request.bindings, target.request.bindings);
            const content = serializeInvocationCollection(provider.getChildren());
            assert.strictEqual(JSON.parse(content).version, 2);
            assert.ok(!content.includes(`account/${accountNumber} ?#`));
            assert.deepStrictEqual(parseInvocationCollection(content), provider.getChildren());
            assert.strictEqual(editors.size, 1);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('response links preserve JSON types, safely encode values, and select headers, arrays, and escaped keys', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const [source] = accountChain();
        provider.saveRequest(source);
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
        provider.saveRequest(target);
        try {
            const result = await editors.sendRequest(await createTestActionContext(), target, undefined, true);
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
            assert.strictEqual(body.location, `${baseUrl}/accounts/${encodeURIComponent(body.id)}`);
            assert.strictEqual(echo.headers['x-account'], body.id);
            assert.strictEqual(new URL(echo.url, baseUrl).searchParams.get('id'), body.id);
            assert.strictEqual(new URL(echo.url, baseUrl).searchParams.has('unused'), false);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('dependent runs reject missing fields, failed or changed prerequisites, and invalid templates without stale fallback', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const [source, target] = accountChain();
        provider.replaceRequests([target, source]);
        try {
            const action = await createTestActionContext();
            const before = receivedRequests;
            await assert.rejects(editors.sendRequest(action, target), /current successful result/);
            assert.strictEqual(receivedRequests, before);
            await editors.sendRequest(action, source);
            const afterSource = receivedRequests;
            await assert.rejects(editors.sendRequest(action, { ...target, request: {
                ...target.request, bindings: [{ name: 'accountId', sourceId: source.id, pointer: '/body/missing' }],
            } }), /selected request or response field is missing/);
            assert.strictEqual(receivedRequests, afterSource);
            await editors.sendRequest(action, target);
            provider.saveRequest({ ...source, request: { ...source.request, body: '{"changed":true}' } });
            await assert.rejects(editors.sendRequest(action, target), /current successful result/);
            provider.saveRequest({ ...source, request: request({ url: `${baseUrl}/error` }) });
            const afterFailure = receivedRequests;
            await assert.rejects(editors.sendRequest(action, target, undefined, true), /prerequisite returned a non-success/);
            assert.strictEqual(receivedRequests, afterFailure + 1);
            await assert.rejects(editors.sendRequest(action, target), /current successful result/);
            provider.saveRequest(source);
            const beforeInvalid = receivedRequests;
            for (const invalid of [
                { ...target.request, url: `${baseUrl}/accounts/{{missing}}` },
                { ...target.request, url: 'http://{{accountId}}/accounts' },
                { ...target.request, url: `${baseUrl}/accounts/{id}` },
                { ...target.request, method: 'POST' as const, body: '{"id":{{accountId}}}' },
                { ...target.request, method: 'POST' as const, body: '{"{{guid}}":"value"}' },
            ]) {
                await assert.rejects(editors.sendRequest(action, { ...target, request: invalid }, undefined, true));
            }
            assert.strictEqual(receivedRequests, beforeInvalid, 'An invalid target ran a mutating prerequisite.');
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('dependency graphs reject cycles and missing sources and execute shared prerequisites only once', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const [source, target] = accountChain();
        const left = { ...target, id: 'left', name: 'Left' };
        const right = { ...target, id: 'right', name: 'Right' };
        const root = { id: 'root', name: 'Both', request: request({ dependsOn: [left.id, right.id] }) };
        provider.replaceRequests([root, left, right, source]);
        try {
            assert.throws(() => provider.saveRequest({ ...source, request: { ...source.request, dependsOn: [root.id] } }), /cycle/);
            assert.throws(() => provider.saveRequest({ ...root, request: request({ dependsOn: ['missing'] }) }), /unavailable/);
            assert.throws(() => parseInvocationCollection(JSON.stringify({ version: 2, invocations: [target] })), /unavailable/);
            assert.throws(() => parseInvocationCollection(JSON.stringify({ version: 1, invocations: [source, target] })), /version 2/);
            const before = receivedRequests;
            const accounts = accountBodies.length;
            await editors.sendRequest(await createTestActionContext(), root, undefined, true);
            assert.strictEqual(receivedRequests, before + 4);
            assert.strictEqual(accountBodies.length, accounts + 1);
            await editors.sendRequest(await createTestActionContext(), root);
            assert.strictEqual(receivedRequests, before + 5);
            await editors.sendRequest(await createTestActionContext(), source);
            const afterSource = receivedRequests;
            await assert.rejects(editors.sendRequest(await createTestActionContext(), root), /current successful result/);
            assert.strictEqual(receivedRequests, afterSource, 'An old transitive result was reused.');
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('chain cancellation aborts its prerequisite and overlapping runs cannot repeat side effects', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const source = { id: 'slow-source', name: 'Slow source', request: request({ url: `${baseUrl}/slow` }) };
        const target = { id: 'after-slow', name: 'After slow', request: request({ dependsOn: [source.id] }) };
        provider.replaceRequests([source, target]);
        const abort = new AbortController();
        const started = new Promise<void>(resolve => server.once('request', () => resolve()));
        const before = receivedRequests;
        const pending = editors.sendRequest(await createTestActionContext(), target, abort.signal, true);
        try {
            await started;
            await assert.rejects(editors.sendRequest(await createTestActionContext(), source), /already running/);
            abort.abort();
            await assert.rejects(pending, isUserCancelledError);
            assert.strictEqual(receivedRequests, before + 1);
            await assert.rejects(editors.sendRequest(await createTestActionContext(), target), /current successful result/);
            assert.strictEqual(receivedRequests, before + 1);
        } finally {
            abort.abort();
            await pending.catch(() => { });
            editors.dispose();
            provider.dispose();
        }
    });

    test('MCP never exposes non-local prerequisite values through a localhost dependent response', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const [source, target] = accountChain();
        provider.replaceRequests([{ ...source, request: { ...source.request, url: 'https://example.invalid/accounts' } }, target]);
        editors.sendRequest = async () => ({ status: 200, duration: 12, body: 'private-remote-value', headers: [{ name: 'content-type', value: 'application/json' }] });
        const definition = runHttpInvocationTool(provider, editors);
        const tool = new McpTool(definition.name, definition.execute, definition);
        try {
            const result = runResultSchema.parse(await tool.executeMcp({ id: target.id, runDependencies: true }, { signal: new AbortController().signal, requestId: 'private-chain' }));
            assert.deepStrictEqual(result.structuredContent, { status: 200, duration: 12 });
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('AI can propose, preview, confirm, and execute a saved response-linked collection without opening editors', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const reviews = new CollectionReviews(context, provider, async () => { });
        let controller: Awaited<ReturnType<CollectionReviews['open']>> | undefined;
        const open = reviews.open.bind(reviews);
        reviews.open = async (candidates, id) => controller = await open(candidates, id);
        const mcp = await startInProcHttpServer({
            id: mcpServerId, serverLabel: 'Linked collection test', serverVersion: '1.0.0', transport: 'tcp',
            registerTools: server => {
                registerMcpTool(server, proposeInvocationCollectionTool(reviews));
                registerMcpTool(server, getInvocationCollectionReviewTool(reviews));
                registerMcpTool(server, draftHttpInvocationTool(provider, reviews));
                registerMcpTool(server, runHttpInvocationTool(provider, editors));
            },
        });
        const rpc = createMcpClient(mcp);
        const [source, target] = accountChain();
        try {
            await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'linked-test', version: '1.0.0' } });
            await rpc('notifications/initialized', {}, true);
            const candidates = [source, target].map(item => httpCandidate({ ...item, group: 'Accounts' }));
            const result = z.object({ result: z.object({ structuredContent: z.object({ reviewId: z.string() }) }) })
                .parse(await rpc('tools/call', { name: 'propose_invocation_collection', arguments: { candidates } }));
            const reviewId = result.result.structuredContent.reviewId;
            assert.ok(controller);
            const before = receivedRequests;
            await runEditorScript(controller, `
                const source = document.querySelector('.case[data-id="${source.id}"]');
                const target = document.querySelector('.case[data-id="${target.id}"]');
                source.querySelector('.case-toggle').click();
                source.querySelector('.request-field textarea').value = '{"name":"kept local"}';
                target.querySelector('.case-toggle').click();
                target.querySelector('.run-preview-chain').click();
                await waitFor(() => !target.querySelector('.preview-response-body').hidden);
                if (!JSON.parse(target.querySelector('.preview-response-body').textContent).id.startsWith('account/')) throw new Error('Review chain did not use the created ID.');
                window.dispatchEvent(new MessageEvent('message', { data: { command: 'preview', version: JSON.parse(decodeURIComponent(window.config._initialData)).version, id: '${source.id}', message: { command: 'requestStarted', saved: false, sequence: 1 } } }));
                if (document.querySelector('#confirm-collection').disabled) throw new Error('Confirmation still busy: ' + [...document.querySelectorAll('.request-preview')].map(preview => preview.querySelector('output').textContent + '/' + preview.querySelector('.cancel-preview').hidden).join(','));
                source.querySelector('[data-case-id]').click();
                document.querySelector('#confirm-collection').click();
                await waitFor(() => !document.querySelector('#review-error').hidden);
                if (!document.querySelector('#review-error').textContent.includes('prerequisite')) throw new Error('Unselected prerequisite was accepted.');
                source.querySelector('[data-case-id]').click();
                document.querySelector('#confirm-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Confirmed.'));
            `);
            assert.strictEqual(receivedRequests, before + 2);
            const approved = await rpc('tools/call', { name: 'get_invocation_collection_review', arguments: { reviewId } });
            assert.ok(!JSON.stringify(approved).includes('kept local'));
            assert.deepStrictEqual(reviews.getApproved(reviewId).cases.find(item => item.id === target.id)?.dependencyIds, [source.id]);
            assert.strictEqual(provider.getChildren().length, 2, 'Confirm did not save the invocations directly.');
            const confirmedSource = reviews.getDraftId(reviewId, source.id);
            const confirmedTarget = reviews.getDraftId(reviewId, target.id);
            assert.ok(confirmedSource);
            assert.ok(confirmedTarget);
            assert.strictEqual(provider.getRequest(confirmedTarget)?.request.bindings?.[0].sourceId, confirmedSource);
            const draft = (item: HttpInvocation) => ({ ...item.request, name: item.name, reviewId, candidateId: item.id });
            const savedSchema = z.object({ result: z.object({ structuredContent: z.object({ id: z.string() }) }) });
            const savedSource = savedSchema.parse(await rpc('tools/call', { name: 'draft_http_invocation', arguments: draft(source) })).result.structuredContent.id;
            const savedTarget = savedSchema.parse(await rpc('tools/call', { name: 'draft_http_invocation', arguments: draft(target) })).result.structuredContent.id;
            assert.strictEqual(savedSource, confirmedSource);
            assert.strictEqual(savedTarget, confirmedTarget);
            assert.strictEqual(provider.getRequest(savedTarget)?.request.bindings?.[0].sourceId, savedSource);
            const ran = z.object({ result: runResultSchema }).parse(await rpc('tools/call', {
                name: 'run_http_invocation', arguments: { id: savedTarget },
            })).result;
            assert.notStrictEqual(ran.isError, true);
            assert.ok(JSON.parse(ran.structuredContent.body ?? '').id.startsWith('account/'));
            assert.strictEqual(accountBodies[accountBodies.length - 1], '{"name":"kept local"}');
            assert.strictEqual(receivedRequests, before + 4);
            assert.strictEqual(provider.getChildren().length, 2);
            assert.strictEqual(editors.size, 0);
        } finally {
            reviews.dispose();
            editors.dispose();
            provider.dispose();
            await mcp.disposable.dispose();
        }
    });

    test('feedback switches confirmation to a change request without saving invocations', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const reviews = new CollectionReviews(context, provider, async () => { });
        try {
            const controller = await reviews.open([httpCandidate()]);
            await runEditorScript(controller, `
                document.querySelector('.case-toggle').click();
                const feedback = document.querySelector('[data-comment-id="http"]');
                const confirm = document.querySelector('#confirm-collection');
                feedback.value = '   ';
                feedback.dispatchEvent(new Event('input', { bubbles: true }));
                if (confirm.textContent !== 'Confirm') throw new Error('Whitespace requests changes.');
                feedback.value = 'Add the pagination query parameters.';
                feedback.dispatchEvent(new Event('input', { bubbles: true }));
                if (confirm.textContent !== 'Request changes') throw new Error('Feedback did not switch the action to Request changes.');
                document.querySelector('[data-case-id="http"]').click();
                if (confirm.disabled) throw new Error('Feedback on an unchecked row cannot be submitted.');
                feedback.value = '';
                feedback.dispatchEvent(new Event('input', { bubbles: true }));
                if (confirm.textContent !== 'Confirm') throw new Error('Cleared feedback did not restore Confirm.');
                if (!confirm.disabled) throw new Error('Empty selection can be confirmed.');
                window.testApi.postMessage({ command: 'confirmCollection', selections: [{ id: 'http', comment: 'Feedback must not be saved.' }] });
                await waitFor(() => !document.querySelector('#review-error').hidden);
                if (!document.querySelector('#review-error').textContent.includes('Request changes')) throw new Error('Host accepted feedback as confirmation.');
            `);
            assert.deepStrictEqual(provider.getChildren(), []);
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('MCP feedback revisions refresh stable cases, preserve private edits, and save only after clean confirmation', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const existing = invocation();
        provider.saveRequest(existing);
        const candidates: InvocationCandidate[] = [
            httpCandidate({
                id: 'create', name: 'Create account', group: 'Accounts', request: request({
                    method: 'POST', url: `${baseUrl}/accounts`,
                    headers: [{ name: 'x-functions-key', value: '', enabled: false }],
                    body: '{"name":"Account {{guid}}","email":"invoke-{{guid}}@example.com"}',
                }),
            }),
            httpCandidate({ id: 'list', name: 'List accounts', group: 'Accounts', request: request({ url: `${baseUrl}/accounts` }) }),
            httpCandidate({
                id: 'get', name: 'Get account', group: 'Accounts', request: request({
                    url: `${baseUrl}/accounts/{{accountId}}`,
                    bindings: [{ name: 'accountId', sourceId: 'create', pointer: '/body/id' }],
                }),
            }),
            { id: 'timer', name: 'Cleanup', group: 'Maintenance', trigger: 'timer', endpoint: '', description: 'Unsupported timer.' },
        ];
        const revisions: number[] = [];
        const readSchema = z.object({
            result: z.object({
                structuredContent: z.object({
                    revision: z.number(), state: z.string(),
                    cases: z.array(z.object({
                        id: z.string(), selected: z.boolean(), comment: z.string(), reviewedFields: z.array(z.string()),
                    })),
                }),
            }),
        });
        const reviews = new CollectionReviews(context, provider, async (reviewId, revision) => {
            assert.ok(revision);
            revisions.push(revision);
            const feedback = readSchema.parse(await rpc('tools/call', {
                name: 'get_invocation_collection_review', arguments: { reviewId },
            })).result.structuredContent;
            assert.strictEqual(feedback.state, 'changesRequested');
            assert.strictEqual(feedback.revision, revision);
            assert.deepStrictEqual(feedback.cases.map(item => [item.id, item.selected]), [['create', true], ['list', false], ['get', true]]);
            assert.deepStrictEqual(feedback.cases.find(item => item.id === 'create')?.reviewedFields, ['headers', 'body']);
            assert.strictEqual(feedback.cases.find(item => item.id === (revision === 1 ? 'list' : 'get'))?.comment,
                revision === 1 ? 'Add supported pagination and sorting query names.' : 'Name this Get account by ID.');
            const rawFeedback = await rpc('tools/call', { name: 'get_invocation_collection_review', arguments: { reviewId } });
            assert.ok(!JSON.stringify(rawFeedback).includes('private-review-body'));
            assert.ok(!JSON.stringify(rawFeedback).includes('private-review-key'));
            const prematureDraft = z.object({ result: z.object({ isError: z.boolean() }) }).parse(await rpc('tools/call', {
                name: 'draft_http_invocation', arguments: { reviewId, candidateId: 'create', name: 'Create account', ...request() },
            }));
            assert.strictEqual(prematureDraft.result.isError, true);
            const updated: InvocationCandidate[] = candidates.flatMap(candidate => {
                if (candidate.trigger !== 'http') {
                    return [];
                }
                return [{
                    ...candidate,
                    name: candidate.id === 'create' ? 'Create test account' : candidate.id === 'get' && revision === 2 ? 'Get account by ID' : candidate.name,
                    request: candidate.id === 'list' ? {
                        ...candidate.request,
                        query: ['page', 'pageSize', 'sort', 'filter'].map(name => ({ name, value: '', enabled: false })),
                    } : candidate.id === 'create' ? { ...candidate.request, body: '{"name":"AI revision {{guid}}"}' } : candidate.request,
                }];
            });
            const stale = z.object({ result: z.object({ isError: z.boolean() }) }).parse(await rpc('tools/call', {
                name: 'propose_invocation_collection', arguments: { reviewId, revision: revision + 1, candidates: updated },
            }));
            assert.strictEqual(stale.result.isError, true);
            const revised = z.object({ result: z.object({ structuredContent: z.object({ reviewId: z.string() }) }) }).parse(await rpc('tools/call', {
                name: 'propose_invocation_collection', arguments: { reviewId, revision, candidates: updated },
            }));
            assert.strictEqual(revised.result.structuredContent.reviewId, reviewId);
            assert.deepStrictEqual(provider.getChildren(), [existing]);
            if (revision === 2) {
                throw new Error('A late chat error must not overwrite the refreshed review.');
            }
        });
        const mcp = await startInProcHttpServer({
            id: mcpServerId, serverLabel: 'Azure Invoke feedback test', serverVersion: '1.0.0', transport: 'tcp',
            registerTools: server => {
                registerMcpTool(server, proposeInvocationCollectionTool(reviews));
                registerMcpTool(server, getInvocationCollectionReviewTool(reviews));
                registerMcpTool(server, draftHttpInvocationTool(provider, reviews));
            },
        });
        const rpc = createMcpClient(mcp);
        const before = receivedRequests;
        try {
            await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'feedback-test', version: '1.0.0' } });
            await rpc('notifications/initialized', {}, true);
            const controller = await reviews.open(candidates);
            await runEditorScript(controller, `
                let proposalVersion = JSON.parse(decodeURIComponent(window.config._initialData)).version;
                window.addEventListener('message', event => { if (event.data.command === 'proposal') proposalVersion = event.data.version; });
                const source = document.querySelector('[data-id="create"]');
                source.querySelector('.case-toggle').click();
                source.querySelector('.request-preview textarea').value = '{"name":"private-review-body"}';
                const key = source.querySelectorAll('.preview-entries')[1].querySelectorAll('input')[1];
                key.value = 'private-review-key';
                key.dispatchEvent(new Event('input', { bubbles: true }));
                source.querySelector('.send-preview').click();
                await waitFor(() => !source.querySelector('.preview-response-body').hidden);
                const list = document.querySelector('[data-id="list"]');
                list.querySelector('[data-case-id]').click();
                list.querySelector('.case-toggle').click();
                list.querySelector('[data-comment-id]').value = 'Add supported pagination and sorting query names.';
                list.querySelector('[data-comment-id]').dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('#confirm-collection').click();
                await waitFor(() => source !== document.querySelector('[data-id="create"]') && document.querySelector('#review-loading').hidden);
                if (document.querySelector('[data-id="create"] .case-name').textContent !== 'Create test account') throw new Error('Stable-ID revision did not rerender.');
                if (document.querySelector('[data-id="create"] .request-preview textarea').value !== '{"name":"private-review-body"}') throw new Error('Revision replaced a private body.');
                if (document.querySelector('[data-id="create"] .case-details').hidden) throw new Error('Revision collapsed an expanded row.');
                if (!document.querySelector('[data-id="create"] .preview-response-body').hidden) throw new Error('Revision retained an outdated preview result.');
                window.dispatchEvent(new MessageEvent('message', { data: { command: 'preview', version: proposalVersion - 1, id: 'create', message: { command: 'requestStarted', saved: false, sequence: 999 } } }));
                window.dispatchEvent(new MessageEvent('message', { data: { command: 'state', version: proposalVersion - 1, state: 'revising', selections: [], statuses: [] } }));
                if (document.querySelector('#confirm-collection').disabled || !document.querySelector('#review-loading').hidden) throw new Error('Stale revision messages changed the current review.');
                if (document.querySelector('[data-case-id="list"]').checked) throw new Error('Revision reselected an unchecked case.');
                const names = [...document.querySelectorAll('[data-id="list"] .preview-entries')[0].querySelectorAll('input')].filter(input => input.placeholder === 'Name').map(input => input.value).filter(Boolean);
                if (JSON.stringify(names) !== JSON.stringify(['page', 'pageSize', 'sort', 'filter'])) throw new Error('GET query names are missing from the revised draft.');
                if ([...document.querySelectorAll('[data-comment-id]')].some(input => input.value)) throw new Error('Applied feedback was not cleared.');
                if (document.querySelector('#confirm-collection').textContent !== 'Confirm') throw new Error('Revised review cannot be confirmed.');
                if (!document.querySelector('[data-case-id="timer"]').disabled) throw new Error('Revision removed the unsupported trigger.');
                const comment = document.querySelector('[data-comment-id="get"]');
                comment.value = 'Name this Get account by ID.';
                comment.dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('#confirm-collection').click();
                await waitFor(() => document.querySelector('[data-id="get"] .case-name').textContent === 'Get account by ID' && document.querySelector('#review-loading').hidden);
                if (document.querySelector('[data-case-id="list"]').checked) throw new Error('Second revision lost the selection.');
                if (!document.querySelector('#review-error').hidden) throw new Error('Late chat error overwrote an accepted revision.');
            `);
            assert.deepStrictEqual(revisions, [1, 2]);
            assert.strictEqual(receivedRequests, before + 1, 'Feedback sent requests beyond the manual preview.');
            assert.deepStrictEqual(provider.getChildren(), [existing]);
            assert.throws(() => reviews.getApproved(controller.reviewId), /Confirm the active collection review/);
            await runEditorScript(controller, `
                await waitFor(() => document.querySelector('[data-id="get"] .case-name').textContent === 'Get account by ID' && document.querySelector('#review-loading').hidden);
                const body = document.querySelector('[data-id="create"] .request-preview textarea');
                if (body.value !== '{"name":"private-review-body"}') throw new Error('Readiness replay lost a private edit.');
                body.value = '{"name":"private-review-body","editedAgain":true}';
                let replayed = false;
                window.addEventListener('message', event => { if (event.data.command === 'proposal') replayed = true; });
                window.testApi.postMessage({ command: 'ready' });
                await waitFor(() => replayed);
                if (!body.value.includes('editedAgain')) throw new Error('Duplicate readiness replay overwrote an unsaved edit.');
                if (!document.querySelector('#review-error').hidden) throw new Error('Late chat failure persisted into the revised review.');
                document.querySelector('[data-case-id="list"]').click();
                document.querySelector('#confirm-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Confirmed.'));
            `);
            assert.strictEqual(provider.getChildren().length, 4);
            const sourceId = reviews.getDraftId(controller.reviewId, 'create');
            const targetId = reviews.getDraftId(controller.reviewId, 'get');
            const listId = reviews.getDraftId(controller.reviewId, 'list');
            assert.ok(sourceId && targetId && listId);
            assert.deepStrictEqual(provider.getRequest(sourceId)?.request.headers, [{ name: 'x-functions-key', value: 'private-review-key', enabled: true }]);
            assert.strictEqual(provider.getRequest(sourceId)?.request.body, '{"name":"private-review-body","editedAgain":true}');
            assert.deepStrictEqual(provider.getRequest(targetId)?.request.bindings, [{ name: 'accountId', sourceId, pointer: '/body/id' }]);
            assert.deepStrictEqual(provider.getRequest(listId)?.request.query, ['page', 'pageSize', 'sort', 'filter'].map(name => ({ name, value: '', enabled: false })));
            assert.deepStrictEqual(provider.getRequest(existing.id), existing);
            assert.strictEqual(receivedRequests, before + 1, 'Confirmation sent additional requests.');
            assert.deepStrictEqual(revisions, [1, 2], 'Clean confirmation started another chat turn.');
        } finally {
            mcp.disposable.dispose();
            reviews.dispose();
            provider.dispose();
        }
    });

    test('feedback failures retain editable notes, reject stale revisions, and allow cancellation during chat', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const revisions: number[] = [];
        let rejectPending: ((error: Error) => void) | undefined;
        const reviews = new CollectionReviews(context, provider, async (_reviewId, revision) => {
            assert.ok(revision);
            revisions.push(revision);
            if (revision === 1) {
                throw new Error('Could not open Copilot Chat. Retry Request changes.');
            }
            if (revision === 2) {
                throw new UserCancelledError();
            }
            await new Promise<void>((_resolve, reject) => { rejectPending = reject; });
        });
        const before = receivedRequests;
        try {
            const controller = await reviews.open([httpCandidate()]);
            await runEditorScript(controller, `
                document.querySelector('.case-toggle').click();
                const comment = document.querySelector('[data-comment-id="http"]');
                comment.value = 'Add the supported GET query names.';
                comment.dispatchEvent(new Event('input', { bubbles: true }));
                const confirm = document.querySelector('#confirm-collection');
                confirm.click();
                await waitFor(() => !document.querySelector('#review-error').hidden);
                if (!document.querySelector('#review-loading').hidden || confirm.hidden || confirm.disabled) throw new Error('Failed chat cannot be retried.');
                if (comment.disabled || comment.value !== 'Add the supported GET query names.') throw new Error('Failed chat lost feedback.');
                confirm.click();
                await waitFor(() => !document.querySelector('#review-error').hidden);
                if (!document.querySelector('#review-loading').hidden || confirm.hidden || confirm.disabled) throw new Error('Cancelled chat kept the review locked.');
            `);
            assert.deepStrictEqual(revisions, [1, 2]);
            assert.strictEqual(reviews.getReview(controller.reviewId).state, 'changesRequested');
            assert.strictEqual(reviews.getReview(controller.reviewId).cases[0].comment, 'Add the supported GET query names.');
            await assert.rejects(reviews.open([httpCandidate()], undefined, 2), /active review ID/);
            await assert.rejects(reviews.open([httpCandidate()], controller.reviewId, 1), /no longer active/);
            await runEditorScript(controller, `
                await waitFor(() => document.querySelector('[data-comment-id="http"]').value === 'Add the supported GET query names.');
                document.querySelector('#confirm-collection').click();
                await waitFor(() => !document.querySelector('#review-loading').hidden);
                if (document.querySelector('#review-loading h1').textContent !== 'Updating your collection') throw new Error('Revision loading indicator is missing.');
                window.testApi.postMessage({ command: 'requestChanges', selections: [] });
                window.testApi.postMessage({ command: 'confirmCollection', selections: [{ id: 'http', comment: '' }] });
                window.testApi.postMessage({ command: 'previewRequest', id: 'http', request: ${JSON.stringify(request())} });
                await waitFor(() => document.querySelector('.preview-error').textContent.includes('active review'));
                let replayed = false;
                window.addEventListener('message', event => { if (event.data.command === 'proposal') replayed = true; });
                window.testApi.postMessage({ command: 'ready' });
                await waitFor(() => replayed);
                if (document.querySelector('#review-loading').hidden) throw new Error('A rejected preview unlocked the pending revision.');
                document.querySelector('footer button.secondary').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Review cancelled.'));
                if (!document.querySelector('#confirm-collection').hidden) throw new Error('Cancelled revision can be confirmed.');
            `);
            rejectPending?.(new Error('Late chat failure after cancellation.'));
            assert.deepStrictEqual(revisions, [1, 2, 3]);
            await assert.rejects(reviews.open([httpCandidate()], controller.reviewId, 3), /no longer active/);
            assert.throws(() => reviews.getReview(controller.reviewId), /Confirm the active collection review/);
            assert.deepStrictEqual(provider.getChildren(), []);
            assert.strictEqual(receivedRequests, before);
        } finally {
            rejectPending?.(new UserCancelledError());
            reviews.dispose();
            provider.dispose();
        }
    });

    test('AI collection review gates drafting and shows headless progress', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const continuedReviews: string[] = [];
        const reviews = new CollectionReviews(context, provider, async reviewId => { continuedReviews.push(reviewId); });
        let controller: Awaited<ReturnType<CollectionReviews['open']>> | undefined;
        const open = reviews.open.bind(reviews);
        reviews.open = async (candidates, reviewId) => controller = await open(candidates, reviewId);
        const mcp = await startInProcHttpServer({
            id: mcpServerId, serverLabel: 'Azure Invoke review test', serverVersion: '1.0.0', transport: 'tcp',
            registerTools: server => {
                registerMcpTool(server, proposeInvocationCollectionTool(reviews));
                registerMcpTool(server, getInvocationCollectionReviewTool(reviews));
                registerMcpTool(server, draftHttpInvocationTool(provider, reviews));
                registerMcpTool(server, runHttpInvocationTool(provider, editors));
            },
        });
        const rpc = createMcpClient(mcp);
        const existing = invocation();
        provider.saveRequest(existing);
        const before = receivedRequests;
        try {
            await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'review-test', version: '1.0.0' } });
            await rpc('notifications/initialized', {}, true);
            const candidates: InvocationCandidate[] = [
                httpCandidate({ id: 'create', name: "Create customer's order", auth: 'required' }),
                httpCandidate({ id: 'invalid', name: 'Read error response', request: request({ url: `${baseUrl}/error` }) }),
                { id: 'timer', name: 'Scheduled cleanup', group: 'Maintenance', trigger: 'timer', endpoint: '0 */5 * * * *', description: 'A timer trigger discovered in the project.' },
            ];
            const proposed = z.object({ result: z.object({ structuredContent: z.object({ reviewId: z.string() }) }) })
                .parse(await rpc('tools/call', { name: 'propose_invocation_collection', arguments: { candidates } }));
            const reviewId = proposed.result.structuredContent.reviewId;
            assert.ok(controller);
            const draft = { ...invocation().request, name: 'Create order', reviewId, candidateId: 'create' };
            for (const [name, args] of [
                ['get_invocation_collection_review', { reviewId }],
                ['draft_http_invocation', draft],
            ] as const) {
                const rejected = z.object({ result: z.object({ isError: z.boolean() }) }).parse(await rpc('tools/call', { name, arguments: args }));
                assert.strictEqual(rejected.result.isError, true);
            }
            assert.deepStrictEqual(provider.getChildren(), [existing]);
            assert.strictEqual(receivedRequests, before);
            assert.strictEqual(editors.size, 0);
            await runEditorScript(controller, `
                if (document.querySelector('#confirm-collection').disabled) throw new Error('HTTP templates were not preselected.');
                if ([...document.querySelectorAll('.case-details')].some(details => !details.hidden)) throw new Error('Templates start expanded.');
                if (document.querySelectorAll('.case-group').length !== 2) throw new Error('Related requests were not grouped.');
                if (!document.querySelector('[data-case-id="timer"]').disabled) throw new Error('Unsupported trigger is selectable.');
                const selected = document.querySelector('[data-case-id="create"]');
                document.querySelector('[data-case-id="invalid"]').click();
                document.querySelector('.case-toggle').click();
                if (document.querySelector('.case-details').hidden) throw new Error('Request details did not expand.');
                if (document.querySelector('.auth-required').title !== 'Authentication required') throw new Error('Authentication indicator is missing.');
                document.querySelector('#confirm-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Confirmed.'));
                if (!selected.disabled) throw new Error('Confirmed selection can still be edited.');
            `);
            assert.deepStrictEqual(continuedReviews, [], 'Confirm launched an unsolicited Copilot turn.');
            assert.strictEqual(provider.getChildren().length, 2);
            assert.ok(reviews.getDraftId(reviewId, 'create'));
            const approved = z.object({
                result: z.object({ structuredContent: z.object({ cases: z.array(z.object({ id: z.string(), comment: z.string() })) }) }),
            }).parse(await rpc('tools/call', { name: 'get_invocation_collection_review', arguments: { reviewId } }));
            assert.deepStrictEqual(approved.result.structuredContent.cases, [{ id: 'create', comment: '' }]);
            for (const candidateId of ['invalid', 'timer', 'unknown']) {
                const rejected = z.object({ result: z.object({ isError: z.boolean() }) }).parse(await rpc('tools/call', {
                    name: 'draft_http_invocation', arguments: { ...draft, candidateId },
                }));
                assert.strictEqual(rejected.result.isError, true);
            }
            const draftedSchema = z.object({ result: z.object({ structuredContent: z.object({ id: z.string() }) }) });
            const created = draftedSchema.parse(await rpc('tools/call', { name: 'draft_http_invocation', arguments: draft }));
            const invocationId = created.result.structuredContent.id;
            const revised = draftedSchema.parse(await rpc('tools/call', { name: 'draft_http_invocation', arguments: { ...draft, body: '{"orderId":42}' } }));
            assert.strictEqual(revised.result.structuredContent.id, invocationId);
            assert.strictEqual(provider.getChildren().length, 2);
            assert.strictEqual(provider.getRequest(invocationId)?.request.body, '{"orderId":42}');
            assert.strictEqual(provider.getRequestStatus(invocationId), 'Ready');
            assert.strictEqual(editors.size, 0);
            assert.strictEqual(receivedRequests, before);
            const ran = z.object({ result: runResultSchema }).parse(await rpc('tools/call', {
                name: 'run_http_invocation', arguments: { id: invocationId },
            }));
            assert.strictEqual(ran.result.structuredContent.status, 200);
            assert.strictEqual(receivedRequests, before + 1);
            assert.strictEqual(editors.size, 0);
            assert.match(provider.getRequestStatus(invocationId), /^200, \d+ ms$/);
            await runEditorScript(controller, `
                await waitFor(() => document.querySelector('.case-status').textContent.startsWith('200, '));
                if (!document.querySelector('[data-case-id="create"]').checked) throw new Error('Approved selection was not restored.');
                if (document.querySelector('[data-comment-id="create"]').value !== '') throw new Error('Confirmed review gained feedback.');
            `);
            const saved = provider.getRequest(invocationId);
            assert.ok(saved);
            await runEditorScript(editors.open(saved, true), `
                await waitFor(() => !document.querySelector('#response-body').hidden);
                if (JSON.parse(document.querySelector('#response-body').textContent).body !== '{"orderId":42}') throw new Error('Headless response was not available on demand.');
            `);
            assert.deepStrictEqual(provider.getRequest(existing.id), existing);
        } finally {
            mcp.disposable.dispose();
            reviews.dispose();
            editors.dispose();
            provider.dispose();
        }
    });

    test('AI collection reviews reject unsupported selections and expire on cancellation or replacement', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const reviews = new CollectionReviews(context, provider, async () => { throw new Error('Chat must not open for an invalid selection.'); });
        const candidates: InvocationCandidate[] = [
            httpCandidate(),
            { id: 'timer', name: 'Cleanup', group: 'Maintenance', trigger: 'timer', endpoint: '', description: 'Unsupported timer.' },
        ];
        try {
            const first = await reviews.open(candidates);
            await runEditorScript(first, `
                for (const selections of [
                    null,
                    [],
                    [{ id: 'timer', comment: '' }],
                    [{ id: 'unknown', comment: '' }],
                    [{ id: 'http', comment: '' }, { id: 'http', comment: '' }],
                    [{ id: 'http', comment: 'x'.repeat(2001) }],
                ]) {
                    document.querySelector('#review-error').hidden = true;
                    window.testApi.postMessage({ command: 'confirmCollection', selections });
                    await waitFor(() => !document.querySelector('#review-error').hidden);
                }
            `);
            assert.throws(() => reviews.getApproved(first.reviewId), /Confirm the active collection review/);
            const second = await reviews.open(candidates);
            assert.throws(() => reviews.getApproved(first.reviewId), /Confirm the active collection review/);
            await runEditorScript(second, `
                document.querySelector('footer button.secondary').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Review cancelled.'));
                if (!document.querySelector('#confirm-collection').hidden) throw new Error('A cancelled review can be confirmed.');
            `);
            assert.throws(() => reviews.getApproved(second.reviewId), /Confirm the active collection review/);
            const third = await reviews.open(candidates);
            third.panel.dispose();
            assert.throws(() => reviews.getApproved(third.reviewId), /Confirm the active collection review/);
            await assert.rejects(reviews.open([candidates[0], candidates[0]]), /unique IDs/);
            assert.deepStrictEqual(provider.getChildren(), []);
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('confirmation retries an atomic save without starting chat or duplicating saved requests', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        let attempts = 0;
        const save = provider.saveRequests.bind(provider);
        provider.saveRequests = invocations => {
            if (++attempts === 1) {
                throw new Error('Could not save the reviewed requests.');
            }
            save(invocations);
        };
        const reviews = new CollectionReviews(context, provider, async () => { throw new Error('Confirm must not start chat.'); });
        try {
            const controller = await reviews.open([httpCandidate()]);
            await runEditorScript(controller, `
                document.querySelector('.case-toggle').click();
                const confirm = document.querySelector('#confirm-collection');
                if (confirm.textContent !== 'Confirm') throw new Error('Confirm label is incorrect.');
                confirm.click();
                await waitFor(() => !document.querySelector('#review-error').hidden);
                if (confirm.hidden || confirm.disabled) throw new Error('Save failure cannot be retried.');
                if (document.querySelector('[data-case-id="http"]').disabled) throw new Error('Failed save locked the selection.');
                confirm.click();
                await waitFor(() => confirm.hidden && document.querySelector('#review-error').hidden);
                window.testApi.postMessage({ command: 'confirmCollection', selections: [] });
            `);
            assert.strictEqual(attempts, 2);
            assert.strictEqual(reviews.getApproved(controller.reviewId).cases[0].comment, '');
            assert.strictEqual(provider.getChildren().length, 1);
            controller.panel.dispose();
            assert.strictEqual(reviews.getApproved(controller.reviewId).cases[0].id, 'http');
            await reviews.open([httpCandidate({ id: 'next', name: 'Next order' })]);
            assert.throws(() => reviews.getDraftId(controller.reviewId, 'http'), /Confirm the active collection review/);
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('AI review loading becomes the proposal in the same panel and cancelled discovery cannot reopen it', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const discoveries: string[] = [];
        const reviews = new CollectionReviews(context, provider, async id => { discoveries.push(id); });
        try {
            const controller = await reviews.start();
            assert.ok(controller.panel.webview.html.includes('class="spinner"'));
            await runEditorScript(controller, `
                if (document.querySelector('#review-loading').hidden) throw new Error('Discovery loading indicator is missing.');
                if (!document.querySelector('#confirm-collection').hidden) throw new Error('Loading review can be confirmed.');
                if (document.querySelectorAll('.case').length) throw new Error('Loading page contains invented templates.');
            `);
            const definition = proposeInvocationCollectionTool(reviews);
            const tool = new McpTool(definition.name, definition.execute, definition);
            const result = await tool.executeMcp({ reviewId: controller.reviewId, candidates: [httpCandidate()] },
                { signal: new AbortController().signal, requestId: 'loading-proposal' });
            assert.ok(!('isError' in result && result.isError));
            assert.ok(!controller.isDisposed);
            await runEditorScript(controller, `
                await waitFor(() => document.querySelector('#review-loading').hidden && document.querySelectorAll('.case').length === 1);
                if (!document.querySelector('[data-case-id="http"]').checked) throw new Error('Discovered HTTP template was not selected.');
                if (!document.querySelector('.case-details').hidden) throw new Error('Discovered template was expanded.');
            `);
            assert.deepStrictEqual(discoveries, [controller.reviewId]);
            assert.deepStrictEqual(provider.getChildren(), []);
            const cancelled = await reviews.start();
            await runEditorScript(cancelled, `
                document.querySelector('footer button.secondary').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Review cancelled.'));
            `);
            await assert.rejects(reviews.open([httpCandidate()], cancelled.reviewId), /no longer active/);
            assert.deepStrictEqual(provider.getChildren(), []);
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('review discovery failures replace the spinner with an actionable error', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        let cancelled = false;
        const controller = new CollectionReviewController(context, 'loading-failure', undefined, () => [], () => { cancelled = true; }, () => [], async () => { });
        try {
            await controller.failLoading(false);
            await runEditorScript(controller, `
                await waitFor(() => !document.querySelector('#review-error').hidden);
                if (!document.querySelector('#review-loading').hidden) throw new Error('Failed discovery kept spinning.');
                if (!document.querySelector('#confirm-collection').hidden) throw new Error('Failed discovery can be confirmed.');
                if (!document.querySelector('#review-error').textContent.includes('Author Collection with AI')) throw new Error('Discovery error gives no recovery action.');
            `);
            assert.strictEqual(cancelled, true);
        } finally {
            controller.panel.dispose();
        }
    });

    test('expanded HTTP previews send only enabled values and keep local edits without exposing them to AI', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const reviews = new CollectionReviews(context, provider, async () => { });
        const template = httpCandidate({
            request: request({
                query: [{ name: 'page', value: '', enabled: false }],
                headers: [{ name: 'x-functions-key', value: '', enabled: false }],
            }),
        });
        const before = receivedRequests;
        try {
            const controller = await reviews.open([template]);
            await runEditorScript(controller, `
                document.querySelector('.case-toggle').click();
                const query = document.querySelectorAll('.preview-entries')[0];
                if (query.querySelector('input').value !== 'page') throw new Error('Known query name is missing.');
                if (query.querySelectorAll('input')[1].value || query.querySelector('input[type="checkbox"]').checked) throw new Error('A default query value was invented or enabled.');
                document.querySelector('.send-preview').click();
                await waitFor(() => !document.querySelector('.preview-response-body').hidden);
                const result = JSON.parse(document.querySelector('.preview-response-body').textContent);
                if (result.url !== '/echo' || result.headers['x-functions-key']) throw new Error('Disabled template parameters were sent.');
            `);
            assert.strictEqual(receivedRequests, before + 1);
            assert.deepStrictEqual(provider.getChildren(), []);
            await runEditorScript(controller, `
                document.querySelector('.case-toggle').click();
                const queryValue = document.querySelectorAll('.preview-entries')[0].querySelectorAll('input')[1];
                queryValue.value = '42';
                queryValue.dispatchEvent(new Event('input', { bubbles: true }));
                const headerValue = document.querySelectorAll('.preview-entries')[1].querySelectorAll('input')[1];
                headerValue.value = 'local-preview-secret';
                headerValue.dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('.send-preview').click();
                await waitFor(() => !document.querySelector('.preview-response-body').hidden && document.querySelector('.preview-response-body').textContent.includes('page=42'));
                const result = JSON.parse(document.querySelector('.preview-response-body').textContent);
                if (result.headers['x-functions-key'] !== 'local-preview-secret') throw new Error('Filled header was not sent.');
                document.querySelector('#confirm-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Confirmed.'));
            `);
            assert.strictEqual(receivedRequests, before + 2);
            assert.strictEqual(provider.getChildren().length, 1, 'Confirm did not save manual fields.');
            assert.deepStrictEqual(reviews.getApproved(controller.reviewId).cases[0].reviewedFields, ['headers', 'query']);
            const getDefinition = getInvocationCollectionReviewTool(reviews);
            const read = new McpTool(getDefinition.name, getDefinition.execute, getDefinition);
            const approved = await read.executeMcp({ reviewId: controller.reviewId }, { signal: new AbortController().signal, requestId: 'read-private-review' });
            assert.ok(!('isError' in approved && approved.isError));
            assert.ok(!JSON.stringify(approved).includes('local-preview-secret'));
            assert.ok(!JSON.stringify(approved).includes('"42"'));
            const definition = draftHttpInvocationTool(provider, reviews);
            const draft = new McpTool(definition.name, definition.execute, definition);
            const drafted = await draft.executeMcp({
                reviewId: controller.reviewId, candidateId: template.id, name: template.name, ...request(),
            }, { signal: new AbortController().signal, requestId: 'draft-reviewed-values' });
            assert.ok(!('isError' in drafted && drafted.isError));
            const saved = provider.getChildren()[0];
            assert.deepStrictEqual(saved.request.query, [{ name: 'page', value: '42', enabled: true }]);
            assert.deepStrictEqual(saved.request.headers, [{ name: 'x-functions-key', value: 'local-preview-secret', enabled: true }]);
            assert.ok(!findInvocationTab(template.name));
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('HTTP previews support cancellation and refuse unresolved route placeholders or confirmation while running', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const reviews = new CollectionReviews(context, provider, async () => { throw new Error('Running preview must not be approved.'); });
        try {
            const controller = await reviews.open([httpCandidate({ request: request({ url: `${baseUrl}/slow` }) })]);
            await runEditorScript(controller, `
                document.querySelector('.case-toggle').click();
                document.querySelector('.send-preview').click();
                await waitFor(() => !document.querySelector('.cancel-preview').hidden);
                if (!document.querySelector('#confirm-collection').disabled) throw new Error('Confirmation is enabled while sending.');
                window.testApi.postMessage({ command: 'confirmCollection', selections: [{ id: 'http', comment: '' }] });
                await waitFor(() => !document.querySelector('#review-error').hidden);
                if (!document.querySelector('#review-error').textContent.includes('running previews')) throw new Error('Server accepted confirmation while sending.');
                document.querySelector('.cancel-preview').click();
                await waitFor(() => document.querySelector('.preview-error').textContent === 'Request cancelled.');
                if (document.querySelector('.send-preview').disabled) throw new Error('Preview stayed busy after cancellation.');
                document.querySelector('.request-preview input[type="url"]').value = '${baseUrl}/api/posts/{id}';
                document.querySelector('.send-preview').click();
                await waitFor(() => document.querySelector('.preview-error').textContent.includes('route placeholders'));
            `);
            assert.throws(() => reviews.getApproved(controller.reviewId), /Confirm the active collection review/);
            assert.deepStrictEqual(provider.getChildren(), []);
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('MCP shares full responses only for localhost and literal loopback targets', async () => {
        const extensionContext = (await getTestApi()).extensionVariables.getContext();
        assert.ok(extensionContext);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(extensionContext, provider);
        const saved = invocation();
        const body = 'private-response-' + '\u03c0'.repeat(40 * 1024);
        const headers = [{ name: 'Content-Type', value: 'text/plain' }];
        const before = receivedRequests;
        editors.sendRequest = async (_context, input) => {
            assert.deepStrictEqual(input.request, provider.getRequest(saved.id)?.request);
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
        const definition = runHttpInvocationTool(provider, editors);
        const tool = new McpTool(definition.name, definition.execute, definition);
        const extras = { signal: new AbortController().signal, requestId: 'run' };
        try {
            for (const host of ['localhost', 'LOCALHOST', 'localhost.', '127.0.0.1', '127.1', '127.255.0.1', '[::1]', '[0:0:0:0:0:0:0:1]']) {
                provider.saveRequest({ ...saved, request: { ...saved.request, url: `http://${host}:7071/api/test` } });
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
                provider.saveRequest({ ...saved, request: { ...saved.request, url } });
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
            assert.strictEqual(receivedRequests, before);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('MCP runs saved snapshots without overwriting unsaved editor fields and replays the full response', async () => {
        const extensionContext = (await getTestApi()).extensionVariables.getContext();
        assert.ok(extensionContext);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(extensionContext, provider);
        const saved = invocation();
        provider.saveRequest(saved);
        const editor = editors.open(saved, true);
        const definition = runHttpInvocationTool(provider, editors);
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
                document.querySelector('#url').value = '${baseUrl}/unsaved';
                document.querySelector('#body').value = 'unsaved body';
                document.querySelector('#url').dispatchEvent(new Event('input', { bubbles: true }));
                window.testApi.postMessage({ command: 'ready', testRun: true });
                await waitFor(() => !document.querySelector('#response-body').hidden);
                const response = JSON.parse(document.querySelector('#response-body').textContent);
                if (response.body !== '{"hello":"world"}' || response.method !== 'POST') throw new Error('The saved snapshot was not sent.');
                if (document.querySelector('#url').value !== '${baseUrl}/unsaved' || document.querySelector('#body').value !== 'unsaved body') throw new Error('Running overwrote unsaved fields.');
                if (document.querySelector('#save').disabled || document.querySelector('#saved-invocation-hint').hidden) throw new Error('Saved-snapshot state is not visible.');
            `);
            assert.ok(pending);
            const result = runResultSchema.parse(await pending).structuredContent;
            const echoed = JSON.parse(result.body ?? '');
            assert.strictEqual(echoed.url, '/echo?tag=a+%26+b');
            assert.strictEqual(echoed.headers['x-functions-key'], 'example-key');
            assert.deepStrictEqual(provider.getRequest(saved.id), saved);
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#response-body').hidden);
                if (JSON.parse(document.querySelector('#response-body').textContent).body !== '{"hello":"world"}') throw new Error('Completed response was lost during initialization.');
                if (document.querySelector('#send').disabled || !document.querySelector('#abort').hidden) throw new Error('The completed request is still busy.');
            `);
            for (const method of ['GET', 'HEAD'] as const) {
                const snapshot = { ...saved, request: request({ method, body: 'preserved for POST' }) };
                provider.saveRequest(snapshot);
                const response = runResultSchema.parse(await tool.executeMcp({ id: saved.id }, extras)).structuredContent;
                assert.strictEqual(response.status, 200);
                assert.strictEqual(method === 'HEAD' ? response.body : JSON.parse(response.body ?? '').body, '');
                assert.deepStrictEqual(provider.getRequest(saved.id), snapshot);
            }
            for (const [route, status] of [['/error', 503], ['/redirect', 302], ['/limit', 200], ['/private-response', 200]] as const) {
                provider.saveRequest({ ...saved, request: request({ url: `${baseUrl}${route}` }) });
                const before = receivedRequests;
                const response = runResultSchema.parse(await tool.executeMcp({ id: saved.id }, extras)).structuredContent;
                assert.strictEqual(response.status, status);
                assert.strictEqual(receivedRequests, before + 1);
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
            provider.saveRequest({ ...saved, request: request({ url: `${baseUrl}/drop?code=private-key` }) });
            const failed = await tool.executeMcp({ id: saved.id }, extras);
            assert.ok('isError' in failed && failed.isError);
            assert.strictEqual(provider.getRequestStatus(saved.id), 'Failed');
            assert.ok(!JSON.stringify(failed).includes('private-key'));
            assert.ok(!serializeInvocationCollection(provider.getChildren()).includes('private-response-body'));
        } finally {
            subscription.dispose();
            editors.dispose();
            provider.dispose();
        }
    });

    test('MCP execution supports editor cancellation, busy rejection, client cancellation, and closing the panel', async () => {
        const extensionContext = (await getTestApi()).extensionVariables.getContext();
        assert.ok(extensionContext);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(extensionContext, provider);
        const saved = { ...invocation(), request: request({ url: `${baseUrl}/slow-body` }) };
        provider.saveRequest(saved);
        const definition = runHttpInvocationTool(provider, editors);
        const tool = new McpTool(definition.name, definition.execute, definition);
        const extras = { signal: new AbortController().signal, requestId: 'run' };
        const editor = editors.open(saved, true);
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
                const started = new Promise<void>(resolve => server.once('request', () => resolve()));
                const running = tool.executeMcp({ id: saved.id }, { signal: abort.signal, requestId: 'cancelled' });
                await started;
                if (close) {
                    editor.panel.dispose();
                } else {
                    abort.abort();
                }
                const result = await running;
                assert.ok('isError' in result && result.isError);
                assert.strictEqual(provider.getRequestStatus(saved.id), 'Cancelled');
                assert.ok(!JSON.stringify(result).includes('nonNull'));
            }
            assert.deepStrictEqual(provider.getRequest(saved.id), saved);
        } finally {
            subscription.dispose();
            editors.dispose();
            provider.dispose();
        }
    });

    function findInvocationTab(name?: string): vscode.Tab | undefined {
        return vscode.window.tabGroups.all.flatMap(group => group.tabs).find(candidate =>
            candidate.input instanceof vscode.TabInputWebview && candidate.input.viewType.includes('azureInvokeHttpRequest') &&
            (name === undefined || candidate.label === name));
    }

    async function waitForTabChange(predicate: () => boolean): Promise<void> {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                subscription.dispose();
                reject(new Error('The Azure Invoke tab did not update.'));
            }, 5000);
            const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
                if (predicate()) {
                    clearTimeout(timer);
                    subscription.dispose();
                    resolve();
                }
            });
        });
    }

    async function waitForInvocationTab(name?: string): Promise<vscode.Tab> {
        await waitForTabChange(() => !!findInvocationTab(name));
        const tab = findInvocationTab(name);
        assert.ok(tab);
        return tab;
    }

    test('AI authoring contributes its command, review entry point, and bundled agent', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const contributions = context.extension.packageJSON.contributes;
        const commands = z.array(z.object({ command: z.string() })).parse(contributions.commands);
        assert.ok(commands.some(command => command.command === 'azureFunctions.azureInvoke.buildWithAI'),
            'AI authoring must be declared in contributes.commands, not x-azResources.commands.');
        const agents = z.array(z.object({ name: z.string(), path: z.string() })).parse(contributions.chatAgents);
        const agent = agents.find(agent => agent.name === 'azure-invoke');
        assert.ok(agent);
        assert.ok((await vscode.commands.getCommands()).includes('azureFunctions.azureInvoke.buildWithAI'));
        const toolbar = z.array(z.object({ command: z.optional(z.string()), when: z.optional(z.string()) })).parse(contributions.menus['view/title']);
        assert.ok(toolbar.some(entry => entry.command === 'azureFunctions.azureInvoke.buildWithAI' && entry.when === 'view == azureFunctions.azureInvoke'));
        const content = await fs.readFile(path.join(context.extensionPath, agent.path), 'utf8');
        assert.match(content, /\nname: Azure Invoke\n/);
        for (const name of ['propose_invocation_collection', 'get_invocation_collection_review', 'draft_http_invocation', 'list_http_invocations', 'run_http_invocation']) {
            assert.ok(content.includes(`  - Azure Functions Extension Tools/${name}`));
        }
        assert.ok(!content.includes('  - Azure Functions Extension Tools/create_http_invocation'));
    });

    test('HTTP trigger command opens the bundled request editor', async () => {
        const api = await getTestApi();
        const ui = new TestUserInput(vscode);
        const handler = api.testing.registerOnActionStartHandler(context => {
            if (context.callbackId === 'azureFunctions.azureInvoke.add') {
                context.ui = ui;
                context.errorHandling.rethrow = true;
            }
        });
        try {
            await ui.runWithInputs(['HTTP trigger'], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.add');
            });
        } finally {
            handler.dispose();
        }
        const tab = await waitForInvocationTab();
        await vscode.window.tabGroups.close(tab);
    });

    test('bundled MCP creates and runs invocations in the same collection used by commands', async () => {
        const api = await getTestApi();
        const mcp = await api.testing.startMcpServer();
        const rpc = createMcpClient(mcp);
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-invoke-mcp-'));
        const target = vscode.Uri.file(path.join(directory, 'collection.json'));
        const toolbarTarget = vscode.Uri.file(path.join(directory, 'toolbar-collection.json'));
        const toolbarContext = { viewId: 'azureFunctions.azureInvoke' };
        const showSaveDialog = vscode.window.showSaveDialog;
        let saveDialogCalls = 0;
        let cancelSaveDialog = false;
        vscode.window.showSaveDialog = async () => {
            saveDialogCalls++;
            return cancelSaveDialog ? undefined : toolbarTarget;
        };
        const ui = new TestUserInput(vscode);
        const handler = api.testing.registerOnActionStartHandler(context => {
            if (context.callbackId === 'azureFunctions.azureInvoke.saveCollection' ||
                context.callbackId === 'azureFunctions.azureInvoke.openCollection') {
                context.ui = ui;
                context.errorHandling.rethrow = true;
                context.errorHandling.suppressDisplay = true;
            }
        });
        try {
            await rpc('initialize', {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 'azure-invoke-bundle-test', version: '1.0.0' },
            });
            await rpc('notifications/initialized', {}, true);
            const discovered = z.object({ result: z.object({ tools: z.array(z.object({ name: z.string() })) }) })
                .parse(await rpc('tools/list', {}));
            assert.deepStrictEqual(discovered.result.tools.map(tool => tool.name).sort(), [
                'create_http_invocation', 'draft_http_invocation', 'get_invocation_collection_review', 'list_http_invocations', 'propose_invocation_collection', 'run_http_invocation',
            ]);
            const listed = z.object({
                result: z.object({ structuredContent: z.object({ invocations: z.array(z.object({ id: z.string(), name: z.string(), method: z.string(), dependencyIds: z.array(z.string()) })) }) }),
            }).parse(await rpc('tools/call', { name: 'list_http_invocations', arguments: {} }));
            assert.deepStrictEqual(listed.result.structuredContent.invocations, []);
            const before = receivedRequests;
            const input = { name: 'Bundled AI request', ...invocation().request };
            const created = z.object({
                result: z.object({ structuredContent: z.object({ id: z.string() }) }),
            }).parse(await rpc('tools/call', { name: 'create_http_invocation', arguments: input }));
            assert.ok(!findInvocationTab(input.name));
            assert.strictEqual(receivedRequests, before);
            const ran = z.object({ result: runResultSchema }).parse(await rpc('tools/call', {
                name: 'run_http_invocation', arguments: { id: created.result.structuredContent.id },
            })).result;
            assert.notStrictEqual(ran.isError, true);
            assert.strictEqual(ran.structuredContent.status, 200);
            assert.strictEqual(JSON.parse(ran.structuredContent.body ?? '').body, input.body);
            assert.strictEqual(receivedRequests, before + 1);
            assert.ok(!findInvocationTab(input.name), 'AI execution opened an unsolicited request tab.');
            await ui.runWithInputs(['Save Collection'], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.saveCollection', target);
            });
            const saved = parseInvocationCollection(await fs.readFile(target.fsPath, 'utf8'));
            assert.deepStrictEqual(saved, [{ id: created.result.structuredContent.id, name: input.name, request: invocation().request }]);
            assert.strictEqual(saveDialogCalls, 0);
            await ui.runWithInputs(['Save Collection'], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.saveCollection', toolbarContext);
            });
            assert.strictEqual(saveDialogCalls, 1);
            assert.deepStrictEqual(parseInvocationCollection(await fs.readFile(toolbarTarget.fsPath, 'utf8')), saved);

            cancelSaveDialog = true;
            await ui.runWithInputs([], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.saveCollection', toolbarContext);
            });
            assert.strictEqual(saveDialogCalls, 2);
            assert.deepStrictEqual(parseInvocationCollection(await fs.readFile(toolbarTarget.fsPath, 'utf8')), saved);

            await ui.runWithInputs([toolbarTarget.fsPath, 'Open Collection'], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.openCollection', toolbarContext);
            });
            await waitForTabChange(() => !findInvocationTab(input.name));
            await vscode.commands.executeCommand('azureFunctions.azureInvoke.open', { id: created.result.structuredContent.id });
            await waitForInvocationTab(input.name);
            await vscode.window.tabGroups.close(await waitForInvocationTab(input.name));
            await waitForTabChange(() => !findInvocationTab(input.name));
            await vscode.commands.executeCommand('azureFunctions.azureInvoke.open', { id: created.result.structuredContent.id });
            const reopened = await waitForInvocationTab(input.name);
            await vscode.window.tabGroups.close(reopened);
            assert.strictEqual(receivedRequests, before + 1);
        } finally {
            vscode.window.showSaveDialog = showSaveDialog;
            handler.dispose();
            mcp.disposable.dispose();
            await fs.remove(directory);
        }
    });
});
