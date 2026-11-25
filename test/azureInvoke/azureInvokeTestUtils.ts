/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createServer, type Server } from 'http';
import { type AddressInfo } from 'net';
import * as vscode from 'vscode';
import * as z from 'zod/mini';
import { InvocationCollection } from '../../src/azureInvoke/InvocationCollection';
import { ChainInvocationRunner } from '../../src/azureInvoke/invocationRunner/ChainInvocationRunner';
import { type HttpInvocation, type HttpRequest } from '../../src/azureInvoke/models/httpSchema';
import { AzureInvokeTreeDataProvider } from '../../src/tree/azureInvoke/AzureInvokeTreeDataProvider';
import { InvocationItem } from '../../src/tree/azureInvoke/InvocationItem';
import { InvocationEditorManager } from '../../src/webviews/azureInvoke/extension/InvocationEditorManager';
import { getTestApi } from '../utils/testApiAccess';

export const compactResponseJson = '{"items":[{"id":9007199254740993,"amount":1.2300e+4,"zero":-0}],"message":"<img src=x>","empty":[]}';
export const formattedResponseJson = [
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

/** A local HTTP server with fixed routes for exercising requests, chains, and failures. */
export const testServer = {
    server: undefined as unknown as Server,
    baseUrl: '',
    receivedRequests: 0,
    accountBodies: [] as string[],
    accountNumber: 0,
};

/** Runs the test server for the duration of the current suite. */
export function useInvokeTestServer(): void {
    suiteSetup(async () => {
        testServer.server = createServer(async (request, response) => {
            testServer.receivedRequests++;
            if (request.url === '/slow') {
                return;
            }
            if (request.url === '/slow-body') {
                response.writeHead(200);
                response.write('waiting');
                return;
            }
            if (request.url === '/redirect') {
                response.writeHead(302, { location: `${testServer.baseUrl}/echo` });
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
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
                chunks.push(Buffer.from(chunk));
            }
            response.setHeader('content-type', 'application/json');
            if (request.method === 'POST' && request.url === '/accounts') {
                testServer.accountBodies.push(Buffer.concat(chunks).toString());
                const id = `account/${++testServer.accountNumber} ?#`;
                response.writeHead(201, { location: `${testServer.baseUrl}/accounts/${encodeURIComponent(id)}` });
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
        await new Promise<void>(resolve => testServer.server.listen(0, '127.0.0.1', resolve));
        testServer.baseUrl = `http://127.0.0.1:${(testServer.server.address() as AddressInfo).port}`;
    });

    suiteTeardown(async () => {
        testServer.server.closeAllConnections();
        await new Promise<void>((resolve, reject) => testServer.server.close(error => error ? reject(error) : resolve()));
        testServer.baseUrl = '';
    });
}

export function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
    return { method: 'GET', url: `${testServer.baseUrl}/echo`, headers: [], query: [], body: '', ...overrides };
}

export function accountChain(): [HttpInvocation, HttpInvocation] {
    return [
        { id: 'create-account', name: 'Create account', request: request({ method: 'POST', url: `${testServer.baseUrl}/accounts`, body: '{}' }) },
        {
            id: 'get-account', name: 'Get account',
            request: request({ url: `${testServer.baseUrl}/accounts/{{accountId}}`, bindings: [{ name: 'accountId', sourceId: 'create-account', pointer: '/body/id' }] }),
        },
    ];
}

export function createInvoke() {
    const collection = new InvocationCollection();
    const chainRunner = new ChainInvocationRunner(collection);
    const provider = new AzureInvokeTreeDataProvider(collection, chainRunner);
    return {
        collection, chainRunner, provider,
        dispose(): void {
            provider.dispose();
            chainRunner.dispose();
            collection.dispose();
        },
    };
}

export async function createInvokeWithEditors() {
    const extensionContext = (await getTestApi()).extensionVariables.getContext();
    assert.ok(extensionContext);
    const invoke = createInvoke();
    const editorManager = new InvocationEditorManager(extensionContext, invoke.collection, invoke.chainRunner);
    return {
        ...invoke, editorManager,
        dispose(): void {
            editorManager.dispose();
            invoke.dispose();
        },
    };
}

export function getTreeItem(invoke: ReturnType<typeof createInvoke>, id: string): vscode.TreeItem {
    const items = invoke.provider.getChildren().flatMap(item => [item, ...invoke.provider.getChildren(item)]);
    const item = items.find(item => item instanceof InvocationItem && item.id === id);
    assert.ok(item);
    return invoke.provider.getTreeItem(item);
}

export function invocation(): HttpInvocation {
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

const editorDocuments = new WeakMap<object, string>();
let editorInteractionSequence = 0;

/** Runs an interaction in the real webview and waits for the script to report its result. */
export async function runEditorScript(editor: { readonly panel: vscode.WebviewPanel }, script: string): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    let subscription: vscode.Disposable | undefined;
    try {
        await new Promise<void>((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Azure Invoke editor did not finish the interaction.')), 10000);
            subscription = editor.panel.webview.onDidReceiveMessage((message: unknown) => {
                if (message && typeof message === 'object' && 'testResult' in message) {
                    if (message.testResult === true) {
                        resolve();
                    } else {
                        reject(new Error(String(message.testResult)));
                    }
                }
            });
            const html = editorDocuments.get(editor) ?? editor.panel.webview.html;
            editorDocuments.set(editor, html);
            const nonce = /nonce="([^"]+)"/.exec(html)?.[1];
            assert.ok(nonce);
            editor.panel.webview.html = html.replace('acquireVsCodeApi()', 'window.testApi = acquireVsCodeApi()')
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
                        await waitFor(() => document.querySelector('#save'));
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

export function createMcpClient(mcp: { serverUri: vscode.Uri; headers: Record<string, string> }) {
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

export const runResultSchema = z.object({
    isError: z.optional(z.boolean()),
    structuredContent: z.object({
        status: z.number(),
        duration: z.number(),
        reusedPrerequisiteIds: z.optional(z.array(z.string())),
        headers: z.optional(z.array(z.object({ name: z.string(), value: z.string() }))),
        body: z.optional(z.string()),
    }),
});

export function findInvocationTab(name?: string): vscode.Tab | undefined {
    return vscode.window.tabGroups.all.flatMap(group => group.tabs).find(candidate =>
        candidate.input instanceof vscode.TabInputWebview && candidate.input.viewType.includes('azureInvokeHttpRequest') &&
        (name === undefined || candidate.label === name));
}

export async function waitForTabChange(predicate: () => boolean): Promise<void> {
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

export async function waitForInvocationTab(name?: string): Promise<vscode.Tab> {
    await waitForTabChange(() => !!findInvocationTab(name));
    const tab = findInvocationTab(name);
    assert.ok(tab);
    return tab;
}
