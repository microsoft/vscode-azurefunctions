/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { parseInvocationCollection, serializeInvocationCollection } from '../../src/azureInvoke/collectionFile';
import { sendHttpRequest } from '../../src/azureInvoke/triggers/http/sendHttpRequest';
import { request, testServer, useInvokeTestServer } from './azureInvokeTestUtils';

// Pin the public limit rather than deriving the expected boundary from the validator.
const bodyLimitBytes = 5 * 1024 * 1024;
const transportErrorPatterns = {
    invalidRequest: /Invalid HTTP request/,
    responseTooLarge: /5 MB display limit/,
    timeout: /Request timed out/,
};

suite('Azure Invoke HTTP requests', () => {
    useInvokeTestServer();

    async function send(input: unknown, abort = new AbortController(), timeout = 2000) {
        return await sendHttpRequest(await createTestActionContext(), input, abort.signal, timeout);
    }

    // ---- Request and response handling ----

    test('sends method, query parameters, headers, and raw body to a local endpoint', async () => {
        const response = await send(request({
            method: 'POST',
            url: `${testServer.baseUrl}/echo?tag=first`,
            query: [{ name: 'tag', value: 'second' }, { name: 'name', value: 'a & b' }],
            headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-functions-key', value: 'example-key' }],
            body: '{"hello":"world"}',
        }));
        // The echo endpoint reports what reached the server, not what the caller passed in.
        const echoed = JSON.parse(response.body);
        assert.strictEqual(response.status, 200);
        assert.ok(response.duration >= 0);
        assert.strictEqual(echoed.method, 'POST');
        assert.strictEqual(echoed.url, '/echo?tag=first&tag=second&name=a+%26+b');
        assert.strictEqual(echoed.headers['content-type'], 'application/json');
        assert.strictEqual(echoed.headers['x-functions-key'], 'example-key');
        assert.strictEqual(echoed.body, '{"hello":"world"}');
        assert.ok(response.headers.some(header => header.name === 'content-type'));
    });

    test('returns HTTP failures and their bodies without retrying', async () => {
        const count = testServer.receivedRequests;
        const result = await send(request({ method: 'POST', url: `${testServer.baseUrl}/error`, body: 'payload' }));
        assert.strictEqual(result.status, 503);
        assert.strictEqual(result.body, '{"error":"try again"}');
        assert.strictEqual(testServer.receivedRequests, count + 1);
    });

    test('does not follow redirects with function keys', async () => {
        const count = testServer.receivedRequests;
        const result = await send(request({
            url: `${testServer.baseUrl}/redirect`,
            headers: [{ name: 'x-functions-key', value: 'example-key' }],
        }));
        assert.strictEqual(result.status, 302);
        assert.strictEqual(result.body, 'redirect');
        assert.strictEqual(testServer.receivedRequests, count + 1);
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
        await assert.rejects(send({ ...input, query: [{ name: 'page', value: '', enabled: 'invalid' }] }), transportErrorPatterns.invalidRequest);
    });

    // ---- Validation and size limits ----

    test('validates input before sending a request', async () => {
        const requestCountBeforeValidation = testServer.receivedRequests;
        for (const invalidRequest of [
            // Invalid input shape and method.
            null,
            { ...request(), method: 'TRACE' },
            { ...request(), headers: [null] },

            // URL validation, including route syntax that Invoke does not substitute.
            request({ url: 'file:///etc/passwd' }),
            request({ url: 'not a URL' }),
            request({ url: `${testServer.baseUrl}/api/posts/{id}` }),
            request({ url: `${testServer.baseUrl}/api/posts/%7Bid%7D` }),
            request({ url: `${testServer.baseUrl}/api/posts/:id` }),
            request({ url: 'https://name:password@example.com' }),
            request({ body: 'GET body' }),
            request({ query: [{ name: '', value: 'value' }] }),
            request({ headers: [{ name: 'bad\r\nheader', value: 'value' }] }),
            request({ headers: [{ name: 'x-test', value: 'bad\r\nvalue' }] }),
            request({ headers: Array.from({ length: 101 }, () => ({ name: 'x-test', value: 'value' })) }),
        ]) {
            await assert.rejects(send(invalidRequest));
        }
        await assert.rejects(
            send(request({ method: 'POST', body: 'x'.repeat(bodyLimitBytes + 1) })),
            { message: 'Request bodies must not exceed 5 MB.' },
        );
        assert.strictEqual(testServer.receivedRequests, requestCountBeforeValidation);
    });

    test('rejects responses above the display limit', async () => {
        await assert.rejects(send(request({ url: `${testServer.baseUrl}/large` })), transportErrorPatterns.responseTooLarge);
    });

    test('accepts request and response bodies exactly at the size limit', async () => {
        const body = 'x'.repeat(bodyLimitBytes);
        const uploaded = await send(request({ method: 'POST', url: `${testServer.baseUrl}/size`, body }));
        assert.strictEqual(JSON.parse(uploaded.body).size, Buffer.byteLength(body));
        const downloaded = await send(request({ url: `${testServer.baseUrl}/limit` }));
        assert.strictEqual(Buffer.byteLength(downloaded.body), Buffer.byteLength(body));
    });

    test('does not expose request secrets in transport errors', async () => {
        await assert.rejects(send(request({ url: `${testServer.baseUrl}/drop?code=example-key` })), (error: unknown) =>
            error instanceof Error && !error.message.includes('example-key') && !('cause' in error));
    });

    // ---- Cancellation and timeouts ----

    test('cancels an in-flight request', async () => {
        const abortController = new AbortController();
        const pendingResponse = send(request({ url: `${testServer.baseUrl}/slow` }), abortController);
        const cancelTimer = setTimeout(() => abortController.abort(), 50);
        try {
            await assert.rejects(pendingResponse, isUserCancelledError);
        } finally {
            clearTimeout(cancelTimer);
        }
    });

    // /slow withholds headers; /slow-body sends headers but leaves the body incomplete.
    for (const route of ['/slow', '/slow-body']) {
        test(`times out requests to ${route}`, async () => {
            await assert.rejects(send(request({ url: `${testServer.baseUrl}${route}` }), undefined, 50), transportErrorPatterns.timeout);
        });
    }

    test('ordinary zero and negative timeouts do not disable request cancellation', async () => {
        for (const timeout of [0, -1]) {
            await assert.rejects(send(request({ url: `${testServer.baseUrl}/slow` }), undefined, timeout), transportErrorPatterns.timeout);
        }
    });
});
