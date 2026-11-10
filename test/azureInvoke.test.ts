/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError, TestUserInput, UserCancelledError } from '@microsoft/vscode-azext-utils';
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
import { type HttpInvocation, type HttpRequest } from '../src/webviews/azureInvoke/shared/httpRequest';

suite('Azure Invoke', () => {
    let server: Server;
    let baseUrl: string;
    const accountBodies: string[] = [];
    const debugBodies: string[] = [];
    const timerRequests: { url: string; method: string; body: string; contentType?: string }[] = [];
    let accountNumber = 0;
    const compactResponseJson = '{"items":[{"id":9007199254740993,"amount":1.2300e+4,"zero":-0}],"message":"<img src=x>","empty":[]}';

    suiteSetup(async () => {
        server = createServer(async (request, response) => {
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














});
