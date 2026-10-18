/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError, registerOnActionStartHandler, TestUserInput, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { McpTool, registerMcpTool } from '@microsoft/vscode-inproc-mcp/mcp';
import { ConsentGuidance } from '@microsoft/vscode-inproc-mcp';
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
import { getBlobInvocationDebugContextTool, listBlobInvocationsTool, uploadBlobInvocationTool } from '../src/chat/tools/azureInvoke/blobInvocationTools';
import { debugHttpInvocationTool, getHttpInvocationDebugContextTool } from '../src/chat/tools/azureInvoke/debugHttpInvocationTools';
import { draftHttpInvocationTool, getInvocationCollectionReviewTool, getInvocationDiagnosticsTool, proposeInvocationCollectionTool, selectBlobInvocationFileTool } from '../src/chat/tools/azureInvoke/collectionReviewTools';
import { listHttpInvocationsTool } from '../src/chat/tools/azureInvoke/listHttpInvocationsTool';
import { runHttpInvocationTool } from '../src/chat/tools/azureInvoke/runHttpInvocationTool';
import { getHttpInvocationInspectionTool, proposeHttpInvocationChangesTool } from '../src/chat/tools/azureInvoke/savedHttpInvocationTools';
import { openCollectionFile, saveCollectionFile } from '../src/commands/azureInvoke/collectionFiles';
import { resolveInvocationDebugSession } from '../src/commands/azureInvoke/resolveInvocationDebugSession';
import { mcpServerId } from '../src/constants';
import { AzureInvokeTreeDataProvider } from '../src/tree/azureInvoke/AzureInvokeTreeDataProvider';
import { parseInvocationCollection, serializeInvocationCollection } from '../src/tree/azureInvoke/invocationCollection';
import { HttpRequestController } from '../src/webviews/azureInvoke/extension/HttpRequestController';
import { HttpRequestEditors } from '../src/webviews/azureInvoke/extension/HttpRequestEditors';
import { BlobInvocationEditors } from '../src/webviews/azureInvoke/extension/BlobInvocationEditors';
import { type BlobInvocation, type BlobUploadState } from '../src/webviews/azureInvoke/shared/blobInvocation';
import { CollectionReviews } from '../src/webviews/azureInvoke/extension/CollectionReviews';
import { CollectionReviewController } from '../src/webviews/azureInvoke/extension/CollectionReviewController';
import { sendHttpRequest } from '../src/webviews/azureInvoke/extension/sendHttpRequest';
import { type HttpInvocation, type HttpRequest } from '../src/webviews/azureInvoke/shared/httpRequest';
import { type BlobInvocationCandidate, type HttpInvocationCandidate, type InvocationCandidate } from '../src/webviews/azureInvoke/shared/collectionReview';
import { formatResponseBody } from '../src/webviews/azureInvoke/views/formatResponseBody';
import { getTestApi } from './utils/testApiAccess';

