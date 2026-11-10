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
import { listBlobInvocationsTool } from '../src/chat/tools/azureInvoke/blobInvocationTools';
import { listHttpInvocationsTool } from '../src/chat/tools/azureInvoke/listHttpInvocationsTool';
import { runHttpInvocationTool } from '../src/chat/tools/azureInvoke/runHttpInvocationTool';
import { openCollectionFile, saveCollectionFile } from '../src/commands/azureInvoke/collectionFiles';
import { mcpServerId } from '../src/constants';
import { AzureInvokeTreeDataProvider } from '../src/tree/azureInvoke/AzureInvokeTreeDataProvider';
import { parseInvocationCollection, serializeInvocationCollection } from '../src/tree/azureInvoke/invocationCollection';
import { HttpRequestController } from '../src/webviews/azureInvoke/extension/HttpRequestController';
import { HttpRequestEditors } from '../src/webviews/azureInvoke/extension/HttpRequestEditors';
import { BlobInvocationEditors } from '../src/webviews/azureInvoke/extension/BlobInvocationEditors';
import { TimerInvocationEditors } from '../src/webviews/azureInvoke/extension/TimerInvocationEditors';
import { type BlobInvocation, type BlobUploadState } from '../src/webviews/azureInvoke/shared/blobInvocation';
import { sendHttpRequest } from '../src/webviews/azureInvoke/extension/sendHttpRequest';
import { type HttpInvocation, type HttpRequest } from '../src/webviews/azureInvoke/shared/httpRequest';
import { type TimerInvocation } from '../src/webviews/azureInvoke/shared/timerInvocation';
import { formatResponseBody } from '../src/webviews/azureInvoke/views/formatResponseBody';
import { getTestApi } from './utils/testApiAccess';

