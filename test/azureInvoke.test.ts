/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError, registerOnActionStartHandler, TestUserInput, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs-extra';
import { createServer, type Server } from 'http';
import { type AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { openCollectionFile, saveCollectionFile } from '../src/commands/azureInvoke/collectionFiles';
import { AzureInvokeTreeDataProvider } from '../src/tree/azureInvoke/AzureInvokeTreeDataProvider';
import { parseInvocationCollection, serializeInvocationCollection } from '../src/tree/azureInvoke/invocationCollection';
import { HttpRequestController } from '../src/webviews/azureInvoke/extension/HttpRequestController';
import { HttpRequestEditors } from '../src/webviews/azureInvoke/extension/HttpRequestEditors';
import { sendHttpRequest } from '../src/webviews/azureInvoke/extension/sendHttpRequest';
import { type HttpInvocation, type HttpRequest } from '../src/webviews/azureInvoke/shared/httpRequest';
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
        } finally {
            handler.dispose();
        }
    });

});