suite('Azure Invoke', () => {
    let server: Server;
    let baseUrl: string;
    let receivedRequests = 0;
    const accountBodies: string[] = [];
    const debugBodies: string[] = [];
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
                JSON.stringify({ version: 4, invocations: [] }),
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
        const reviews = new CollectionReviews(context, provider);
        try {
            await runEditorScript(editor, `
                document.querySelector('#send').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                if (document.querySelector('#response-body').textContent !== ${JSON.stringify(formattedResponseJson)}) throw new Error('The request editor did not indent JSON while preserving its original values.');
                if (document.querySelector('#response-body img')) throw new Error('The response was interpreted as HTML.');
            `);
            const review = await reviews.open([httpCandidate({ request: invocation.request })]);
            await runEditorScript(review, `
                document.querySelector('.case-toggle').click();
                document.querySelector('.send-preview').click();
                await waitFor(() => !document.querySelector('.preview-response-body').hidden);
                if (document.querySelector('.preview-response-body').textContent !== ${JSON.stringify(formattedResponseJson)}) throw new Error('The collection preview did not indent JSON while preserving its original values.');
                if (document.querySelector('.preview-response-body img')) throw new Error('The preview response was interpreted as HTML.');
            `);
        } finally {
            editor.panel.dispose();
            reviews.dispose();
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
            const inspection = editors.getInspection(slow.id);
            assert.strictEqual(inspection.diagnostic, undefined);
            assert.throws(() => editors.getInspectedInvocation(slow.id, inspection.inspectionId), /Inspect the saved request again/);
            abort.abort();
            await assert.rejects(running, isUserCancelledError);
            assert.strictEqual(provider.getRequestRunStatus(slow.id).status, 'cancelled');
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('agents inspect saved failures and propose fixes that apply only after review without replacing private fields', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const reviews = new CollectionReviews(context, provider);
        let controller: CollectionReviewController | undefined;
        const openChanges = reviews.openChanges.bind(reviews);
        reviews.openChanges = changes => {
            const opened = openChanges(changes);
            controller = opened;
            return opened;
        };
        const source = accountChain()[0];
        const target = {
            id: 'repair-target', name: 'Create holding', group: 'Holdings',
            request: request({
                method: 'POST', url: `${baseUrl}/repairable?embedded=private-repair-query`,
                headers: [{ name: 'x-functions-key', value: 'private-repair-key' }],
                query: [{ name: 'code', value: 'private-repair-code' }],
                body: '{"missing":"private-repair-body"}', dependsOn: [source.id],
            }),
        };
        const unchecked = { id: 'repair-unchecked', name: 'Keep unchanged', request: request() };
        provider.saveRequests([source, target, unchecked]);
        const inspectDefinition = getHttpInvocationInspectionTool(editors);
        const inspect = new McpTool(inspectDefinition.name, inspectDefinition.execute, inspectDefinition);
        const proposeDefinition = proposeHttpInvocationChangesTool(editors, reviews);
        const propose = new McpTool(proposeDefinition.name, proposeDefinition.execute, proposeDefinition);
        const runDefinition = runHttpInvocationTool(provider, editors);
        const run = new McpTool(runDefinition.name, runDefinition.execute, runDefinition);
        const extras = { signal: new AbortController().signal, requestId: 'saved-repair' };
        const inspectionSchema = z.object({ structuredContent: z.object({
            inspectionId: z.string(), status: z.string(), resultMatchesSavedRequest: z.boolean(),
            request: z.object({ query: z.array(z.object({ name: z.string(), inUrl: z.boolean() })) }),
            diagnostic: z.optional(z.object({ status: z.number(), body: z.optional(z.string()) })),
        }) });
        try {
            assert.strictEqual(inspectDefinition.annotations?.consentGuidance, ConsentGuidance.AlwaysRequired);
            assert.strictEqual(runDefinition.annotations?.consentGuidance, ConsentGuidance.AlwaysRequired);
            const editor = editors.open(target, true);
            await runEditorScript(editor, `
                document.querySelector('#run-chain').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                document.querySelector('#body').value = 'private-unsaved-repair-body';
                document.querySelector('#body').dispatchEvent(new Event('input', { bubbles: true }));
            `);
            const evidence = await inspect.executeMcp({ id: target.id }, extras);
            const inspected = inspectionSchema.parse(evidence).structuredContent;
            assert.strictEqual(inspected.status, 'failed');
            assert.strictEqual(inspected.resultMatchesSavedRequest, true);
            assert.strictEqual(inspected.diagnostic?.status, 422);
            assert.strictEqual(inspected.diagnostic?.body, '{"error":"name is required"}');
            assert.deepStrictEqual(inspected.request.query, [{ name: 'embedded', inUrl: true }, { name: 'code', inUrl: false }]);
            for (const value of ['private-repair-query', 'private-repair-key', 'private-repair-code', 'private-repair-body', 'private-repair-cookie', 'private-unsaved-repair-body']) {
                assert.ok(!JSON.stringify(evidence).includes(value));
            }
            const other = inspectionSchema.parse(await inspect.executeMcp({ id: unchecked.id }, extras)).structuredContent;
            const before = receivedRequests;
            const beforeAccounts = accountBodies.length;
            const proposed = await propose.executeMcp({ changes: [
                { id: target.id, inspectionId: inspected.inspectionId, reason: 'The handler requires a name.', request: { body: '{"name":"Synthetic holding"}' } },
                { id: unchecked.id, inspectionId: other.inspectionId, reason: 'Use the requested method.', request: { method: 'HEAD' } },
            ] }, extras);
            const reviewId = z.object({ structuredContent: z.object({ reviewId: z.string() }) }).parse(proposed).structuredContent.reviewId;
            assert.ok(controller);
            assert.deepStrictEqual(provider.getRequest(target.id), target);
            assert.deepStrictEqual(provider.getRequest(unchecked.id), unchecked);
            assert.strictEqual(receivedRequests, before);
            assert.throws(() => reviews.getReview(reviewId));
            for (const value of ['private-repair-query', 'private-repair-key', 'private-repair-code', 'private-repair-body']) {
                assert.ok(!JSON.stringify(proposed).includes(value));
            }
            await runEditorScript(controller, `
                if (document.querySelector('main > h1').textContent !== 'Review saved request changes') throw new Error('The review looks like new collection authoring.');
                if (document.querySelector('.comment-label')) throw new Error('Private saved fields have a feedback-sharing path.');
                if (!document.querySelector('#diagnose-failed').hidden) throw new Error('Saved private fields have a preview-diagnosis path.');
                const row = document.querySelector('[data-id="${target.id}"]');
                row.querySelector('.case-toggle').click();
                if (row.querySelector('.request-preview textarea').value !== '{"name":"Synthetic holding"}') throw new Error('The proposed body is missing.');
                document.querySelector('[data-id="${unchecked.id}"] input[type="checkbox"]').click();
                document.querySelector('#confirm-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Applied'));
            `);
            assert.deepStrictEqual(provider.getRequest(target.id), { ...target, request: { ...target.request, body: '{"name":"Synthetic holding"}' } });
            assert.deepStrictEqual(provider.getRequest(source.id), source);
            assert.deepStrictEqual(provider.getRequest(unchecked.id), unchecked);
            assert.strictEqual(provider.getRequests().length, 3);
            assert.strictEqual(receivedRequests, before);
            const oldResult = editors.getInspection(target.id);
            assert.strictEqual(oldResult.resultMatchesSavedRequest, false);
            assert.strictEqual(oldResult.diagnostic?.outcome, 'response');
            assert.throws(() => reviews.getReview(reviewId));
            assert.throws(() => reviews.getDraftId(reviewId, target.id));
            assert.throws(() => reviews.getDiagnostics(reviewId, 'not-shared'));
            const stale = await propose.executeMcp({ changes: [
                { id: target.id, inspectionId: inspected.inspectionId, reason: 'Old evidence.', request: { method: 'GET' } },
            ] }, extras);
            assert.ok('isError' in stale && stale.isError);
            const result = runResultSchema.parse(await run.executeMcp({ id: target.id, runDependencies: false }, extras));
            assert.strictEqual(result.structuredContent.status, 200);
            assert.strictEqual(result.structuredContent.body, '{"accepted":true}');
            assert.strictEqual(accountBodies.length, beforeAccounts, 'Repair or rerun repeated a mutating prerequisite.');
            assert.strictEqual(provider.getRequestRunStatus(target.id).status, 'succeeded');
        } finally {
            reviews.dispose();
            editors.dispose();
            provider.dispose();
        }
    });

    test('saved request fixes are cancelled safely and reject changed snapshots and expired inspections', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        const reviews = new CollectionReviews(context, provider);
        const saved = { id: 'stale-repair', name: 'Original saved request', request: request({ body: 'private unchanged body' }) };
        provider.saveRequest(saved);
        const before = receivedRequests;
        try {
            const initial = editors.getInspection(saved.id);
            const cancelled = reviews.openChanges([{ invocation: editors.getInspectedInvocation(saved.id, initial.inspectionId), request: { method: 'HEAD' }, reason: 'Inspect headers only.' }]);
            await runEditorScript(cancelled, `
                document.querySelector('#cancel-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.includes('Saved requests are unchanged'));
            `);
            assert.deepStrictEqual(provider.getRequest(saved.id), saved);
            const next = editors.getInspection(saved.id);
            const stale = reviews.openChanges([{ invocation: editors.getInspectedInvocation(saved.id, next.inspectionId), request: { method: 'HEAD' }, reason: 'Inspect headers only.' }]);
            const manual = { ...saved, request: { ...saved.request, body: 'new private manual edit' } };
            provider.saveRequest(manual);
            assert.throws(() => editors.getInspectedInvocation(saved.id, next.inspectionId), /Inspect the saved request again/);
            await runEditorScript(stale, `
                document.querySelector('#confirm-collection').click();
                await waitFor(() => !document.querySelector('#review-error').hidden);
                if (!document.querySelector('#review-error').textContent.includes('Nothing has been applied')) throw new Error('A stale review did not explain why it was blocked.');
            `);
            assert.deepStrictEqual(provider.getRequest(saved.id), manual);
            const invalid = editors.getInspection(saved.id);
            assert.throws(() => reviews.openChanges([{
                invocation: editors.getInspectedInvocation(saved.id, invalid.inspectionId),
                request: { dependsOn: ['missing-source'] }, reason: 'Invalid dependency.',
            }]), /prerequisite/);
            const emptyUrl = { id: 'invalid-saved-url', name: 'Incomplete URL', request: request({ url: '' }) };
            provider.saveRequest(emptyUrl);
            assert.strictEqual(editors.getInspection(emptyUrl.id).request.url, undefined);
            const expired = editors.getInspection(saved.id);
            editors.closeAll();
            assert.throws(() => editors.getInspectedInvocation(saved.id, expired.inspectionId), /Inspect the saved request again/);
            assert.strictEqual(receivedRequests, before);
        } finally {
            reviews.dispose();
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
                    if (!document.querySelector('#debug-response').hidden) throw new Error('Debugging is offered for a request that never ran.');
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

    test('blocked review previews warn without being offered as independent failures to diagnose', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        let diagnosisId: string | undefined;
        const reviews = new CollectionReviews(context, provider, async (_reviewId, _revision, id) => { diagnosisId = id; });
        const source = httpCandidate({ id: 'failed-source', request: request({ url: `${baseUrl}/error` }) });
        const target = httpCandidate({ id: 'blocked-preview', request: request({ dependsOn: [source.id] }) });
        try {
            const controller = await reviews.open([source, target]);
            await runEditorScript(controller, `
                const source = document.querySelector('[data-id="${source.id}"]');
                const target = document.querySelector('[data-id="${target.id}"]');
                target.querySelector('.case-toggle').click();
                target.querySelector('.run-preview-chain').click();
                await waitFor(() => !target.querySelector('.preview-error').hidden);
                if (!target.querySelector('.preview-error').classList.contains('request-warning')) throw new Error('The blocked preview is not a warning.');
                if (!target.querySelector('.diagnose-preview').hidden) throw new Error('The blocked request is offered as an independent failure.');
                document.querySelector('#diagnose-failed').click();
                await waitFor(() => document.querySelector('#diagnosis-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.ok(diagnosisId);
            assert.deepStrictEqual(reviews.getDiagnostics(controller.reviewId, diagnosisId).cases.map(candidate => candidate.id), [source.id]);
        } finally {
            reviews.dispose();
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
            const approvedTarget = reviews.getApproved(reviewId).cases.find(item => item.id === target.id);
            assert.ok(approvedTarget?.trigger === 'http');
            assert.deepStrictEqual(approvedTarget.dependencyIds, [source.id]);
            assert.strictEqual(provider.getRequests().length, 2, 'Confirm did not save the invocations directly.');
            assert.deepStrictEqual(provider.getChildren(), [{ group: 'Accounts' }]);
            assert.strictEqual(provider.getChildren({ group: 'Accounts' }).length, 2);
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
            assert.strictEqual(provider.getRequest(savedTarget)?.group, 'Accounts');
            assert.strictEqual(provider.getRequest(savedSource)?.group, 'Accounts');
            assert.strictEqual(provider.getRequest(savedTarget)?.request.bindings?.[0].sourceId, savedSource);
            const ran = z.object({ result: runResultSchema }).parse(await rpc('tools/call', {
                name: 'run_http_invocation', arguments: { id: savedTarget },
            })).result;
            assert.notStrictEqual(ran.isError, true);
            assert.ok(JSON.parse(ran.structuredContent.body ?? '').id.startsWith('account/'));
            assert.strictEqual(accountBodies[accountBodies.length - 1], '{"name":"kept local"}');
            assert.strictEqual(receivedRequests, before + 4);
            assert.strictEqual(provider.getRequests().length, 2);
            const savedTargetInvocation = provider.getRequest(savedTarget);
            assert.ok(savedTargetInvocation);
            const treeItem = provider.getTreeItem(savedTargetInvocation);
            assert.ok(treeItem.description);
            assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
            assert.strictEqual(treeItem.iconPath.id, 'pass');
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
            assert.deepStrictEqual(provider.getRequests(), []);
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
            assert.deepStrictEqual(provider.getRequests(), [existing]);
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
            assert.deepStrictEqual(provider.getRequests(), [existing]);
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
            assert.strictEqual(provider.getRequests().length, 4);
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
                document.querySelector('#cancel-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Review cancelled.'));
                if (!document.querySelector('#confirm-collection').hidden) throw new Error('Cancelled revision can be confirmed.');
            `);
            rejectPending?.(new Error('Late chat failure after cancellation.'));
            assert.deepStrictEqual(revisions, [1, 2, 3]);
            await assert.rejects(reviews.open([httpCandidate()], controller.reviewId, 3), /no longer active/);
            assert.throws(() => reviews.getReview(controller.reviewId), /Confirm the active collection review/);
            assert.deepStrictEqual(provider.getRequests(), []);
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
            assert.deepStrictEqual(provider.getRequests(), [existing]);
            assert.strictEqual(receivedRequests, before);
            assert.strictEqual(editors.size, 0);
            await runEditorScript(controller, `
                if (document.querySelector('#confirm-collection').disabled) throw new Error('HTTP templates were not preselected.');
                if ([...document.querySelectorAll('.case-details')].some(details => !details.hidden)) throw new Error('Templates start expanded.');
                if (document.querySelectorAll('.case-group').length !== 2) throw new Error('Related requests were not grouped.');
                if (!document.querySelector('[data-case-id="timer"]').disabled) throw new Error('Unsupported trigger is selectable.');
                if (document.querySelector('.case[data-id="create"] .case-status').textContent !== 'HTTP Trigger') throw new Error('HTTP trigger description is missing.');
                if (document.querySelector('.case[data-id="timer"] .case-status').textContent !== 'Timer Trigger / Not yet supported') throw new Error('Unsupported trigger description is missing.');
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
            assert.strictEqual(provider.getRequests().length, 2);
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
            assert.strictEqual(provider.getRequests().length, 2);
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
                await waitFor(() => document.querySelector('.case-status').textContent.startsWith('HTTP Trigger / 200, '));
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
                document.querySelector('#cancel-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Review cancelled.'));
                if (!document.querySelector('#confirm-collection').hidden) throw new Error('A cancelled review can be confirmed.');
            `);
            assert.throws(() => reviews.getApproved(second.reviewId), /Confirm the active collection review/);
            const third = await reviews.open(candidates);
            third.panel.dispose();
            assert.throws(() => reviews.getApproved(third.reviewId), /Confirm the active collection review/);
            await assert.rejects(reviews.open([candidates[0], candidates[0]]), /unique IDs/);
            assert.deepStrictEqual(provider.getRequests(), []);
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
            assert.strictEqual(provider.getRequests().length, 1);
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
            assert.deepStrictEqual(provider.getRequests(), []);
            const cancelled = await reviews.start();
            await runEditorScript(cancelled, `
                document.querySelector('#cancel-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Review cancelled.'));
            `);
            await assert.rejects(reviews.open([httpCandidate()], cancelled.reviewId), /no longer active/);
            assert.deepStrictEqual(provider.getRequests(), []);
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('review discovery failures replace the spinner with an actionable error', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        let cancelled = false;
        const controller = new CollectionReviewController(context, 'loading-failure', undefined, () => [], () => { cancelled = true; }, () => [], async () => { }, async () => { });
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
            assert.deepStrictEqual(provider.getRequests(), []);
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
            assert.strictEqual(provider.getRequests().length, 1, 'Confirm did not save manual fields.');
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
            const saved = provider.getRequests()[0];
            assert.deepStrictEqual(saved.request.query, [{ name: 'page', value: '42', enabled: true }]);
            assert.deepStrictEqual(saved.request.headers, [{ name: 'x-functions-key', value: 'local-preview-secret', enabled: true }]);
            assert.ok(!findInvocationTab(template.name));
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('debugging shares chosen evidence and replays exact captured inputs without rerunning prerequisites', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const actionContext = await createTestActionContext();
        const provider = new AzureInvokeTreeDataProvider();
        const opened: { id: string; debugId: string }[] = [];
        const editors = new HttpRequestEditors(context, provider, {
            resolveSession: async () => ({ id: 'existing-debug-session' }),
            openChat: async (id, debugId) => { opened.push({ id, debugId }); },
        });
        const setup = { id: 'debug-setup', name: 'Create setup', request: request({ method: 'POST', url: `${baseUrl}/accounts`, body: '{}' }) };
        const target = {
            id: 'debug-target', name: 'Inspect request',
            request: request({
                method: 'POST', url: `${baseUrl}/debug-replay?embedded=private-debug-query`,
                query: [{ name: 'code', value: 'private-debug-code' }],
                headers: [{ name: 'x-functions-key', value: 'private-debug-request-key' }],
                body: '{"marker":"{{guid}}"}', dependsOn: [setup.id],
            }),
        };
        provider.saveRequest(setup);
        provider.saveRequest(target);
        const readDefinition = getHttpInvocationDebugContextTool(editors);
        const replayDefinition = debugHttpInvocationTool(editors);
        const read = new McpTool(readDefinition.name, readDefinition.execute, readDefinition);
        const replay = new McpTool(replayDefinition.name, replayDefinition.execute, replayDefinition);
        const extras = { signal: new AbortController().signal, requestId: 'debug-replay' };
        const before = receivedRequests;
        const beforeBodies = debugBodies.length;
        const beforeAccounts = accountBodies.length;
        try {
            assert.strictEqual(replayDefinition.annotations?.consentGuidance, ConsentGuidance.AlwaysRequired);
            const unauthorized = await read.executeMcp({ id: target.id, debugId: 'not-authorized' }, extras);
            assert.ok('isError' in unauthorized && unauthorized.isError);
            const editor = editors.open(target, true);
            await runEditorScript(editor, `
                if (!document.querySelector('#debug-response').hidden) throw new Error('Debugging is offered without a result.');
                document.querySelector('#run-chain').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                if (document.querySelector('#debug-response').hidden) throw new Error('The response has no debug entry point.');
                document.querySelector('#url').value = '${baseUrl}/unsaved-debug-url';
                document.querySelector('#url').dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('#body').value = 'private-unsaved-debug-body';
                document.querySelector('#body').dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-notice').textContent.includes('Opened Copilot Chat'));
                if (!document.querySelector('#debug-hint').textContent.includes('sensitive data')) throw new Error('The response-sharing warning is missing.');
                if (document.querySelector('#body').value !== 'private-unsaved-debug-body' || document.querySelector('#save').disabled) throw new Error('Debugging changed or saved local edits.');
            `);
            assert.strictEqual(opened.length, 1);
            const result = await read.executeMcp(opened[0], extras);
            const evidence = z.object({ structuredContent: z.object({
                method: z.string(), path: z.string(),
                diagnostic: z.object({ outcome: z.string(), status: z.number(), body: z.string() }),
            }) }).parse(result).structuredContent;
            assert.strictEqual(evidence.method, 'POST');
            assert.strictEqual(evidence.path, '/debug-replay');
            assert.strictEqual(evidence.diagnostic.status, 422);
            assert.strictEqual(evidence.diagnostic.body, '{"error":"inspect the handler"}');
            for (const value of ['private-debug-query', 'private-debug-code', 'private-debug-request-key', 'private-debug-cookie', 'private-debug-response-key', 'private-unsaved-debug-body']) {
                assert.ok(!JSON.stringify(result).includes(value));
            }
            assert.strictEqual(receivedRequests, before + 2);
            const abort = new AbortController();
            abort.abort();
            const cancelled = await replay.executeMcp(opened[0], { ...extras, signal: abort.signal });
            assert.ok('isError' in cancelled && cancelled.isError);
            assert.strictEqual(receivedRequests, before + 2);
            const replayed = await replay.executeMcp(opened[0], extras);
            assert.strictEqual(runResultSchema.parse(replayed).structuredContent.status, 422);
            assert.strictEqual(receivedRequests, before + 3);
            assert.strictEqual(accountBodies.length, beforeAccounts + 1, 'Debug replay repeated setup.');
            assert.strictEqual(debugBodies.length, beforeBodies + 2);
            assert.strictEqual(debugBodies[beforeBodies + 1], debugBodies[beforeBodies], 'Debug replay regenerated captured inputs.');
            assert.ok(!debugBodies[beforeBodies].includes('{{guid}}'));
            assert.deepStrictEqual(provider.getRequest(target.id)?.request, target.request);
            const repeated = await replay.executeMcp(opened[0], extras);
            assert.ok('isError' in repeated && repeated.isError);
            assert.strictEqual(receivedRequests, before + 3);
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#debug-response').hidden);
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.strictEqual(opened.length, 2);
            assert.notStrictEqual(opened[0].debugId, opened[1].debugId);
            assert.strictEqual((await editors.getDebugContext(await createTestActionContext(), target.id, opened[1].debugId)).method, 'POST');
            editors.closeAll();
            await assert.rejects(() => editors.getDebugContext(actionContext, target.id, opened[1].debugId), /no longer active/);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('debug replay preserves generated values and bindings despite later saved edits and newer source results', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const actionContext = await createTestActionContext();
        const provider = new AzureInvokeTreeDataProvider();
        const opened: { id: string; debugId: string }[] = [];
        const editors = new HttpRequestEditors(context, provider, {
            resolveSession: async () => ({ id: 'existing-snapshot-debugger' }),
            openChat: async (id, debugId) => { opened.push({ id, debugId }); },
        });
        const source = {
            id: 'snapshot-source', name: 'Create snapshot account',
            request: request({
                method: 'POST', url: `${baseUrl}/accounts`,
                body: '{"email":"invoke-{{guid}}@example.com","token":"token-{{guid}}"}',
            }),
        };
        const target = {
            id: 'snapshot-target', name: 'Use captured account',
            request: request({
                method: 'POST', url: `${baseUrl}/echo/{{accountId}}?embedded={{guid}}`,
                query: [
                    { name: 'token', value: '{{token}}', enabled: true },
                    { name: 'marker', value: '{{guid}}' },
                    { name: 'disabled', value: 'not-sent', enabled: false },
                ],
                headers: [
                    { name: 'Content-Type', value: 'application/json' },
                    { name: 'Authorization', value: 'Bearer {{token}}' },
                    { name: 'x-functions-key', value: 'private-snapshot-key', enabled: true },
                    { name: 'x-disabled', value: 'not-sent', enabled: false },
                ],
                body: '{"marker":"{{guid}}","id":"{{accountId}}","email":"{{email}}"}',
                bindings: [
                    { name: 'accountId', sourceId: source.id, pointer: '/body/id' },
                    { name: 'token', sourceId: source.id, pointer: '/request/body/token' },
                    { name: 'email', sourceId: source.id, pointer: '/request/body/email' },
                ],
                dependsOn: [source.id],
            }),
        };
        provider.saveRequests([source, target]);
        const beforeAccounts = accountBodies.length;
        try {
            const original = JSON.parse((await editors.sendRequest(actionContext, target, undefined, true)).body);
            const originalBody = JSON.parse(original.body);
            const originalSource = JSON.parse(accountBodies[beforeAccounts]);
            assert.ok(!original.body.includes('{{'));
            assert.strictEqual(originalBody.email, originalSource.email);
            assert.strictEqual(original.headers.authorization, `Bearer ${originalSource.token}`);
            assert.strictEqual(new URL(original.url, baseUrl).searchParams.get('marker'), originalBody.marker);
            assert.strictEqual(original.headers['x-disabled'], undefined);
            assert.strictEqual(new URL(original.url, baseUrl).searchParams.has('disabled'), false);

            const newerSource = await editors.sendRequest(actionContext, source);
            assert.notStrictEqual(JSON.parse(newerSource.body).id, originalBody.id);
            provider.saveRequest({ ...target, request: request({ method: 'PUT', url: `${baseUrl}/later-saved`, body: 'later saved body' }) });
            const saved = provider.getRequest(target.id);
            assert.ok(saved);
            const editor = editors.open(saved, true);
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#debug-response').hidden);
                document.querySelector('#body').value = 'unsaved snapshot body';
                document.querySelector('#body').dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-notice').textContent || document.querySelector('#debug-error').textContent);
            `);
            assert.strictEqual(opened.length, 1, 'Later saved edits must not prevent authorizing the last execution.');
            const later = { ...target, request: request({ method: 'DELETE', url: `${baseUrl}/even-later-saved` }) };
            provider.saveRequest(later);
            provider.saveRequest({ ...source, request: request({ url: 'https://example.invalid/{{missing}}' }) });
            const evidence = await editors.getDebugContext(actionContext, target.id, opened[0].debugId);
            assert.strictEqual(evidence.method, 'POST');
            assert.strictEqual(evidence.path, new URL(original.url, baseUrl).pathname);

            const beforeReplay = receivedRequests;
            const replayed = JSON.parse((await editors.debugRequest(actionContext, target.id, opened[0].debugId)).body);
            assert.strictEqual(receivedRequests, beforeReplay + 1, 'Replay must send only the captured request.');
            assert.strictEqual(accountBodies.length, beforeAccounts + 2, 'Replay must not rerun the prerequisite.');
            assert.strictEqual(replayed.method, original.method);
            assert.strictEqual(replayed.url, original.url);
            assert.strictEqual(replayed.body, original.body);
            for (const name of ['content-type', 'authorization', 'x-functions-key', 'x-disabled']) {
                assert.strictEqual(replayed.headers[name], original.headers[name]);
            }
            assert.deepStrictEqual(provider.getRequest(target.id), later);
            await assert.rejects(() => editors.debugRequest(actionContext, target.id, opened[0].debugId), /no longer active/);
            assert.strictEqual(receivedRequests, beforeReplay + 1, 'Expired authorization must not fall back to a normal run.');

            provider.saveRequests([source, target]);
            const beforeNormal = receivedRequests;
            const normal = JSON.parse((await editors.sendRequest(actionContext, target, undefined, true)).body);
            const normalBody = JSON.parse(normal.body);
            assert.strictEqual(receivedRequests, beforeNormal + 2, 'A normal run must still execute its prerequisite.');
            assert.strictEqual(accountBodies.length, beforeAccounts + 3);
            assert.notStrictEqual(normalBody.marker, originalBody.marker, 'A normal run must generate fresh request inputs.');
            assert.notStrictEqual(normalBody.email, originalBody.email, 'A normal run must generate fresh prerequisite inputs.');
            assert.notStrictEqual(normalBody.id, originalBody.id, 'A normal run must bind the new prerequisite result.');
            assert.notStrictEqual(normal.headers.authorization, original.headers.authorization);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('debug replay repeats a successful mutation even when the same generated email now conflicts', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const emails = new Set<string>();
        const bodies: string[] = [];
        const fixture = createServer(async (request, response) => {
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
                chunks.push(Buffer.from(chunk));
            }
            const body = Buffer.concat(chunks).toString();
            bodies.push(body);
            const { email } = JSON.parse(body);
            const exists = emails.has(email);
            emails.add(email);
            response.writeHead(exists ? 409 : 201, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ created: !exists }));
        });
        await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
        const provider = new AzureInvokeTreeDataProvider();
        let debugId: string | undefined;
        const editors = new HttpRequestEditors(context, provider, {
            resolveSession: async () => ({ id: 'existing-registration-debugger' }),
            openChat: async (_id, id) => { debugId = id; },
        });
        const target = {
            id: 'debug-registration', name: 'Register account',
            request: request({
                method: 'POST', url: `http://127.0.0.1:${(fixture.address() as AddressInfo).port}/register`,
                body: '{"email":"invoke-{{guid}}@example.com"}',
            }),
        };
        provider.saveRequest(target);
        try {
            const actionContext = await createTestActionContext();
            assert.strictEqual((await editors.sendRequest(actionContext, target)).status, 201);
            const editor = editors.open(target, true);
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#debug-response').hidden);
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.ok(debugId);
            assert.strictEqual((await editors.debugRequest(actionContext, target.id, debugId)).status, 409);
            assert.strictEqual(bodies.length, 2);
            assert.strictEqual(bodies[1], bodies[0], 'Replay must not regenerate the email to avoid a conflict.');
            assert.strictEqual((await editors.sendRequest(actionContext, target)).status, 201);
            assert.strictEqual(bodies.length, 3);
            assert.notStrictEqual(bodies[2], bodies[0]);
        } finally {
            editors.dispose();
            provider.dispose();
            fixture.closeAllConnections();
            await new Promise<void>((resolve, reject) => fixture.close(error => error ? reject(error) : resolve()));
        }
    });

    test('debug replay results cannot supply stale bindings to dependent requests', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const actionContext = await createTestActionContext();
        const provider = new AzureInvokeTreeDataProvider();
        let debugId: string | undefined;
        const editors = new HttpRequestEditors(context, provider, {
            resolveSession: async () => ({ id: 'existing-dependency-debugger' }),
            openChat: async (_id, id) => { debugId = id; },
        });
        const [source, target] = accountChain();
        const dependent = {
            id: 'after-debug', name: 'Use current account',
            request: request({
                method: 'POST', body: '{"id":"{{accountId}}"}',
                bindings: [{ name: 'accountId', sourceId: target.id, pointer: '/body/id' }],
            }),
        };
        provider.saveRequests([source, target, dependent]);
        try {
            const original = await editors.sendRequest(actionContext, target, undefined, true);
            const editor = editors.open(target, true);
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#debug-response').hidden);
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.ok(debugId);
            const replayed = await editors.debugRequest(actionContext, target.id, debugId);
            assert.strictEqual(replayed.body, original.body);
            const latestSource = await editors.sendRequest(actionContext, source);
            const before = receivedRequests;
            await assert.rejects(() => editors.sendRequest(actionContext, dependent), /current successful result/);
            assert.strictEqual(receivedRequests, before);
            await editors.sendRequest(actionContext, target);
            const result = await editors.sendRequest(actionContext, dependent);
            assert.strictEqual(JSON.parse(JSON.parse(result.body).body).id, JSON.parse(latestSource.body).id);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('debugging requires an existing session and keeps chat failures retryable without changing the request', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const actionContext = await createTestActionContext();
        assert.strictEqual(vscode.debug.activeDebugSession, undefined);
        await assert.rejects(async () => await resolveInvocationDebugSession(await createTestActionContext()), /Start your local application/);
        const provider = new AzureInvokeTreeDataProvider();
        let sessionId: string | undefined;
        let failChat = true;
        const opened: { id: string; debugId: string }[] = [];
        const editors = new HttpRequestEditors(context, provider, {
            resolveSession: actionContext => sessionId ? Promise.resolve({ id: sessionId }) : resolveInvocationDebugSession(actionContext),
            openChat: async (id, debugId) => {
                opened.push({ id, debugId });
                if (failChat) {
                    throw new Error('Copilot Chat is unavailable.');
                }
            },
        });
        const target = { id: 'debug-guards', name: 'Inspect failure', request: request({ url: `${baseUrl}/error`, body: 'Unused body for a future POST' }) };
        provider.saveRequest(target);
        const editor = editors.open(target, true);
        const before = receivedRequests;
        try {
            await runEditorScript(editor, `
                document.querySelector('#send').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-error').textContent.includes('Start your local application'));
                if (document.querySelector('#debug-response').disabled || document.querySelector('#response-body').hidden) throw new Error('A missing debugger blocked response inspection.');
            `);
            assert.strictEqual(opened.length, 0);
            sessionId = 'debug-session-one';
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#debug-response').hidden);
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-error').textContent.includes('unavailable'));
                if (document.querySelector('#debug-response').disabled) throw new Error('Chat failure left debugging disabled.');
            `);
            assert.strictEqual(opened.length, 1);
            await assert.rejects(() => editors.getDebugContext(actionContext, target.id, opened[0].debugId), /no longer active/);
            failChat = false;
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#debug-response').hidden);
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.strictEqual(opened.length, 2);
            await editors.getDebugContext(actionContext, target.id, opened[1].debugId);
            sessionId = 'debug-session-two';
            await assert.rejects(() => editors.debugRequest(actionContext, target.id, opened[1].debugId), /active debugger changed/);
            sessionId = 'debug-session-one';
            await assert.rejects(() => editors.getDebugContext(actionContext, target.id, opened[1].debugId), /no longer active/);
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#debug-response').hidden);
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.strictEqual(opened.length, 3);
            provider.saveRequest({ ...target, request: request({ url: `${baseUrl}/echo` }) });
            await editors.getDebugContext(actionContext, target.id, opened[2].debugId);
            await editors.sendRequest(actionContext, target);
            await assert.rejects(() => editors.getDebugContext(actionContext, target.id, opened[2].debugId), /last execution.*changed/);
            provider.saveRequest(target);
            await assert.rejects(() => editors.getDebugContext(actionContext, target.id, opened[2].debugId), /no longer active/);
            assert.strictEqual(receivedRequests, before + 2);
            assert.deepStrictEqual(provider.getRequest(target.id)?.request, target.request);
        } finally {
            editors.dispose();
            provider.dispose();
        }
    });

    test('debug replay disables only its HTTP timeout and remains cancellable from the response editor', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const actionContext = await createTestActionContext();
        const settings = vscode.workspace.getConfiguration('azureFunctions');
        const originalTimeout = settings.inspect<number>('requestTimeout')?.workspaceValue;
        const provider = new AzureInvokeTreeDataProvider();
        let debugId: string | undefined;
        const editors = new HttpRequestEditors(context, provider, {
            resolveSession: async () => ({ id: 'existing-timeout-debugger' }),
            openChat: async (_id, id) => { debugId = id; },
        });
        const target = { id: 'debug-timeout', name: 'Inspect pending response', request: request({ url: `${baseUrl}/slow` }) };
        provider.saveRequest(target);
        let pending: Promise<unknown> | undefined;
        try {
            await settings.update('requestTimeout', 1, vscode.ConfigurationTarget.Workspace);
            assert.strictEqual(vscode.workspace.getConfiguration('azureFunctions').get('requestTimeout'), 1);
            await assert.rejects(() => editors.sendRequest(actionContext, target), /timed out/);
            const editor = editors.open(target, true);
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#debug-response').hidden);
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.ok(debugId);
            let settled = false;
            pending = editors.debugRequest(actionContext, target.id, debugId);
            void pending.then(() => { settled = true; }, () => { settled = true; });
            await new Promise<void>(resolve => setTimeout(resolve, 1200));
            assert.strictEqual(settled, false, 'Debug replay used the ordinary one-second request timeout.');
            await runEditorScript(editor, `
                await waitFor(() => !document.querySelector('#abort').hidden);
                document.querySelector('#abort').click();
                await waitFor(() => document.querySelector('#error').textContent === 'Request cancelled.');
                if (!document.querySelector('#debug-response').hidden) throw new Error('A cancelled replay still offers debugging.');
            `);
            await assert.rejects(pending, error => isUserCancelledError(error));
        } finally {
            editors.dispose();
            provider.dispose();
            await settings.update('requestTimeout', originalTimeout, vscode.ConfigurationTarget.Workspace);
            await pending?.catch(error => {
                assert.ok(isUserCancelledError(error));
            });
        }
    });

    test('debugging refuses a non-local response before opening Copilot Chat', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const address = Object.values(os.networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal);
        assert.ok(address);
        const fixture = createServer((_request, response) => {
            response.writeHead(500);
            response.end('private non-local response');
        });
        await new Promise<void>(resolve => fixture.listen(0, address.address, resolve));
        const provider = new AzureInvokeTreeDataProvider();
        let chatCalls = 0;
        const editors = new HttpRequestEditors(context, provider, {
            resolveSession: async () => ({ id: 'existing-local-debugger' }),
            openChat: async () => { chatCalls++; },
        });
        const target = { id: 'non-local-debug', name: 'Remote response', request: request({ url: `http://${address.address}:${(fixture.address() as AddressInfo).port}/error` }) };
        provider.saveRequest(target);
        try {
            const editor = editors.open(target, true);
            await runEditorScript(editor, `
                document.querySelector('#send').click();
                await waitFor(() => !document.querySelector('#response-body').hidden);
                document.querySelector('#debug-response').click();
                await waitFor(() => document.querySelector('#debug-error').textContent.includes('only localhost'));
                if (document.querySelector('#response-body').textContent !== 'private non-local response') throw new Error('The local response display changed.');
            `);
            assert.strictEqual(chatCalls, 0);
        } finally {
            editors.dispose();
            provider.dispose();
            fixture.closeAllConnections();
            await new Promise<void>((resolve, reject) => fixture.close(error => error ? reject(error) : resolve()));
        }
    });

    test('failed preview diagnosis shares only chosen evidence through MCP without changing or running drafts', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const diagnoses: { reviewId: string; diagnosisId: string }[] = [];
        const reviews = new CollectionReviews(context, provider, async (reviewId, revision, diagnosisId) => {
            assert.strictEqual(revision, undefined);
            assert.ok(diagnosisId);
            diagnoses.push({ reviewId, diagnosisId });
        });
        const definition = getInvocationDiagnosticsTool(reviews);
        const mcp = await startInProcHttpServer({
            id: mcpServerId, serverLabel: 'Preview diagnosis test', serverVersion: '1.0.0', transport: 'tcp',
            registerTools: server => { registerMcpTool(server, definition); },
        });
        const rpc = createMcpClient(mcp);
        const template = httpCandidate({
            request: request({
                method: 'POST', url: `${baseUrl}/diagnosis-error`, body: '{}',
                headers: [{ name: 'x-functions-key', value: '', enabled: false }],
            }),
        });
        const before = receivedRequests;
        try {
            await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'diagnosis-test', version: '1.0.0' } });
            await rpc('notifications/initialized', {}, true);
            const controller = await reviews.open([template, httpCandidate({ id: 'healthy' })]);
            const premature = await rpc('tools/call', { name: definition.name, arguments: { reviewId: controller.reviewId, diagnosisId: 'unapproved' } });
            assert.strictEqual(z.object({ result: z.object({ isError: z.boolean() }) }).parse(premature).result.isError, true);
            await runEditorScript(controller, `
                if (!document.querySelector('#diagnose-failed').hidden) throw new Error('Diagnosis is available before a failure.');
                const failed = document.querySelector('[data-id="http"]');
                failed.querySelector('.case-toggle').click();
                const privateHeader = failed.querySelectorAll('.preview-entries')[1].querySelectorAll('input')[1];
                privateHeader.value = 'local-private-diagnosis-value';
                privateHeader.dispatchEvent(new Event('input', { bubbles: true }));
                failed.querySelector('textarea[data-comment-id]').value = 'Keep my local fields.';
                failed.querySelector('textarea[data-comment-id]').dispatchEvent(new Event('input', { bubbles: true }));
                failed.querySelector('.send-preview').click();
                await waitFor(() => !failed.querySelector('.preview-response-body').hidden);
                if (failed.querySelector('.diagnose-preview').hidden) throw new Error('Failed preview has no diagnosis action.');
                const healthy = document.querySelector('[data-id="healthy"]');
                healthy.querySelector('.case-toggle').click();
                healthy.querySelector('.send-preview').click();
                await waitFor(() => !healthy.querySelector('.preview-response-body').hidden);
                if (!healthy.querySelector('.diagnose-preview').hidden) throw new Error('Successful preview has a failure action.');
                if (!document.querySelector('.diagnosis-hint').textContent.includes('sensitive data')) throw new Error('Sharing notice is missing.');
                failed.querySelector('.diagnose-preview').click();
                await waitFor(() => document.querySelector('#diagnosis-notice').textContent.includes('Opened Copilot Chat'));
                if (privateHeader.value !== 'local-private-diagnosis-value' || privateHeader.disabled) throw new Error('Diagnosis changed or locked local edits.');
                if (failed.querySelector('textarea[data-comment-id]').value !== 'Keep my local fields.') throw new Error('Diagnosis changed feedback.');
                if (document.querySelector('#confirm-collection').textContent !== 'Request changes') throw new Error('Diagnosis submitted or cleared feedback.');
            `);
            assert.strictEqual(diagnoses.length, 1);
            const result = await rpc('tools/call', { name: definition.name, arguments: diagnoses[0] });
            const cases = z.object({
                result: z.object({ structuredContent: z.object({ cases: z.array(z.object({
                    id: z.string(), request: z.unknown(), reviewedFields: z.array(z.string()),
                    diagnostic: z.object({ outcome: z.string(), status: z.number(), body: z.string(), headers: z.array(z.object({ name: z.string(), value: z.string() })) }),
                })) }) }),
            }).parse(result).result.structuredContent.cases;
            assert.strictEqual(cases.length, 1);
            assert.strictEqual(cases[0].id, template.id);
            assert.deepStrictEqual(cases[0].request, template.request);
            assert.deepStrictEqual(cases[0].reviewedFields, ['headers']);
            assert.strictEqual(cases[0].diagnostic.status, 422);
            assert.strictEqual(cases[0].diagnostic.body, '{"error":"name is required"}');
            assert.ok(cases[0].diagnostic.headers.some(header => header.name === 'content-type'));
            for (const privateValue of ['local-private-diagnosis-value', 'private-diagnosis-cookie', 'private-diagnosis-key', 'private-diagnosis-header']) {
                assert.ok(!JSON.stringify(result).includes(privateValue));
            }
            assert.throws(() => reviews.getReview(controller.reviewId), /Confirm the active collection review/);
            assert.deepStrictEqual(provider.getRequests(), []);
            assert.strictEqual(receivedRequests, before + 2, 'Diagnosis sent an additional HTTP request.');
        } finally {
            mcp.disposable.dispose();
            reviews.dispose();
            provider.dispose();
        }
    });

    test('collection diagnosis includes failures but not successful or cancelled previews and expires on rerun', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        let diagnosisId: string | undefined;
        const reviews = new CollectionReviews(context, provider, async (_reviewId, _revision, id) => { diagnosisId = id; });
        const templates = [
            httpCandidate({ id: 'failed', request: request({ url: `${baseUrl}/error` }) }),
            httpCandidate({ id: 'transport', request: request({ url: `${baseUrl}/drop` }) }),
            httpCandidate({ id: 'cancelled', request: request({ url: `${baseUrl}/slow` }) }),
        ];
        const before = receivedRequests;
        try {
            const controller = await reviews.open(templates);
            await runEditorScript(controller, `
                for (const id of ['failed', 'transport']) {
                    const row = document.querySelector('[data-id="' + id + '"]');
                    row.querySelector('.case-toggle').click();
                    row.querySelector('.send-preview').click();
                    await waitFor(() => !row.querySelector('.preview-response-body').hidden || !row.querySelector('.preview-error').hidden);
                }
                const cancelled = document.querySelector('[data-id="cancelled"]');
                cancelled.querySelector('.case-toggle').click();
                cancelled.querySelector('.send-preview').click();
                await waitFor(() => !cancelled.querySelector('.cancel-preview').hidden);
                if (!document.querySelector('#diagnose-failed').disabled) throw new Error('Diagnosis is enabled during execution.');
                cancelled.querySelector('.cancel-preview').click();
                await waitFor(() => cancelled.querySelector('.preview-error').textContent === 'Request cancelled.');
                if (!cancelled.querySelector('.diagnose-preview').hidden) throw new Error('Cancellation is treated as a failure.');
                document.querySelector('#diagnose-failed').click();
                await waitFor(() => document.querySelector('#diagnosis-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.ok(diagnosisId);
            const cases = reviews.getDiagnostics(controller.reviewId, diagnosisId).cases;
            assert.deepStrictEqual(cases.map(item => item.id), ['failed', 'transport']);
            assert.strictEqual(cases[0].diagnostic.outcome, 'response');
            assert.strictEqual(cases[1].diagnostic.outcome, 'requestError');
            const sentAfterPreviews = receivedRequests;
            assert.ok(sentAfterPreviews >= before + 2 && sentAfterPreviews <= before + 3);
            await runEditorScript(controller, `
                const failed = document.querySelector('[data-id="failed"]');
                failed.querySelector('.case-toggle').click();
                const url = failed.querySelector('input[type="url"]');
                url.value = '${baseUrl}/echo';
                url.dispatchEvent(new Event('input', { bubbles: true }));
                if (!failed.querySelector('.diagnose-preview').hidden) throw new Error('Changed request still offers diagnosis for an old result.');
                failed.querySelector('.send-preview').click();
                await waitFor(() => !failed.querySelector('.preview-response-body').hidden && JSON.parse(failed.querySelector('.preview-response-body').textContent).url === '/echo');
            `);
            assert.throws(() => reviews.getDiagnostics(controller.reviewId, diagnosisId ?? ''), /no longer active/);
            assert.strictEqual(receivedRequests, sentAfterPreviews + 1);
            assert.deepStrictEqual(provider.getRequests(), []);
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('diagnosis failures keep drafts editable and reject stale or forged failure selections', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        let diagnosisId: string | undefined;
        let chatCalls = 0;
        const reviews = new CollectionReviews(context, provider, async (_reviewId, _revision, id) => {
            diagnosisId = id;
            chatCalls++;
            if (chatCalls === 1) {
                throw new Error('Copilot Chat is unavailable.');
            }
        });
        const template = httpCandidate({ request: request({ url: `${baseUrl}/error` }) });
        try {
            const controller = await reviews.open([template]);
            await runEditorScript(controller, `
                document.querySelector('.case-toggle').click();
                document.querySelector('.send-preview').click();
                await waitFor(() => !document.querySelector('.preview-response-body').hidden);
                document.querySelector('.diagnose-preview').click();
                await waitFor(() => !document.querySelector('#review-error').hidden);
                if (!document.querySelector('#review-error').textContent.includes('unavailable')) throw new Error('Chat failure is not actionable.');
                if (document.querySelector('input[type="url"]').disabled || document.querySelector('#confirm-collection').disabled) throw new Error('Chat failure left the review locked.');
            `);
            assert.ok(diagnosisId);
            assert.throws(() => reviews.getDiagnostics(controller.reviewId, diagnosisId ?? ''), /no longer active/);
            await runEditorScript(controller, `
                window.testApi.postMessage({
                    command: 'diagnoseRequests', ids: ['http'],
                    requests: [{ id: 'http', request: ${JSON.stringify(request({ url: `${baseUrl}/echo` }))} }],
                });
                await waitFor(() => document.querySelector('#review-error').textContent.includes('changed after its preview'));
            `);
            assert.strictEqual(chatCalls, 1);
            await runEditorScript(controller, `
                window.testApi.postMessage({ command: 'diagnoseRequests', ids: ['unknown'], requests: [] });
                await waitFor(() => document.querySelector('#review-error').textContent.includes('failed HTTP previews'));
                document.querySelector('.case-toggle').click();
                document.querySelector('.diagnose-preview').click();
                await waitFor(() => document.querySelector('#diagnosis-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.strictEqual(chatCalls, 2);
            assert.ok(diagnosisId);
            assert.strictEqual(reviews.getDiagnostics(controller.reviewId, diagnosisId).cases.length, 1);
            await runEditorScript(controller, `
                document.querySelector('#confirm-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Confirmed.'));
                if (!document.querySelector('#diagnose-failed').hidden) throw new Error('Confirmed review still offers diagnosis.');
            `);
            assert.throws(() => reviews.getDiagnostics(controller.reviewId, diagnosisId ?? ''), /no longer active/);
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('diagnosis rejects changed prerequisites, handles configuration errors, and expires with review changes', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        let diagnosisId: string | undefined;
        let diagnoses = 0;
        const reviews = new CollectionReviews(context, provider, async (_reviewId, _revision, id) => {
            if (id) {
                diagnosisId = id;
                diagnoses++;
            }
        });
        const templates = [
            httpCandidate({ id: 'source' }),
            httpCandidate({ id: 'failed', request: request({ url: `${baseUrl}/error`, dependsOn: ['source'] }) }),
        ];
        try {
            const controller = await reviews.open(templates);
            await runEditorScript(controller, `
                const failed = document.querySelector('[data-id="failed"]');
                failed.querySelector('.case-toggle').click();
                failed.querySelector('.run-preview-chain').click();
                await waitFor(() => !failed.querySelector('.preview-response-body').hidden);
                const source = document.querySelector('[data-id="source"]');
                source.querySelector('.case-toggle').click();
                source.querySelector('input[type="url"]').value = '${baseUrl}/echo?edited=true';
                source.querySelector('input[type="url"]').dispatchEvent(new Event('input', { bubbles: true }));
                failed.querySelector('.diagnose-preview').click();
                await waitFor(() => document.querySelector('#review-error').textContent.includes('changed after its preview'));
                failed.querySelector('.run-preview-chain').click();
                await waitFor(() => !failed.querySelector('.preview-response-body').hidden);
                failed.querySelector('.diagnose-preview').click();
                await waitFor(() => document.querySelector('#diagnosis-notice').textContent.includes('Opened Copilot Chat'));
                failed.querySelector('textarea[data-comment-id]').value = 'Review the generated request.';
                failed.querySelector('textarea[data-comment-id]').dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('#confirm-collection').click();
                await waitFor(() => document.querySelector('#review-loading h1').textContent === 'Updating your collection');
            `);
            assert.strictEqual(diagnoses, 1);
            assert.ok(diagnosisId);
            assert.throws(() => reviews.getDiagnostics(controller.reviewId, diagnosisId ?? ''), /no longer active/);
            await reviews.open(templates, controller.reviewId, reviews.getReview(controller.reviewId).revision);
            const before = receivedRequests;
            await runEditorScript(controller, `
                const failed = document.querySelector('[data-id="failed"]');
                failed.querySelector('.case-toggle').click();
                failed.querySelector('input[type="url"]').value = '${baseUrl}/api/:id';
                failed.querySelector('input[type="url"]').dispatchEvent(new Event('input', { bubbles: true }));
                if (failed.querySelector('.send-preview').disabled) throw new Error('Configuration preview is disabled.');
                if (!failed.querySelector('form').checkValidity()) throw new Error('Configuration preview form is invalid.');
                if (failed.querySelector('.case-details').hidden) throw new Error('Configuration preview details are collapsed.');
                failed.querySelector('.send-preview').click();
                await waitFor(() => !failed.querySelector('.preview-error').hidden || !failed.querySelector('.preview-response-body').hidden);
                if (!failed.querySelector('.preview-error').textContent.includes('route placeholders')) throw new Error('Expected an unresolved-route configuration failure.');
                failed.querySelector('.diagnose-preview').click();
                await waitFor(() => document.querySelector('#diagnosis-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.strictEqual(diagnoses, 2);
            assert.ok(diagnosisId);
            const cases = reviews.getDiagnostics(controller.reviewId, diagnosisId).cases;
            assert.strictEqual(cases[0].diagnostic.outcome, 'requestError');
            assert.deepStrictEqual(cases[0].reviewedFields, ['url']);
            assert.strictEqual(receivedRequests, before, 'Configuration diagnosis sent an HTTP request.');
            await runEditorScript(controller, `
                document.querySelector('#cancel-collection').click();
                await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Review cancelled.'));
            `);
            assert.throws(() => reviews.getDiagnostics(controller.reviewId, diagnosisId ?? ''), /no longer active/);
            await reviews.open([httpCandidate()]);
            assert.throws(() => reviews.getDiagnostics(controller.reviewId, diagnosisId ?? ''), /no longer active/);
        } finally {
            reviews.dispose();
            provider.dispose();
        }
    });

    test('diagnosis bounds shared response evidence and withholds bodies for non-local chains', async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        const provider = new AzureInvokeTreeDataProvider();
        const editors = new HttpRequestEditors(context, provider);
        let diagnosisId: string | undefined;
        const reviews = new CollectionReviews(context, provider, async (_reviewId, _revision, id) => { diagnosisId = id; });
        const address = Object.values(os.networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal);
        assert.ok(address, 'A local network interface is required to exercise non-loopback response sharing.');
        const nonLocalServer = createServer((request, response) => {
            response.writeHead(request.url === '/error' ? 503 : 200, { 'content-type': 'application/json' });
            response.end('{"error":"local fixture on a non-loopback interface"}');
        });
        await new Promise<void>(resolve => nonLocalServer.listen(0, address.address, resolve));
        const nonLocalBase = `http://${address.address}:${(nonLocalServer.address() as AddressInfo).port}`;
        const templates = [
            ...Array.from({ length: 10 }, (_, index) => httpCandidate({ id: `large-${index}`, request: request({ url: `${baseUrl}/large-error` }) })),
            httpCandidate({ id: 'remote', request: request({ url: `${nonLocalBase}/error` }) }),
            httpCandidate({ id: 'source', request: request({ url: `${nonLocalBase}/echo` }) }),
            httpCandidate({ id: 'dependent', request: request({ url: `${baseUrl}/error`, dependsOn: ['source'] }) }),
        ];
        try {
            provider.saveRequests(templates);
            const inspectionDefinition = getHttpInvocationInspectionTool(editors);
            const inspectionTool = new McpTool(inspectionDefinition.name, inspectionDefinition.execute, inspectionDefinition);
            for (const id of ['large-0', 'remote', 'dependent']) {
                const invocation = provider.getRequest(id);
                assert.ok(invocation);
                await editors.sendRequest(await createTestActionContext(), invocation, undefined, id === 'dependent');
                const result = z.object({ structuredContent: z.object({
                    diagnostic: z.object({ body: z.optional(z.string()), bodyTruncated: z.optional(z.boolean()), headers: z.optional(z.array(z.object({ name: z.string() }))) }),
                }) }).parse(await inspectionTool.executeMcp({ id }, { signal: new AbortController().signal, requestId: 'saved-inspection-privacy' }));
                const diagnostic = result.structuredContent.diagnostic;
                if (id === 'large-0') {
                    assert.strictEqual(Buffer.byteLength(diagnostic.body ?? ''), 64 * 1024);
                    assert.strictEqual(diagnostic.bodyTruncated, true);
                    assert.ok(!diagnostic.body?.includes('\ufffd'));
                } else {
                    assert.strictEqual(diagnostic.body, undefined);
                    assert.strictEqual(diagnostic.headers, undefined);
                }
            }
            const controller = await reviews.open(templates);
            await runEditorScript(controller, `
                for (const id of ${JSON.stringify(templates.filter(item => item.id !== 'source').map(item => item.id))}) {
                    const row = document.querySelector('[data-id="' + id + '"]');
                    row.querySelector('.case-toggle').click();
                    row.querySelector(id === 'dependent' ? '.run-preview-chain' : '.send-preview').click();
                    await waitFor(() => !row.querySelector('.preview-response-body').hidden || !row.querySelector('.preview-error').hidden);
                    if (!row.querySelector('.preview-error').hidden) throw new Error(id + ': ' + row.querySelector('.preview-error').textContent);
                }
                document.querySelector('#diagnose-failed').click();
                await waitFor(() => document.querySelector('#diagnosis-notice').textContent.includes('Opened Copilot Chat'));
            `);
            assert.ok(diagnosisId);
            const cases = reviews.getDiagnostics(controller.reviewId, diagnosisId).cases;
            let totalBodyBytes = 0;
            for (const item of cases) {
                assert.strictEqual(item.diagnostic.outcome, 'response');
                if (item.diagnostic.outcome !== 'response') {
                    assert.fail('Expected a completed HTTP response.');
                }
                if (item.id.startsWith('large-')) {
                    const size = Buffer.byteLength(item.diagnostic.body ?? '');
                    assert.ok(size <= 64 * 1024);
                    totalBodyBytes += size;
                    assert.strictEqual(item.diagnostic.bodyTruncated, true);
                    assert.ok(!item.diagnostic.body?.includes('\ufffd'));
                } else {
                    assert.strictEqual(item.diagnostic.status, 503);
                    assert.strictEqual(item.diagnostic.body, undefined);
                    assert.strictEqual(item.diagnostic.headers, undefined);
                }
            }
            assert.strictEqual(cases.length, 12);
            assert.strictEqual(totalBodyBytes, 512 * 1024);
            controller.panel.dispose();
            assert.throws(() => reviews.getDiagnostics(controller.reviewId, diagnosisId ?? ''), /no longer active/);
        } finally {
            nonLocalServer.closeAllConnections();
            await new Promise<void>((resolve, reject) => nonLocalServer.close(error => error ? reject(error) : resolve()));
            reviews.dispose();
            editors.dispose();
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
            assert.deepStrictEqual(provider.getRequests(), []);
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
        assert.match(content, /\n  - edit\n/, 'The Azure Invoke agent must support workspace edits alongside invocation testing.');
        for (const name of ['propose_invocation_collection', 'select_blob_invocation_file', 'get_invocation_collection_review', 'get_invocation_diagnostics', 'get_http_invocation_debug_context', 'debug_http_invocation', 'list_http_invocations', 'get_http_invocation_inspection', 'propose_http_invocation_changes', 'run_http_invocation', 'list_blob_invocations', 'get_blob_invocation_debug_context', 'upload_blob_invocation']) {
            assert.ok(content.includes(`  - Azure Functions Extension Tools/${name}`));
        }
        assert.ok(!content.includes('  - Azure Functions Extension Tools/create_http_invocation'));
        assert.ok(!content.includes('  - Azure Functions Extension Tools/draft_http_invocation'));
        for (const name of ['add_breakpoint', 'list_breakpoints', 'get_debug_status']) {
            assert.ok(content.includes(`  - debugmcp/${name}`));
        }
        for (const name of ['start_debugging', 'stop_debugging', 'continue_execution', 'evaluate_expression', 'get_variables_values']) {
            assert.ok(!content.includes(`  - debugmcp/${name}`));
        }
    });

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

        function blobCandidate(): BlobInvocationCandidate {
            return {
                id: 'blob-import', name: 'Import inventory', group: 'Inventory', trigger: 'blob',
                description: 'Source binding inventory-imports/{name}; manual upload only.',
                request: {
                    target: { kind: 'azurite', url: storageUrl },
                    container: 'inventory-imports', blobName: '', contentType: 'text/csv',
                },
            };
        }

        test('authors mixed collections through MCP with private file capture and revision-safe metadata edits', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const reviews = new CollectionReviews(context, provider, async () => { });
            let controller: CollectionReviewController | undefined;
            const open = reviews.open.bind(reviews);
            reviews.open = async (candidates, id, revision) => controller = await open(candidates, id, revision);
            const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-blob-author-'));
            const file = vscode.Uri.file(path.join(directory, 'user-private-fixture.bin'));
            const bytes = Buffer.from('private-authoring-fixture\0\xff', 'utf8');
            await fs.writeFile(file.fsPath, bytes);
            let picks = 0;
            let cancelPicker = false;
            const handler = registerOnActionStartHandler(action => {
                if (action.callbackId === 'azureFunctions.azureInvoke.selectBlobFile') {
                    action.ui.showOpenDialog = async () => {
                        picks++;
                        if (cancelPicker) {
                            throw new UserCancelledError();
                        }
                        return [file];
                    };
                }
            });
            const mcp = await startInProcHttpServer({
                id: mcpServerId, serverLabel: 'Blob authoring test', serverVersion: '1.0.0', transport: 'tcp',
                registerTools: server => {
                    registerMcpTool(server, proposeInvocationCollectionTool(reviews));
                    registerMcpTool(server, selectBlobInvocationFileTool(reviews));
                    registerMcpTool(server, getInvocationCollectionReviewTool(reviews));
                },
            });
            const rpc = createMcpClient(mcp);
            const [source, target] = accountChain();
            const candidates = [httpCandidate(source), httpCandidate(target), blobCandidate()];
            const before = receivedRequests;
            try {
                await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'blob-authoring', version: '1.0.0' } });
                await rpc('notifications/initialized', {}, true);
                const proposed = z.object({ result: z.object({ structuredContent: z.object({ reviewId: z.string() }) }) })
                    .parse(await rpc('tools/call', { name: 'propose_invocation_collection', arguments: { candidates } }));
                const reviewId = proposed.result.structuredContent.reviewId;
                assert.ok(controller);
                await runEditorScript(controller, `
                    const row = document.querySelector('.case[data-id="blob-import"]');
                    if (!row.querySelector('[data-case-id]').checked || row.querySelector('[data-case-id]').disabled) throw new Error('Blob fixture is not supported and selected.');
                    if (!row.querySelector('.case-status').textContent.includes('Manual only')) throw new Error('Manual status missing.');
                    if (!row.querySelector('.case-status').textContent.startsWith('Blob Trigger / ')) throw new Error('Blob trigger description is missing.');
                    row.querySelector('.case-toggle').click();
                    if (row.querySelector('.send-preview') || row.querySelector('.run-preview-chain')) throw new Error('Blob row can upload a preview.');
                    if (row.querySelector('.blob-container').value !== 'inventory-imports') throw new Error('Binding-derived container was lost.');
                    if (!document.querySelector('#confirm-collection').disabled) throw new Error('Confirmation accepted a missing file.');
                `);
                const selected = await rpc('tools/call', {
                    name: 'select_blob_invocation_file', arguments: { reviewId, candidateId: 'blob-import' },
                });
                const selectedResult = z.object({ result: z.object({ structuredContent: z.object({ reviewId: z.string(), candidateId: z.string(), fileSelected: z.literal(true) }) }) }).parse(selected);
                assert.deepStrictEqual(selectedResult.result.structuredContent, { reviewId, candidateId: 'blob-import', fileSelected: true });
                assert.ok(!JSON.stringify(selected).includes(file.fsPath));
                assert.ok(!JSON.stringify(selected).includes('user-private-fixture'));
                assert.ok(!JSON.stringify(selected).includes(bytes.toString('base64')));
                cancelPicker = true;
                const cancelled = z.object({ result: z.object({ isError: z.literal(true) }) }).parse(await rpc('tools/call', {
                    name: 'select_blob_invocation_file', arguments: { reviewId, candidateId: 'blob-import' },
                }));
                assert.strictEqual(cancelled.result.isError, true);
                await runEditorScript(controller, `
                    const row = document.querySelector('.case[data-id="blob-import"]');
                    if (row.querySelector('.blob-file-name').textContent !== 'user-private-fixture.bin') throw new Error('MCP picker did not update the review.');
                    if (row.querySelector('.blob-blobName').value !== 'user-private-fixture.bin') throw new Error('Chosen filename was not defaulted.');
                    row.querySelector('.blob-container').value = 'private-container';
                    row.querySelector('.blob-blobName').value = 'nested/private-destination.bin';
                    row.querySelector('.blob-target').value = 'http://localhost:12345/devstoreaccount1';
                    const comment = row.querySelector('[data-comment-id]');
                    comment.value = 'Use a binary content type.';
                    comment.dispatchEvent(new Event('input', { bubbles: true }));
                    document.querySelector('#confirm-collection').click();
                    await waitFor(() => !document.querySelector('#review-loading').hidden);
                `);
                const feedback = await rpc('tools/call', { name: 'get_invocation_collection_review', arguments: { reviewId } });
                for (const privateValue of ['private-container', 'private-destination', '12345', 'user-private-fixture', file.fsPath, bytes.toString('base64')]) {
                    assert.ok(!JSON.stringify(feedback).includes(privateValue), `Review leaked ${privateValue}.`);
                }
                const reviewedBlob = reviews.getReview(reviewId).cases.find(candidate => candidate.trigger === 'blob');
                assert.ok(reviewedBlob?.trigger === 'blob');
                assert.strictEqual(reviewedBlob.fileSelected, true);
                assert.deepStrictEqual(reviewedBlob.reviewedFields, ['target', 'container', 'blobName']);
                const revised: BlobInvocationCandidate = {
                    ...blobCandidate(),
                    request: { ...blobCandidate().request, container: 'revised-imports', contentType: 'application/octet-stream' },
                };
                const revision = await rpc('tools/call', {
                    name: 'propose_invocation_collection',
                    arguments: { reviewId, revision: 1, candidates: [candidates[0], candidates[1], revised] },
                });
                assert.ok(!JSON.stringify(revision).includes('"isError":true'));
                assert.ok(controller);
                await fs.remove(file.fsPath);
                await runEditorScript(controller, `
                    const row = document.querySelector('.case[data-id="blob-import"]');
                    if (row.querySelector('.blob-file-name').textContent !== 'user-private-fixture.bin') throw new Error('Revision lost the captured file.');
                    if (row.querySelector('.blob-container').value !== 'private-container' || row.querySelector('.blob-blobName').value !== 'nested/private-destination.bin') throw new Error('Revision overwrote private metadata.');
                    if (row.querySelector('.blob-target').value !== 'http://localhost:12345/devstoreaccount1') throw new Error('Revision overwrote the private endpoint.');
                    if (row.querySelector('.blob-contentType').value !== 'application/octet-stream') throw new Error('Unedited metadata did not adopt the revision.');
                    if (row.querySelector('[data-comment-id]').value) throw new Error('Applied feedback was not cleared.');
                    document.querySelector('#confirm-collection').click();
                    await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Confirmed.'));
                `);
                assert.strictEqual(picks, 2);
                assert.strictEqual(provider.getInvocations().length, 3);
                assert.strictEqual(provider.getRequests().length, 2);
                const blobId = reviews.getDraftId(reviewId, 'blob-import');
                assert.ok(blobId);
                const saved = provider.getBlobInvocation(blobId);
                assert.ok(saved);
                assert.strictEqual(saved.request.container, 'private-container');
                assert.strictEqual(saved.request.blobName, 'nested/private-destination.bin');
                assert.strictEqual(saved.request.content, bytes.toString('base64'));
                assert.strictEqual(saved.request.fileName, 'user-private-fixture.bin');
                assert.strictEqual(provider.getRequest(blobId), undefined);
                const targetId = reviews.getDraftId(reviewId, target.id);
                assert.ok(targetId);
                assert.strictEqual(provider.getRequest(targetId)?.request.bindings?.[0].sourceId, reviews.getDraftId(reviewId, source.id));
                assert.strictEqual(receivedRequests, before);
                assert.strictEqual(uploads.length, 0);
                assert.strictEqual(containers.size, 0);
                assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection(provider.getInvocations())), provider.getInvocations());
                const rejected = z.object({ result: z.object({ isError: z.literal(true) }) }).parse(await rpc('tools/call', {
                    name: 'select_blob_invocation_file', arguments: { reviewId, candidateId: 'blob-import' },
                }));
                assert.strictEqual(rejected.result.isError, true);
                assert.strictEqual(picks, 2);
            } finally {
                handler.dispose();
                reviews.dispose();
                provider.dispose();
                await mcp.disposable.dispose();
                await fs.remove(directory);
            }
        });

        test('review file picking handles cancellation and size limits, and requires a real capture before atomic saving', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const reviews = new CollectionReviews(context, provider, async () => { });
            const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-blob-review-'));
            const oversized = vscode.Uri.file(path.join(directory, 'oversized.bin'));
            const empty = vscode.Uri.file(path.join(directory, 'empty.bin'));
            await fs.writeFile(oversized.fsPath, Buffer.alloc(5 * 1024 * 1024 + 1));
            await fs.writeFile(empty.fsPath, Buffer.alloc(0));
            let picks = 0;
            const handler = registerOnActionStartHandler(action => {
                if (action.callbackId === 'azureFunctions.azureInvoke.reviewCollection') {
                    action.ui.showOpenDialog = async () => {
                        picks++;
                        if (picks === 1 || picks === 4) {
                            throw new UserCancelledError();
                        }
                        return [picks === 2 ? oversized : empty];
                    };
                }
            });
            try {
                const controller = await reviews.open([httpCandidate(), blobCandidate()]);
                await runEditorScript(controller, `
                    const row = document.querySelector('.case[data-id="blob-import"]');
                    const checkbox = row.querySelector('[data-case-id]');
                    const confirm = document.querySelector('#confirm-collection');
                    checkbox.click();
                    if (confirm.disabled) throw new Error('Unchecked Blob fixture blocked HTTP confirmation.');
                    checkbox.click();
                    window.testApi.postMessage({ command: 'confirmCollection', selections: [{ id: 'http', comment: '' }, { id: 'blob-import', comment: '' }] });
                    await waitFor(() => !document.querySelector('#review-error').hidden);
                    if (!document.querySelector('#review-error').textContent.includes('Choose a file')) throw new Error('Forged confirmation bypassed file capture.');
                    const pick = async () => {
                        const finished = new Promise(resolve => {
                            let started = false;
                            const listen = event => {
                                if (event.data.command !== 'state') return;
                                if (event.data.selectingBlobFile) started = true;
                                else if (started) { window.removeEventListener('message', listen); resolve(); }
                            };
                            window.addEventListener('message', listen);
                        });
                        row.querySelector('.choose-blob-file').click();
                        await finished;
                    };
                    row.querySelector('.case-toggle').click();
                    await pick();
                    if (!document.querySelector('#review-error').hidden || !confirm.disabled) throw new Error('Cancellation displayed an error or supplied a file.');
                    await pick();
                    await waitFor(() => !document.querySelector('#review-error').hidden);
                    if (!document.querySelector('#review-error').textContent.includes('5 MB')) throw new Error('Oversized fixture was not rejected.');
                    if (!confirm.disabled) throw new Error('Oversized fixture enabled confirmation.');
                    row.querySelector('.blob-blobName').value = 'incoming/empty.bin';
                    await pick();
                    if (row.querySelector('.blob-blobName').value !== 'incoming/empty.bin') throw new Error('Choosing a file overwrote the concrete destination.');
                    if (row.querySelector('.blob-file-name').textContent !== 'empty.bin' || confirm.disabled) throw new Error('Valid empty file was rejected.');
                    await pick();
                    if (row.querySelector('.blob-file-name').textContent !== 'empty.bin' || !document.querySelector('#review-error').hidden || confirm.disabled) throw new Error('Cancellation lost the existing captured file.');
                    confirm.click();
                    await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Confirmed.'));
                `);
                assert.strictEqual(picks, 4);
                assert.strictEqual(provider.getInvocations().length, 2);
                const blob = provider.getInvocations().find(item => item.id === reviews.getDraftId(controller.reviewId, 'blob-import'));
                assert.ok(blob && 'trigger' in blob && blob.trigger === 'blob');
                assert.strictEqual(blob.request.content, '');
                assert.strictEqual(blob.request.encoding, 'base64');
                assert.strictEqual(blob.request.blobName, 'incoming/empty.bin');
                assert.strictEqual(uploads.length, 0);
            } finally {
                handler.dispose();
                reviews.dispose();
                provider.dispose();
                await fs.remove(directory);
            }
        });

        test('rejects stale Blob file selection after review replacement, revision, closure, and cancellation', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const reviews = new CollectionReviews(context, provider, async () => { });
            const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-blob-stale-'));
            const file = vscode.Uri.file(path.join(directory, 'private.bin'));
            await fs.writeFile(file.fsPath, 'private-stale-fixture');
            try {
                for (const change of ['replace', 'revise', 'close', 'cancel', 'abort'] as const) {
                    const controller = await reviews.open([httpCandidate(), blobCandidate()]);
                    const action = await createTestActionContext();
                    let choose: (uris: vscode.Uri[]) => void = () => { throw new Error('Picker did not start.'); };
                    let started: () => void = () => { };
                    const opened = new Promise<void>(resolve => { started = resolve; });
                    action.ui.showOpenDialog = async () => {
                        started();
                        return await new Promise<vscode.Uri[]>(resolve => { choose = resolve; });
                    };
                    await assert.rejects(reviews.selectBlobFile(action, 'wrong-review', 'blob-import'), /active collection review/);
                    await assert.rejects(reviews.selectBlobFile(action, controller.reviewId, 'http'), /active collection review/);
                    const cancellation = new AbortController();
                    const pending = reviews.selectBlobFile(action, controller.reviewId, 'blob-import', cancellation.signal);
                    await opened;
                    await assert.rejects(reviews.selectBlobFile(action, controller.reviewId, 'blob-import'), /file picker/);
                    if (change === 'replace') {
                        await reviews.open([blobCandidate()]);
                    } else if (change === 'revise') {
                        await controller.setCandidates([blobCandidate()]);
                    } else if (change === 'close') {
                        controller.panel.dispose();
                    } else if (change === 'abort') {
                        cancellation.abort();
                    } else {
                        await runEditorScript(controller, `
                            document.querySelector('#cancel-collection').click();
                            await waitFor(() => document.querySelector('#review-message').textContent.startsWith('Review cancelled.'));
                        `);
                    }
                    choose([file]);
                    await assert.rejects(pending, change === 'abort' ? isUserCancelledError : /review changed while choosing a file/);
                    assert.strictEqual(controller.hasBlobFile('blob-import'), false);
                }
                assert.deepStrictEqual(provider.getInvocations(), []);
                assert.strictEqual(uploads.length, 0);
                const controller = await reviews.open([blobCandidate()]);
                const action = await createTestActionContext();
                action.ui.showOpenDialog = async () => [vscode.Uri.file(path.join(directory, 'not-found-private.bin'))];
                await assert.rejects(reviews.selectBlobFile(action, controller.reviewId, 'blob-import'), error =>
                    error instanceof Error && /Could not read/.test(error.message) && !error.message.includes(directory));
                assert.strictEqual(controller.hasBlobFile('blob-import'), false);
            } finally {
                reviews.dispose();
                provider.dispose();
                await fs.remove(directory);
            }
        });

        test('Blob authoring rejects invalid destinations and cannot supply HTTP prerequisites', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const reviews = new CollectionReviews(context, provider);
            const blob = blobCandidate();
            try {
                for (const request of [
                    { ...blob.request, target: { kind: 'azurite' as const, url: 'https://example.com/devstoreaccount1' } },
                    { ...blob.request, container: 'Invalid Container' },
                    { ...blob.request, blobName: '{name}' },
                ]) {
                    await assert.rejects(reviews.open([{ ...blob, request }]), /Azurite|concrete Blob name/);
                }
                await assert.rejects(reviews.open([blob, httpCandidate({
                    request: request({ dependsOn: [blob.id] }),
                })]), /prerequisite request is unavailable/);
                assert.deepStrictEqual(provider.getInvocations(), []);
                assert.strictEqual(uploads.length, 0);
            } finally {
                reviews.dispose();
                provider.dispose();
            }
        });

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
                    if (!document.querySelector('#debug').disabled) throw new Error('Unsaved fixture allowed Copilot upload.');
                    if (!document.querySelector('#upload').disabled || !document.querySelector('#save').disabled) throw new Error('A new fixture must require file selection.');
                    if (document.querySelector('#encoding') || document.querySelector('#content')) throw new Error('Manual content controls remain visible.');
                    document.querySelector('#load-file').click();
                    await waitFor(() => document.querySelector('#selected-file').textContent === 'fixture.bin');
                    if (document.querySelector('#blob-name').value !== 'fixture.bin') throw new Error('File selection did not default the blob name.');
                    document.querySelector('#load-file').click();
                    await waitFor(() => !document.querySelector('#load-file').disabled);
                    if (document.querySelector('#selected-file').textContent !== 'fixture.bin' || !document.querySelector('#error').hidden) throw new Error('Cancelling replaced the selected file or displayed an error.');
                    document.querySelector('#save').click();
                    await waitFor(() => document.querySelector('#save-status').textContent === 'Saved for this session');
                    if (document.querySelector('#debug').disabled) throw new Error('Saved fixture cannot use breakpoints.');
                    document.querySelector('#blob-name').value = 'nested/unsaved.bin';
                    document.querySelector('#blob-name').dispatchEvent(new Event('input', { bubbles: true }));
                    document.querySelector('#upload').click();
                    await waitFor(() => !document.querySelector('#receipt').hidden);
                    if (!document.querySelector('#upload-status').textContent.includes('Function execution not observed')) throw new Error('Receipt claimed function success.');
                    if (!document.querySelector('#debug').disabled) throw new Error('Unsaved changes permitted breakpoint upload.');
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

        test('breakpoint upload keeps content private, ignores unsaved edits, and consumes authorization once', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const blob = fixture();
            const opened: { id: string; debugId: string }[] = [];
            const editors = new BlobInvocationEditors(context, provider, {
                resolveSession: async () => ({ id: 'existing-blob-debugger' }),
                openChat: async (id, debugId) => { opened.push({ id, debugId }); },
            });
            const guidance = 'Pause before inventory rows are written.';
            let prompts = 0;
            const handler = registerOnActionStartHandler(action => {
                if (action.callbackId === 'azureFunctions.azureInvoke.blobEditor') {
                    action.ui.showInputBox = async () => { prompts++; return `  ${guidance}  `; };
                }
            });
            provider.saveRequest(blob);
            try {
                const editor = editors.open(blob, true);
                await runEditorScript(editor, `
                    document.querySelector('#debug').click();
                    await waitFor(() => !document.querySelector('#notice').hidden);
                    document.querySelector('#blob-name').value = 'not-authorized.json';
                    document.querySelector('#blob-name').dispatchEvent(new Event('input', { bubbles: true }));
                `);
                assert.strictEqual(opened.length, 1);
                assert.strictEqual(prompts, 1);
                assert.strictEqual(uploads.length, 0, 'Opening Copilot must not upload.');
                const metadata = await getBlobInvocationDebugContextTool(editors).execute(opened[0]);
                assert.strictEqual(metadata.container, blob.request.container);
                assert.strictEqual(metadata.breakpointGuidance, guidance);
                assert.ok(!JSON.stringify(opened).includes(guidance), 'Guidance must be read through the authorized context, not copied into the launch prompt.');
                assert.ok(!JSON.stringify(metadata).includes('fixture-secret'));
                assert.ok(!JSON.stringify(opened).includes('fixture-secret'));
                const tool = uploadBlobInvocationTool(editors);
                assert.strictEqual(tool.annotations?.consentGuidance, ConsentGuidance.AlwaysRequired);
                const receipt = await tool.execute(opened[0]);
                assert.strictEqual(receipt.functionExecution, 'notObserved');
                assert.strictEqual(uploads[0].bytes.toString(), blob.request.content);
                assert.strictEqual(uploads.length, 1);
                await assert.rejects(() => Promise.resolve(tool.execute(opened[0])), /authorization expired/);
                assert.strictEqual(uploads.length, 1, 'Expired authorization must not fall back to ordinary upload.');
                assert.deepStrictEqual(provider.getBlobInvocation(blob.id), blob);
            } finally {
                handler.dispose();
                editors.dispose();
                provider.dispose();
            }
        });

        test('optional breakpoint guidance can be skipped or cancelled and rejects fixture or debugger changes during the prompt', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const blob = fixture();
            const opened: { id: string; debugId: string }[] = [];
            let session = 'blob-guidance-session';
            const editors = new BlobInvocationEditors(context, provider, {
                resolveSession: async () => ({ id: session }),
                openChat: async (id, debugId) => { opened.push({ id, debugId }); },
            });
            const action = await createTestActionContext();
            provider.saveRequest(blob);
            try {
                action.ui.showInputBox = async () => '   ';
                await editors.debugInvocation(action, blob.id);
                const metadata = await getBlobInvocationDebugContextTool(editors).execute(opened[0]);
                assert.strictEqual(metadata.breakpointGuidance, undefined);
                assert.strictEqual(opened.length, 1);
                assert.strictEqual(uploads.length, 0);
                action.ui.showInputBox = async () => { throw new UserCancelledError(); };
                await assert.rejects(editors.debugInvocation(action, blob.id), isUserCancelledError);
                assert.strictEqual(opened.length, 1, 'Cancelling the optional prompt must not open chat or authorize an upload.');
                await assert.rejects(editors.getDebugContext(action, blob.id, opened[0].debugId), /authorization expired/);

                action.ui.showInputBox = async () => {
                    provider.saveRequest({ ...blob, request: { ...blob.request, blobName: 'changed-during-prompt.json' } });
                    return 'Pause before reading the file.';
                };
                await assert.rejects(editors.debugInvocation(action, blob.id), /authorization expired/);
                provider.saveRequest(blob);
                action.ui.showInputBox = async () => {
                    session = 'changed-during-guidance';
                    return 'Pause at the first row.';
                };
                await assert.rejects(editors.debugInvocation(action, blob.id), /debugger changed/);
                assert.strictEqual(opened.length, 1);
                assert.strictEqual(uploads.length, 0);
                assert.deepStrictEqual(provider.getBlobInvocation(blob.id), blob);
                assert.ok(!serializeInvocationCollection(provider.getInvocations()).includes('breakpointGuidance'));
            } finally {
                editors.dispose();
                provider.dispose();
            }
        });

        test('changed fixtures, debuggers, and collections invalidate Blob authorization before writing', async () => {
            const context = (await getTestApi()).extensionVariables.getContext();
            assert.ok(context);
            const provider = new AzureInvokeTreeDataProvider();
            const blob = fixture();
            let session = 'blob-session';
            let debugId = '';
            const editors = new BlobInvocationEditors(context, provider, {
                resolveSession: async () => ({ id: session }),
                openChat: async (_id, token) => { debugId = token; },
            });
            const action = await createTestActionContext();
            action.ui.showInputBox = async () => '';
            provider.saveRequest(blob);
            try {
                await editors.debugInvocation(action, blob.id);
                provider.saveRequest({ ...blob, request: { ...blob.request, content: 'later saved content' } });
                provider.saveRequest(blob);
                await assert.rejects(() => editors.uploadSaved(action, blob.id, undefined, debugId), /fixture changed/);
                await editors.debugInvocation(action, blob.id);
                session = 'different-blob-session';
                await assert.rejects(() => editors.uploadSaved(action, blob.id, undefined, debugId), /debugger changed/);
                await editors.debugInvocation(action, blob.id);
                editors.closeAll();
                await assert.rejects(() => editors.uploadSaved(action, blob.id, undefined, debugId), /authorization expired/);
                assert.strictEqual(uploads.length, 0);

                await editors.uploadSaved(action, blob.id);
                await editors.debugInvocation(action, blob.id);
                onContainerWrite = () => {
                    session = 'changed-before-blob-write';
                };
                await assert.rejects(() => editors.uploadSaved(action, blob.id, undefined, debugId), /debugger changed/);
                assert.strictEqual(uploads.length, 1, 'Authorization must be checked again before the blob write.');
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

    test('manual trigger commands open the matching bundled HTTP and Blob editors', async () => {
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
                'create_http_invocation', 'debug_http_invocation', 'draft_http_invocation', 'get_blob_invocation_debug_context', 'get_http_invocation_debug_context', 'get_http_invocation_inspection', 'get_invocation_collection_review', 'get_invocation_diagnostics', 'list_blob_invocations', 'list_http_invocations', 'propose_http_invocation_changes', 'propose_invocation_collection', 'run_http_invocation', 'select_blob_invocation_file', 'upload_blob_invocation',
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
            const inspection = z.object({ result: z.object({ structuredContent: z.object({
                status: z.string(), resultMatchesSavedRequest: z.boolean(),
                diagnostic: z.object({ status: z.number() }),
            }) }) }).parse(await rpc('tools/call', {
                name: 'get_http_invocation_inspection', arguments: { id: created.result.structuredContent.id },
            })).result.structuredContent;
            assert.strictEqual(inspection.status, 'succeeded');
            assert.strictEqual(inspection.resultMatchesSavedRequest, true);
            assert.strictEqual(inspection.diagnostic.status, 200);
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
            const failedDebug = z.object({ result: z.object({ isError: z.literal(true) }) }).parse(await rpc('tools/call', {
                name: 'upload_blob_invocation', arguments: { id: blob.id, debugId: 'not-authorized' },
            }));
            assert.strictEqual(failedDebug.result.isError, true);
            assert.strictEqual(receivedRequests, before + 1, 'Invalid Blob authorization must not send storage requests.');
            await vscode.commands.executeCommand('azureFunctions.azureInvoke.open', { id: blob.id });
            const findBlobTab = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab =>
                tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('azureInvokeBlob') && tab.label === blob.name);
            await waitForTabChange(() => !!findBlobTab());
            const blobTab = findBlobTab();
            assert.ok(blobTab);
            await vscode.window.tabGroups.close(blobTab);
            await ui.runWithInputs(['Save Collection', 'Overwrite'], async () => await vscode.commands.executeCommand('azureFunctions.azureInvoke.saveCollection', toolbarTarget));
            assert.deepStrictEqual(parseInvocationCollection(await fs.readFile(toolbarTarget.fsPath, 'utf8')), [blob]);
            const menus = z.array(z.object({ command: z.optional(z.string()), when: z.optional(z.string()) }))
                .parse(api.extensionVariables.getContext()?.extension.packageJSON.contributes.menus['view/item/context']);
            assert.ok(menus.some(menu => menu.command === 'azureFunctions.azureInvoke.debugBlob' &&
                menu.when === 'view == azureFunctions.azureInvoke && viewItem == azureInvoke.blob'));
            assert.ok((await vscode.commands.getCommands()).includes('azureFunctions.azureInvoke.debugBlob'));
        } finally {
            vscode.window.showSaveDialog = showSaveDialog;
            handler.dispose();
            mcp.disposable.dispose();
            await fs.remove(directory);
        }
    });
});