suite('Azure Invoke', () => {
    let server: Server;
    let baseUrl: string;
    let receivedRequests = 0;
    const accountBodies: string[] = [];
    const debugBodies: string[] = [];
    const timerRequests: { url: string; method: string; body: string; contentType?: string }[] = [];
    let accountNumber = 0;
    const compactResponseJson = '{"items":[{"id":9007199254740993,"amount":1.2300e+4,"zero":-0}],"message":"<img src=x>","empty":[]}';
    const formattedResponseJson = [
        '{',
        '  "items": [',
        '    {',
        '      "id": 9007199254740993,',
        '      "amount": 1.2300e+4,',
        '      "zero": -0',
        '    }',
        '  ],',
        '  "message": "<img src=x>",',
        '  "empty": []',
        '}',
    ].join('\n');

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
            if (request.url === '/format-json') {
                response.writeHead(200, { 'content-type': 'application/json' });
                response.end(compactResponseJson);
                return;
            }
            if (request.url === '/diagnosis-error') {
                response.writeHead(422, {
                    'content-type': 'application/json',
                    'set-cookie': 'session=private-diagnosis-cookie',
                    'x-functions-key': 'private-diagnosis-key',
                    'x-custom-secret': 'private-diagnosis-header',
                });
                response.end('{"error":"name is required"}');
                return;
            }
            if (request.url === '/large-error') {
                response.writeHead(500, { 'content-type': 'text/plain' });
                response.end('\u03c0'.repeat(40 * 1024));
                return;
            }
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
                chunks.push(Buffer.from(chunk));
            }
            if (request.url?.startsWith('/admin/functions/')) {
                timerRequests.push({
                    url: request.url, method: request.method ?? '', body: Buffer.concat(chunks).toString(),
                    contentType: request.headers['content-type'],
                });
                if (request.url.endsWith('/SlowTimer')) {
                    return;
                }
                response.writeHead(request.url.endsWith('/MissingTimer') ? 404 : 202);
                response.end('private-timer-host-body');
                return;
            }
            response.setHeader('content-type', 'application/json');
            if (request.url?.startsWith('/repairable')) {
                const input: unknown = JSON.parse(Buffer.concat(chunks).toString());
                const valid = !!input && typeof input === 'object' && 'name' in input && typeof input.name === 'string' && !!input.name.trim();
                response.writeHead(valid ? 200 : 422, { 'set-cookie': 'session=private-repair-cookie' });
                response.end(valid ? '{"accepted":true}' : '{"error":"name is required"}');
                return;
            }
            if (request.url?.startsWith('/debug-replay')) {
                debugBodies.push(Buffer.concat(chunks).toString());
                response.writeHead(422, { 'set-cookie': 'session=private-debug-cookie', 'x-functions-key': 'private-debug-response-key' });
                response.end('{"error":"inspect the handler"}');
                return;
            }
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

    test('ordinary zero and negative timeouts do not disable request cancellation', async () => {
        for (const timeout of [0, -1]) {
            await assert.rejects(send(request({ url: `${baseUrl}/slow` }), undefined, timeout), /Request timed out/);
        }
    });

    test('saves named snapshots without adding drafts or exposing request data in command arguments', () => {
        const provider = new AzureInvokeTreeDataProvider();
        try {
            assert.deepStrictEqual(provider.getRequests(), []);
            const first = provider.createRequest();
            const second = provider.createRequest();
            assert.deepStrictEqual(provider.getRequests(), []);
            const saved = { ...first, name: 'My endpoint', request: request({ headers: [{ name: 'x-functions-key', value: 'example-key' }] }) };
            provider.saveRequest(saved);
            const item = provider.getTreeItem(provider.getRequests()[0]);
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
            assert.strictEqual(provider.getRequests().length, 1);
            assert.strictEqual(provider.getRequests()[0].name, 'Renamed endpoint');
            assert.notStrictEqual(first.id, second.id);
        } finally {
            provider.dispose();
        }
        assert.deepStrictEqual(provider.getRequests(), []);
        const nextSession = new AzureInvokeTreeDataProvider();
        assert.deepStrictEqual(nextSession.getRequests(), []);
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

    test('shows trigger types with last-run times and status icons instead of response descriptions', () => {
        const provider = new AzureInvokeTreeDataProvider();
        const saved = invocation();
        provider.saveRequest(saved);
        function itemWithIcon(icon: string, color?: string): vscode.TreeItem {
            const item = provider.getTreeItem(saved);
            assert.ok(item.iconPath instanceof vscode.ThemeIcon);
            assert.strictEqual(item.iconPath.id, icon);
            assert.strictEqual(item.iconPath.color?.id, color);
            return item;
        }
        try {
            const ready = itemWithIcon('circle-outline');
            assert.strictEqual(ready.description, 'HTTP Trigger');
            assert.strictEqual(ready.tooltip, 'Not run yet');
            const before = new Date();
            provider.updateRequestStatus(saved.id, { command: 'requestStarted', saved: true });
            const after = new Date();
            const running = itemWithIcon('loading~spin');
            assert.ok([before, after].some(time => running.description === `HTTP Trigger (${time.toLocaleTimeString()})`));
            assert.ok(String(running.tooltip).includes('Running...'));
            for (const status of [199, 200, 201, 204, 299, 300, 302, 400, 500]) {
                provider.updateRequestStatus(saved.id, { command: 'response', response: { status, duration: 12, headers: [], body: '' } });
                const succeeded = status >= 200 && status < 300;
                const finished = itemWithIcon(succeeded ? 'pass' : 'error', succeeded ? 'testing.iconPassed' : 'testing.iconFailed');
                assert.strictEqual(finished.description, running.description);
                assert.ok(String(finished.tooltip).includes(`${status}, 12 ms`));
            }
            provider.updateRequestStatus(saved.id, { command: 'requestError', message: 'private-transport-error' });
            const failed = itemWithIcon('error', 'testing.iconFailed');
            assert.strictEqual(failed.description, running.description);
            assert.ok(!String(failed.tooltip).includes('private-transport-error'));
            provider.saveRequest({ ...saved, name: 'Renamed after running' });
            assert.strictEqual(itemWithIcon('error', 'testing.iconFailed').description, running.description);
            provider.updateRequestStatus(saved.id, { command: 'requestError', message: 'Cancelled', cancelled: true });
            assert.strictEqual(itemWithIcon('circle-slash').description, running.description);
            provider.replaceRequests([saved]);
            assert.strictEqual(itemWithIcon('circle-outline').description, 'HTTP Trigger');
        } finally {
            provider.dispose();
        }
    });

    test('groups invocations into folders without hiding ungrouped requests or changing flat access', () => {
        const provider = new AzureInvokeTreeDataProvider();
        const health = { ...invocation(), id: 'group:Posts', name: 'Get health' };
        const createPost = { ...invocation(), id: 'create', name: 'Create post', group: ' Posts ' };
        const getPost = { ...invocation(), id: 'get', name: 'Get post', group: 'Posts' };
        const account = { ...invocation(), id: 'account', name: 'Create account', group: 'Accounts' };
        try {
            provider.saveRequests([health, createPost, account, getPost]);
            const posts = { group: 'Posts' };
            const accounts = { group: 'Accounts' };
            assert.deepStrictEqual(provider.getChildren(), [health, posts, accounts]);
            assert.deepStrictEqual(provider.getChildren(posts), [{ ...createPost, group: 'Posts' }, getPost]);
            assert.deepStrictEqual(provider.getChildren(accounts), [account]);
            assert.deepStrictEqual(provider.getChildren(getPost), []);
            assert.strictEqual(provider.getRequests().length, 4);
            assert.strictEqual(provider.getRequest(createPost.id)?.group, 'Posts');
            const folder = provider.getTreeItem(posts);
            assert.strictEqual(folder.label, 'Posts');
            assert.strictEqual(folder.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            assert.ok(folder.iconPath instanceof vscode.ThemeIcon);
            assert.strictEqual(folder.iconPath.id, 'folder');
            assert.strictEqual(folder.command, undefined);
            assert.notStrictEqual(provider.getTreeItem(health).id, folder.id);
            provider.saveRequest({ ...createPost, group: 'Accounts' });
            provider.saveRequest({ ...getPost, group: undefined });
            assert.deepStrictEqual(provider.getChildren(), [health, accounts, { id: getPost.id, name: getPost.name, request: getPost.request }]);
            assert.deepStrictEqual(provider.getChildren(posts), []);
            provider.replaceRequests([health]);
            assert.deepStrictEqual(provider.getChildren(), [health]);
        } finally {
            provider.dispose();
        }
    });

    test('round trips optional groups without persisting runtime status', () => {
        const provider = new AzureInvokeTreeDataProvider();
        const source = { ...accountChain()[0], group: 'Accounts' };
        const target = { ...accountChain()[1], group: 'Accounts' };
        try {
            for (const invocations of [[invocation()], [source], [source, target]]) {
                provider.replaceRequests(invocations);
                provider.updateRequestStatus(invocations[0].id, { command: 'response', response: { status: 200, duration: 1, headers: [], body: '' } });
                const serialized = serializeInvocationCollection(provider.getRequests());
                assert.deepStrictEqual(parseInvocationCollection(serialized), invocations);
                assert.strictEqual(JSON.parse(serialized).version, invocations.length === 2 ? 2 : 1);
                assert.ok(!serialized.includes('lastRun'));
                assert.ok(!serialized.includes('duration'));
                provider.replaceRequests(parseInvocationCollection(serialized));
                assert.strictEqual(provider.getTreeItem(invocations[0]).description, 'HTTP Trigger');
            }
        } finally {
            provider.dispose();
        }
    });

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
                JSON.stringify({ version: 5, invocations: [] }),
                JSON.stringify({ version: 1, invocations: {} }),
                JSON.stringify({ version: 1, invocations: [saved, saved] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, name: ' ' }] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, name: 'a\nb' }] }),
                ...[null, 42, '', ' ', 'a\nb', 'a'.repeat(101)].map(group => JSON.stringify({ version: 1, invocations: [{ ...saved, group }] })),
                JSON.stringify({ version: 1, invocations: [{ ...saved, request: { ...saved.request, method: 'TRACE' } }] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, request: { ...saved.request, body: 'x'.repeat(5 * 1024 * 1024 + 1) } }] }),
            ]) {
                assert.throws(() => provider.replaceRequests(parseInvocationCollection(invalid)), (error: unknown) =>
                    error instanceof Error && !error.message.includes('private-value'));
                assert.deepStrictEqual(provider.getRequests(), [saved]);
            }
            assert.throws(() => provider.replaceRequests([saved, saved]), /duplicate invocation IDs/);
            assert.deepStrictEqual(provider.getRequests(), [saved]);
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
    let editorInteractionSequence = 0;

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
                    .replace('</body>', `<script nonce="${nonce}" data-test-interaction="${++editorInteractionSequence}">
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
                            let receiveInitialReview;
                            const initialReview = new Promise(resolve => {
                                receiveInitialReview = event => {
                                    if (event.data.command === 'proposal') {
                                        window.removeEventListener('message', receiveInitialReview);
                                        setTimeout(resolve, 0);
                                    }
                                };
                                window.addEventListener('message', receiveInitialReview);
                            });
                            await waitFor(() => document.querySelector('#save') || document.querySelector('#confirm-collection'));
                            if (document.querySelector('#confirm-collection')) {
                                await initialReview;
                            } else {
                                window.removeEventListener('message', receiveInitialReview);
                            }
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
        const draft = { ...provider.createRequest(), group: 'Customers' };
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
            assert.strictEqual(saved.group, 'Customers');
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

    test('response formatting preserves non-JSON bodies, malformed JSON, primitives, and original JSON tokens', () => {
        assert.strictEqual(formatResponseBody(compactResponseJson), formattedResponseJson);
        for (const body of ['', '  plain text\nunchanged  ', '<html>Not JSON</html>', '{"incomplete":', '{"trailing":true,}', '/* comment */ {"value":1}', 'null', 'true', '42', '[]', '{}', '"literal\\nvalue"']) {
            assert.strictEqual(formatResponseBody(body), body);
        }
        assert.strictEqual(formatResponseBody('{"escaped":"\\u0061\\n\\\"","duplicate":1,"duplicate":2}'),
            '{\n  "escaped": "\\u0061\\n\\\"",\n  "duplicate": 1,\n  "duplicate": 2\n}');
    });

    test('JSON responses are indented in both the request editor and collection preview without changing values', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const invocation = { ...provider.createRequest(), request: request({ url: `${baseUrl}/format-json` }) };
        const editor = new HttpRequestController(context, invocation, false, saved => provider.saveRequest(saved));
        try {
            await runEditorScript(editor, `
                document.querySelector('#send').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                if (document.querySelector('#response-body').textContent !== ${JSON.stringify(formattedResponseJson)}) throw new Error('The request editor did not indent JSON while preserving its original values.');
                if (document.querySelector('#response-body img')) throw new Error('The response was interpreted as HTML.');
            `);
            provider.saveRequest(invocation);
        } finally {
            editor.panel.dispose();
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
                assert.strictEqual(provider.getRequests().length, 3);
                assert.strictEqual(editors.size, 0);
            }
            assert.strictEqual(receivedRequests, before);
            editors.closeAll();
            assert.strictEqual(editors.size, 0);
            assert.strictEqual(provider.getRequests().length, 3);
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
            assert.deepStrictEqual(provider.getRequests(), []);
            assert.strictEqual(editors.size, 0);

            editors.open = () => { throw new Error('private-value editor failure'); };
            const created = await tool.executeMcp(input, { signal: new AbortController().signal, requestId: 'created' });
            assert.ok(!('isError' in created && created.isError));
            assert.ok(!JSON.stringify(created).includes('private-value'));
            assert.strictEqual(provider.getRequests().length, 1);
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

    test('agents can distinguish failed saved requests from requests that have not run', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const failed = { id: 'saved-failure', name: 'Failed request', group: 'Accounts', request: request({ url: `${baseUrl}/error` }) };
        const pending = { id: 'saved-pending', name: 'Not run', group: 'Accounts', request: request() };
        provider.saveRequests([failed, pending]);
        const definition = listHttpInvocationsTool(provider);
        const tool = new McpTool(definition.name, definition.execute, definition);
        try {
            const editor = editors.open(failed, true);
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
            const slow = { ...pending, request: request({ url: `${baseUrl}/slow` }) };
            provider.saveRequest(slow);
            const abort = new AbortController();
            const started = new Promise<void>(resolve => server.once('request', () => resolve()));
            const running = editors.sendRequest(await createTestActionContext(), slow, abort.signal);
            await started;
            assert.strictEqual(provider.getRequestRunStatus(slow.id).status, 'running');
            abort.abort();
            await assert.rejects(running, isUserCancelledError);
            assert.strictEqual(provider.getRequestRunStatus(slow.id).status, 'cancelled');
        } finally {
            editors.dispose();
            provider.dispose();
        }
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
                const exported = serializeInvocationCollection(provider.getRequests());
                assert.ok(exported.includes('{{guid}}'));
                assert.ok(!exported.includes(created.email));
                assert.ok(!exported.includes(created.password));
                assert.deepStrictEqual(parseInvocationCollection(exported), provider.getRequests());
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
            assert.deepStrictEqual(provider.getRequests(), [existing]);
            assert.strictEqual(changes, 0);
            provider.saveRequests([target, source]);
            assert.strictEqual(changes, 1);
            assert.deepStrictEqual(provider.getRequests(), [existing, target, source]);
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
            const content = serializeInvocationCollection(provider.getRequests());
            assert.strictEqual(JSON.parse(content).version, 2);
            assert.ok(!content.includes(`account/${accountNumber} ?#`));
            assert.deepStrictEqual(parseInvocationCollection(content), provider.getRequests());
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

    for (const route of ['/error', '/drop']) {
        test(`requests blocked by prerequisite failures show warning icons (${route})`, async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const editors = new HttpRequestEditors(context, provider);
            const source = { id: 'failed-prerequisite', name: 'Failing prerequisite', request: request({ url: `${baseUrl}${route}` }) };
            const middle = { id: 'blocked-middle', name: 'Blocked intermediate', request: request({ dependsOn: [source.id] }) };
            const target = { id: 'blocked-target', name: 'Blocked request', request: request({ dependsOn: [middle.id] }) };
            provider.saveRequests([source, middle, target]);
            const before = receivedRequests;
            try {
                const editor = editors.open(target, true);
                await runEditorScript(editor, `
                    document.querySelector('#run-chain').click();
                    await waitFor(() => !document.querySelector('#error').hidden);
                    if (!document.querySelector('#error').classList.contains('request-warning')) throw new Error('The blocked request is still presented as a failure.');
                    if (!document.querySelector('#debug-response').disabled) throw new Error('Debugging is offered for a request that never ran.');
                `);
                assert.strictEqual(receivedRequests, before + 1, 'A blocked request was sent.');
                assert.strictEqual((provider.getTreeItem(source).iconPath as vscode.ThemeIcon).id, 'error');
                for (const invocation of [middle, target]) {
                    assert.strictEqual((provider.getTreeItem(invocation).iconPath as vscode.ThemeIcon).id, 'warning');
                    assert.strictEqual(provider.getRequestRunStatus(invocation.id).status, 'blocked');
                }
                const definition = listHttpInvocationsTool(provider);
                const list = new McpTool(definition.name, definition.execute, definition);
                const statuses = z.object({ structuredContent: z.object({ invocations: z.array(z.object({ status: z.string() })) }) })
                    .parse(await list.executeMcp(undefined, { signal: new AbortController().signal, requestId: 'blocked-status' }));
                assert.deepStrictEqual(statuses.structuredContent.invocations.map(invocation => invocation.status), ['failed', 'blocked', 'blocked']);
                provider.saveRequest({ ...source, request: request() });
                await editors.sendRequest(await createTestActionContext(), target, undefined, true);
                assert.strictEqual(receivedRequests, before + 4);
                for (const invocation of [source, middle, target]) {
                    assert.strictEqual((provider.getTreeItem(invocation).iconPath as vscode.ThemeIcon).id, 'pass');
                }
            } finally {
                editors.dispose();
                provider.dispose();
            }
        });
    }

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
            await pending.catch(() => { /* no-op */ });
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



    test('non-loopback targets are blocked before any request in their chain is sent', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const address = Object.values(os.networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal);
        assert.ok(address);
        let remoteRequests = 0;
        const fixture = createServer((_request, response) => {
            remoteRequests++;
            response.end('private non-local response');
        });
        await new Promise<void>(resolve => fixture.listen(0, address.address, resolve));
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const [source] = accountChain();
        const target = { id: 'non-local-target', name: 'Remote request', request: request({ url: `http://${address.address}:${(fixture.address() as AddressInfo).port}/echo`, dependsOn: [source.id] }) };
        provider.saveRequests([source, target]);
        const before = receivedRequests;
        const accounts = accountBodies.length;
        try {
            const editor = editors.open(target, true);
            await runEditorScript(editor, `
                for (const action of ['#run-chain', '#send']) {
                    document.querySelector('#error').hidden = true;
                    document.querySelector(action).click();
                    await waitFor(() => !document.querySelector('#error').hidden);
                    if (!document.querySelector('#error').textContent.includes('limited support')) throw new Error(action + ' did not explain the local-only limit.');
                    if (!document.querySelector('#response-body').hidden) throw new Error(action + ' displayed a response.');
                }
            `);
            await assert.rejects(editors.sendRequest(await createTestActionContext(), target, undefined, true), /limited support/);
            assert.strictEqual(remoteRequests, 0, 'A non-loopback request was sent.');
            assert.strictEqual(receivedRequests, before, 'A local prerequisite ran before the chain was rejected.');
            assert.strictEqual(accountBodies.length, accounts);
            assert.deepStrictEqual(provider.getRequest(target.id), target, 'Remote URLs can still be saved.');
        } finally {
            editors.dispose();
            provider.dispose();
            fixture.closeAllConnections();
            await new Promise<void>((resolve, reject) => fixture.close(error => error ? reject(error) : resolve()));
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
            assert.ok(!serializeInvocationCollection(provider.getRequests()).includes('private-response-body'));
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


    suite('manual Blob invocations', () => {
        let storage: Server;
        let storageUrl: string;
        let sequence = 0;
        const containers = new Set<string>();
        const blobs = new Map<string, { bytes: Buffer; contentType: string; etag: string }>();
        const uploads: { path: string; bytes: Buffer; contentType: string; ifMatch?: string; ifNoneMatch?: string }[] = [];
        let changeBeforeWrite = false;
        let onPendingUpload: (() => void) | undefined;
        let onContainerWrite: (() => void) | undefined;

        suiteSetup(async () => {
            storage = createServer(async (request, response) => {
                const url = new URL(request.url ?? '/', 'http://localhost');
                const key = decodeURIComponent(url.pathname);
                response.setHeader('x-ms-request-id', 'blob-fixture');
                response.setHeader('x-ms-version', '2020-06-12');
                if (request.method === 'HEAD') {
                    const blob = blobs.get(key);
                    if (!blob) {
                        response.writeHead(404, { 'x-ms-error-code': 'BlobNotFound' }).end();
                    } else {
                        response.writeHead(200, { etag: blob.etag, 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT', 'content-length': blob.bytes.length }).end();
                    }
                    return;
                }
                if (request.method === 'PUT' && url.searchParams.get('restype') === 'container') {
                    if (containers.has(key)) {
                        response.writeHead(409, { 'x-ms-error-code': 'ContainerAlreadyExists' }).end();
                    } else {
                        containers.add(key);
                        response.writeHead(201).end();
                    }
                    onContainerWrite?.();
                    return;
                }
                if (request.method === 'PUT') {
                    const parts: Buffer[] = [];
                    for await (const part of request) {
                        parts.push(Buffer.from(part));
                    }
                    const bytes = Buffer.concat(parts);
                    const contentType = String(request.headers['x-ms-blob-content-type']);
                    const ifMatch = request.headers['if-match']?.toString();
                    const ifNoneMatch = request.headers['if-none-match']?.toString();
                    uploads.push({ path: key, bytes, contentType, ifMatch, ifNoneMatch });
                    if (key.endsWith('/server-error.bin')) {
                        response.writeHead(503, { 'x-ms-error-code': 'ServerBusy' }).end('private storage diagnostics');
                        return;
                    }
                    if (key.endsWith('/pending.bin')) {
                        onPendingUpload?.();
                        return;
                    }
                    if (changeBeforeWrite) {
                        changeBeforeWrite = false;
                        blobs.set(key, { bytes: Buffer.from('concurrent writer'), contentType: 'text/plain', etag: '"concurrent"' });
                    }
                    const previous = blobs.get(key);
                    if ((ifNoneMatch === '*' && previous) || (ifMatch && previous?.etag !== ifMatch)) {
                        response.writeHead(412, { 'x-ms-error-code': 'ConditionNotMet' }).end();
                        return;
                    }
                    const etag = `"fixture-${++sequence}"`;
                    blobs.set(key, { bytes, contentType, etag });
                    response.writeHead(201, { etag, 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' }).end();
                    return;
                }
                response.writeHead(400).end();
            });
            await new Promise<void>(resolve => storage.listen(0, '127.0.0.1', resolve));
            storageUrl = `http://127.0.0.1:${(storage.address() as AddressInfo).port}/devstoreaccount1`;
        });

        setup(() => {
            containers.clear();
            blobs.clear();
            uploads.length = 0;
            changeBeforeWrite = false;
            onPendingUpload = undefined;
            onContainerWrite = undefined;
        });

        suiteTeardown(async () => {
            storage.closeAllConnections();
            await new Promise<void>((resolve, reject) => storage.close(error => error ? reject(error) : resolve()));
        });

        function fixture(): BlobInvocation {
            return {
                id: 'manual-blob', name: "Blob's </script><img src=x>", group: 'Manual fixtures', trigger: 'blob',
                request: {
                    target: { kind: 'azurite', url: storageUrl },
                    container: 'test-fixtures', blobName: 'nested/sample.json', encoding: 'utf8',
                    content: '{"id":"literal-{{guid}}","private":"fixture-secret"}', contentType: 'application/json',
                },
            };
        }



        test('mixed collections preserve Blob fixtures but HTTP discovery, runs, and dependencies exclude them', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const http = { ...invocation(), id: 'mixed-http' };
            const blob = fixture();
            const editors = new HttpRequestEditors(context, provider);
            try {
                provider.saveRequests([http, blob]);
                const serialized = serializeInvocationCollection(provider.getInvocations());
                assert.strictEqual(JSON.parse(serialized).version, 3);
                assert.deepStrictEqual(parseInvocationCollection(serialized), [http, blob]);
                provider.replaceRequests(parseInvocationCollection(serialized));
                assert.deepStrictEqual(provider.getRequests(), [http]);
                assert.strictEqual(provider.getRequest(blob.id), undefined);
                assert.deepStrictEqual(provider.getBlobInvocation(blob.id), blob);
                const listed = await listBlobInvocationsTool(provider).execute(undefined);
                assert.deepStrictEqual(listed.invocations.map(item => item.id), [blob.id]);
                assert.ok(!JSON.stringify(listed).includes('fixture-secret'));
                assert.throws(() => provider.saveRequest({ ...http, request: { ...http.request, dependsOn: [blob.id] } }), /unavailable/);
                await assert.rejects(() => Promise.resolve(runHttpInvocationTool(provider, editors).execute({ id: blob.id })), /no longer in the collection/);
                assert.strictEqual(uploads.length, 0);
                assert.strictEqual(provider.getTreeItem(blob).contextValue, 'azureInvoke.blob');
                const assertBlobPresentation = (): void => {
                    const item = provider.getTreeItem(blob);
                    assert.strictEqual(item.description, 'Blob Trigger');
                    assert.ok(item.iconPath instanceof vscode.ThemeIcon);
                    assert.strictEqual(item.iconPath.id, 'cloud-upload');
                    assert.strictEqual(item.iconPath.color, undefined);
                };
                assertBlobPresentation();
                const states: BlobUploadState[] = [
                    { command: 'uploadStarted' },
                    { command: 'uploadResult', result: { status: 'uploaded', duration: 1, bytes: 0, functionExecution: 'notObserved' } },
                    { command: 'uploadError', message: 'private error', cancelled: false },
                    { command: 'uploadError', message: 'cancelled', cancelled: true },
                ];
                for (const state of states) {
                    provider.updateBlobStatus(blob.id, state);
                    assertBlobPresentation();
                    assert.ok(String(provider.getTreeItem(blob).tooltip).includes('Last upload attempt:'));
                }
                assert.throws(() => parseInvocationCollection(JSON.stringify({ version: 2, invocations: [blob] })), /version 3/);
                assert.deepStrictEqual(provider.getRequests(), [http]);
            } finally {
                editors.dispose();
                provider.dispose();
            }
        });

        test('picks a file without content controls, preserves it on cancellation, and saves captured bytes for reopening', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const editors = new BlobInvocationEditors(context, provider);
            const draft = provider.createBlobInvocation();
            const blob = {
                ...draft, name: fixture().name,
                request: { ...draft.request, target: { kind: 'azurite' as const, url: storageUrl }, container: 'test-fixtures' },
            };
            const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-blob-'));
            const file = vscode.Uri.file(path.join(directory, 'fixture.bin'));
            const bytes = Buffer.from([0, 255, 128, 10, 65]);
            await fs.writeFile(file.fsPath, bytes);
            let selections = 0;
            const handler = registerOnActionStartHandler(action => {
                if (action.callbackId === 'azureFunctions.azureInvoke.blobEditor') {
                    action.ui.showOpenDialog = async () => {
                        if (++selections === 2) {
                            throw new UserCancelledError();
                        }
                        return [file];
                    };
                    action.ui.showWarningMessage = async () => { throw new Error('Uploading must not prompt for overwrite confirmation.'); };
                }
            });
            try {
                const editor = editors.open(blob, false);
                await runEditorScript(editor, `
                    if (document.querySelector('.subtitle').textContent !== 'Blob Trigger') throw new Error('Blob editor subtitle is not the trigger type.');
                    if (document.querySelector('h1 img')) throw new Error('Blob name was interpreted as HTML.');
                    if (!document.querySelector('#upload').disabled || !document.querySelector('#save').disabled) throw new Error('A new fixture must require file selection.');
                    if (document.querySelector('#encoding') || document.querySelector('#content')) throw new Error('Manual content controls remain visible.');
                    if (document.querySelector('[data-label="targetHint"], [data-label="fileHint"], [data-label="uploadHint"], [data-label="debugHint"]')) throw new Error('Removed helper paragraphs remain visible.');
                    document.querySelector('#load-file').click();
                    await waitFor(() => document.querySelector('#selected-file').textContent === 'fixture.bin');
                    if (document.querySelector('#blob-name').value !== 'fixture.bin') throw new Error('File selection did not default the blob name.');
                    document.querySelector('#load-file').click();
                    await waitFor(() => !document.querySelector('#load-file').disabled);
                    if (document.querySelector('#selected-file').textContent !== 'fixture.bin' || !document.querySelector('#error').hidden) throw new Error('Cancelling replaced the selected file or displayed an error.');
                    document.querySelector('#save').click();
                    await waitFor(() => document.querySelector('#save-status').textContent === 'Saved for this session');
                    document.querySelector('#blob-name').value = 'nested/unsaved.bin';
                    document.querySelector('#blob-name').dispatchEvent(new Event('input', { bubbles: true }));
                    document.querySelector('#upload').click();
                    await waitFor(() => !document.querySelector('#receipt').hidden);
                    if (!document.querySelector('#upload-status').textContent.includes('Function execution not observed')) throw new Error('Receipt claimed function success.');
                `);
                assert.strictEqual(uploads.length, 1);
                assert.strictEqual(uploads[0].path, '/devstoreaccount1/test-fixtures/nested/unsaved.bin');
                assert.deepStrictEqual(uploads[0].bytes, bytes);
                assert.strictEqual(uploads[0].contentType, 'application/octet-stream');
                assert.strictEqual(uploads[0].ifNoneMatch, undefined);
                assert.strictEqual(uploads[0].ifMatch, undefined);
                const saved = provider.getBlobInvocation(blob.id);
                assert.ok(saved);
                assert.strictEqual(saved.request.blobName, 'fixture.bin');
                assert.strictEqual(saved.request.encoding, 'base64');
                assert.strictEqual(saved.request.content, bytes.toString('base64'));
                assert.strictEqual(saved.request.fileName, 'fixture.bin');
                await fs.remove(file.fsPath);
                editor.dispose();
                const reopened = editors.open(saved, true);
                await runEditorScript(reopened, `
                    if (document.querySelector('#blob-name').value !== 'fixture.bin') throw new Error('Unsaved blob name persisted.');
                    if (document.querySelector('#selected-file').textContent !== 'fixture.bin') throw new Error('Saved file selection was not restored.');
                    if (!document.querySelector('#save').disabled) throw new Error('Reopened fixture was marked dirty.');
                `);
                await editors.uploadSaved(await createTestActionContext(), blob.id);
                assert.strictEqual(uploads.length, 2);
                assert.deepStrictEqual(uploads[1].bytes, bytes, 'Saving must capture bytes rather than depend on a live file path.');
                assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection([saved])), [saved]);
            } finally {
                handler.dispose();
                editors.dispose();
                provider.dispose();
                await fs.remove(directory);
            }
        });

        test('overwrites existing and concurrently changed blobs without prompting and never retries failed writes', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const editors = new BlobInvocationEditors(context, provider);
            const blob = fixture();
            const action = await createTestActionContext();
            action.ui.showWarningMessage = async () => { throw new Error('Overwrites must not require another confirmation.'); };
            provider.saveRequest(blob);
            try {
                const original = await editors.uploadSaved(action, blob.id);
                assert.strictEqual(original.functionExecution, 'notObserved');
                assert.strictEqual(uploads[0].bytes.toString(), blob.request.content);
                await editors.uploadSaved(action, blob.id);
                assert.strictEqual(uploads[1].ifMatch, undefined);
                assert.strictEqual(uploads[1].ifNoneMatch, undefined);
                assert.strictEqual(uploads[1].bytes.toString(), blob.request.content);

                changeBeforeWrite = true;
                await editors.uploadSaved(action, blob.id);
                assert.strictEqual(uploads.length, 3);
                assert.strictEqual(blobs.get(uploads[2].path)?.bytes.toString(), blob.request.content);
                assert.ok(!provider.getRequestStatus(blob.id).includes('function succeeded'));

                provider.saveRequest({ ...blob, request: { ...blob.request, blobName: 'concurrent-new.json' } });
                changeBeforeWrite = true;
                await editors.uploadSaved(action, blob.id);
                assert.strictEqual(uploads.length, 4);
                assert.strictEqual(uploads[3].ifNoneMatch, undefined);
                assert.strictEqual(blobs.get(uploads[3].path)?.bytes.toString(), blob.request.content);

                provider.saveRequest({ ...blob, request: { ...blob.request, blobName: 'server-error.bin' } });
                await assert.rejects(() => editors.uploadSaved(action, blob.id), (error: unknown) => {
                    assert.ok(error instanceof Error);
                    assert.match(error.message, /could not be confirmed/);
                    assert.ok(!error.message.includes('private storage diagnostics'));
                    assert.ok(!error.message.includes(storageUrl));
                    return true;
                });
                assert.strictEqual(uploads.length, 5, 'SDK transport failures must not retry a mutation.');
            } finally {
                editors.dispose();
                provider.dispose();
            }
        });


        test('cancellation aborts an in-flight SDK upload and rejects overlapping uploads', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const editors = new BlobInvocationEditors(context, provider);
            const blob = fixture();
            const pending = { ...blob, request: { ...blob.request, blobName: 'pending.bin' } };
            provider.saveRequest(pending);
            const action = await createTestActionContext();
            const abort = new AbortController();
            const observed = new Promise<void>(resolve => { onPendingUpload = resolve; });
            try {
                const running = editors.uploadSaved(action, blob.id, abort.signal);
                await observed;
                assert.strictEqual(provider.getRequestRunStatus(blob.id).status, 'running');
                await assert.rejects(() => editors.uploadSaved(action, blob.id), /already in progress/);
                abort.abort();
                await assert.rejects(running, isUserCancelledError);
                assert.strictEqual(provider.getRequestRunStatus(blob.id).status, 'cancelled');
                assert.strictEqual(uploads.length, 1);
            } finally {
                abort.abort();
                editors.dispose();
                provider.dispose();
            }
        });

        test('rejects non-emulator targets, oversized content, and malformed binary fixtures without network writes', () => {
            const provider = new AzureInvokeTreeDataProvider();
            const blob = fixture();
            try {
                for (const url of ['https://example.com/devstoreaccount1', `${storageUrl}?secret=private`, `${storageUrl}/other`, 'http://user:password@localhost:10000/devstoreaccount1']) {
                    assert.throws(() => provider.saveRequest({ ...blob, request: { ...blob.request, target: { kind: 'azurite', url } } }), /loopback Azurite URL/);
                }
                assert.throws(() => provider.saveRequest({ ...blob, request: { ...blob.request, content: 'x'.repeat(5 * 1024 * 1024 + 1) } }), /at most 5 MB/);
                assert.throws(() => provider.saveRequest({ ...blob, request: { ...blob.request, encoding: 'base64', content: 'invalid!' } }), /valid text or Base64/);
                assert.strictEqual(provider.getInvocations().length, 0);
                assert.strictEqual(uploads.length, 0);
            } finally {
                provider.dispose();
            }
        });
    });

    suite('manual Timer invocations', () => {
        function timerInvocation(functionName = 'CleanupTimer'): TimerInvocation {
            return {
                id: 'cleanup-timer', name: "Timer's </script><img src=x>", group: 'Maintenance', trigger: 'timer',
                request: { hostUrl: baseUrl, functionName, schedule: '0 */5 * * * *' },
            };
        }

        test('saves and invokes a Timer once through the local host without creating a scheduler', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const editors = new TimerInvocationEditors(context, provider);
            const timer = timerInvocation();
            const before = timerRequests.length;
            try {
                await runEditorScript(editors.open(timer, false), `
                    if (document.querySelector('h1 img')) throw new Error('Timer name was interpreted as HTML.');
                    if (document.querySelector('.subtitle').textContent !== 'Timer Trigger') throw new Error('Timer trigger description is missing.');
                    if (document.querySelector('#schedule').textContent !== '0 */5 * * * *' || document.querySelector('input#schedule')) throw new Error('Configured schedule is not read-only reference information.');
                    document.querySelector('#save').click();
                    await waitFor(() => document.querySelector('#save-status').textContent === 'Saved for this session');
                    document.querySelector('#run').click();
                    await waitFor(() => !document.querySelector('#receipt').hidden);
                    if (!document.querySelector('#invocation-status').textContent.includes('function execution not observed')) throw new Error('Host acceptance claimed function success.');
                    if (document.querySelector('main').textContent.includes('private-timer-host-body')) throw new Error('Host body was displayed.');
                `);
                assert.strictEqual(timerRequests.length, before + 1);
                assert.deepStrictEqual(timerRequests.at(-1), {
                    url: '/admin/functions/CleanupTimer', method: 'POST', body: '{"input":""}', contentType: 'application/json',
                });
                assert.deepStrictEqual(provider.getTimerInvocation(timer.id), timer);
                assert.deepStrictEqual(provider.getRequests(), []);
                assert.strictEqual(provider.getTreeItem(timer).description, 'Timer Trigger');
                assert.strictEqual(provider.getTreeItem(timer).contextValue, 'azureInvoke.timer');
                assert.strictEqual(provider.getRequestRunStatus(timer.id).statusCode, 202);
                assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection([timer])), [timer]);
                assert.strictEqual(JSON.parse(serializeInvocationCollection([timer])).version, 4);
                assert.throws(() => parseInvocationCollection(JSON.stringify({ version: 3, invocations: [timer] })), /version 4/);
                const http = invocation();
                assert.throws(() => provider.saveRequest({
                    ...http, request: { ...http.request, dependsOn: [timer.id] },
                }), /prerequisite request is unavailable/);
            } finally {
                editors.dispose();
                provider.dispose();
            }
        });



        test('closing a Timer editor cancels an in-flight invocation and host failures are not retried or exposed', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const editors = new TimerInvocationEditors(context, provider);
            const timer = timerInvocation('SlowTimer');
            const before = timerRequests.length;
            try {
                const editor = editors.open(timer, false);
                const received = new Promise<void>(resolve => server.once('request', () => resolve()));
                const pending = editors.run(await createTestActionContext(), timer);
                const cancelled = assert.rejects(pending, isUserCancelledError);
                await received;
                editor.dispose();
                await cancelled;
                assert.strictEqual(editors.size, 0);
                const failed = timerInvocation('MissingTimer');
                await assert.rejects(editors.run(await createTestActionContext(), failed), (error: unknown) => {
                    assert.ok(error instanceof Error);
                    assert.match(error.message, /HTTP 404/);
                    assert.ok(!error.message.includes('private-timer-host-body'));
                    return true;
                });
                assert.strictEqual(timerRequests.length, before + 2);
            } finally {
                editors.dispose();
                provider.dispose();
            }
        });

        test('Timer targets reject remote hosts, credentials, paths, and malformed function names before sending', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const editors = new TimerInvocationEditors(context, provider);
            const timer = timerInvocation();
            const action = await createTestActionContext();
            const before = receivedRequests;
            try {
                for (const hostUrl of ['https://example.com', `${baseUrl}/api`, `${baseUrl}?code=private`, `${baseUrl}#fragment`, baseUrl.replace('://', '://user:password@')]) {
                    await assert.rejects(editors.run(action, { ...timer, request: { ...timer.request, hostUrl } }), /loopback Functions host/);
                }
                for (const functionName of ['', '../OtherFunction', 'Contains/Slash', 'Contains space']) {
                    await assert.rejects(editors.run(action, { ...timer, request: { ...timer.request, functionName } }), /function name/);
                }
                assert.strictEqual(receivedRequests, before);
            } finally {
                editors.dispose();
                provider.dispose();
            }
        });
    });

    test('manual trigger commands open the matching bundled HTTP, Blob, and Timer editors', async () => {
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
            await vscode.window.tabGroups.close(await waitForInvocationTab());
            await ui.runWithInputs(['Azure Blob Storage trigger'], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.add');
            });
            const findBlobTab = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab =>
                tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('azureInvokeBlob'));
            await waitForTabChange(() => !!findBlobTab());
            const tab = findBlobTab();
            assert.ok(tab);
            await vscode.window.tabGroups.close(tab);
            await ui.runWithInputs(['Timer trigger'], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.add');
            });
            const findTimerTab = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab =>
                tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('azureInvokeTimer'));
            await waitForTabChange(() => !!findTimerTab());
            const timerTab = findTimerTab();
            assert.ok(timerTab);
            await vscode.window.tabGroups.close(timerTab);
        } finally {
            handler.dispose();
        }
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
                'create_http_invocation', 'list_blob_invocations', 'list_http_invocations', 'run_http_invocation', 'upload_blob_invocation',
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

            const blob: BlobInvocation = {
                id: 'bundled-manual-blob', name: 'Bundled Blob fixture', trigger: 'blob',
                request: {
                    target: { kind: 'azurite', url: `${baseUrl}/devstoreaccount1` },
                    container: 'bundled-fixtures', blobName: 'fixture.json', content: '{"private":"not shared"}',
                    encoding: 'utf8', contentType: 'application/json',
                },
            };
            await fs.writeFile(target.fsPath, serializeInvocationCollection([blob]));
            await ui.runWithInputs(['Open Collection'], async () => await vscode.commands.executeCommand('azureFunctions.azureInvoke.openCollection', target));
            const blobList = z.object({ result: z.object({ structuredContent: z.object({
                invocations: z.array(z.object({ id: z.string(), manualOnly: z.literal(true) })),
            }) }) }).parse(await rpc('tools/call', { name: 'list_blob_invocations', arguments: {} }));
            assert.deepStrictEqual(blobList.result.structuredContent.invocations.map(item => item.id), [blob.id]);
            assert.deepStrictEqual(z.object({ result: z.object({ structuredContent: z.object({
                invocations: z.array(z.unknown()),
            }) }) }).parse(await rpc('tools/call', { name: 'list_http_invocations', arguments: {} })).result.structuredContent.invocations, []);
            await vscode.commands.executeCommand('azureFunctions.azureInvoke.open', { id: blob.id });
            const findBlobTab = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab =>
                tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('azureInvokeBlob') && tab.label === blob.name);
            await waitForTabChange(() => !!findBlobTab());
            const blobTab = findBlobTab();
            assert.ok(blobTab);
            await vscode.window.tabGroups.close(blobTab);
            await ui.runWithInputs(['Save Collection', 'Overwrite'], async () => await vscode.commands.executeCommand('azureFunctions.azureInvoke.saveCollection', toolbarTarget));
            assert.deepStrictEqual(parseInvocationCollection(await fs.readFile(toolbarTarget.fsPath, 'utf8')), [blob]);
        } finally {
            vscode.window.showSaveDialog = showSaveDialog;
            handler.dispose();
            mcp.disposable.dispose();
            await fs.remove(directory);
        }
    });
});
