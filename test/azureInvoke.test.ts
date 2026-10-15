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
import { sendHttpRequest } from '../src/webviews/azureInvoke/extension/sendHttpRequest';
import { type HttpInvocation, type HttpRequest } from '../src/webviews/azureInvoke/shared/httpRequest';
import { getTestApi } from './utils/testApiAccess';

suite('Azure Invoke', () => {
    let server: Server;
    let baseUrl: string;
    let receivedRequests = 0;

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

    test('validates input before sending a request', async () => {
        const count = receivedRequests;
        for (const invalid of [
            null,
            { ...request(), method: 'TRACE' },
            { ...request(), headers: [null] },
            request({ url: 'file:///etc/passwd' }),
            request({ url: 'not a URL' }),
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
                JSON.stringify({ version: 2, invocations: [] }),
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

    async function runEditorScript(controller: HttpRequestController, script: string): Promise<void> {
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
                const html = controller.panel.webview.html;
                const nonce = /nonce="([^"]+)"/.exec(html)?.[1];
                assert.ok(nonce);
                controller.panel.webview.html = html.replace('acquireVsCodeApi()', 'window.testApi = acquireVsCodeApi()')
                    .replace('</body>', `<script nonce="${nonce}">
                        async function waitFor(predicate) {
                            for (let attempt = 0; attempt < 200; attempt++) {
                                if (predicate()) return;
                                await new Promise(resolve => setTimeout(resolve, 20));
                            }
                            throw new Error('Editor state did not update.');
                        }
                        (async () => {
                            await waitFor(() => document.querySelector('#save'));
                            ${script}
                            window.testApi.postMessage({ command: 'abortRequest', testResult: true });
                        })().catch(error => window.testApi.postMessage({ command: 'abortRequest', testResult: error.message }));
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
        const findTab = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).find(candidate =>
            candidate.input instanceof vscode.TabInputWebview && candidate.input.viewType.includes('azureInvokeHttpRequest'));
        const tab = findTab() ?? await new Promise<vscode.Tab>((resolve, reject) => {
            const timer = setTimeout(() => {
                subscription.dispose();
                reject(new Error('HTTP trigger selection did not open the Azure Invoke webview.'));
            }, 5000);
            const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
                const opened = findTab();
                if (opened) {
                    clearTimeout(timer);
                    subscription.dispose();
                    resolve(opened);
                }
            });
        });
        await vscode.window.tabGroups.close(tab);
    });
});
