/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import {
    ConnectorAzdAuthServer,
    ConnectorAzdAuthTokenError,
    disposeConnectorAzdAuthServers,
    ensureConnectorAzdAuthServer,
    getAzureResourcesToken,
    getConnectorAzdAuthTaskEnvironment,
    getTokenExpiry,
    removeConnectorAzdAuthEnvironment,
    type ConnectorAzdAuthIdentity,
    type ConnectorAzdAuthSubscription,
    type ConnectorAzdAuthTokenRequest,
} from '../src/debug/connectorNamespace/connectorTriggerAzdAuthServer';

const tokenUrl = '/token?api-version=2023-07-12-preview';

suite('Connector Trigger azd authentication server', () => {
    let server: ConnectorAzdAuthServer | undefined;

    teardown(() => {
        server?.dispose();
        server = undefined;
        disposeConnectorAzdAuthServers();
    });

    async function post(
        target: ConnectorAzdAuthServer,
        options: { url?: string; method?: string; key?: string; contentType?: string; body?: string } = {},
    ): Promise<{ status: number; body: string }> {
        const environment = target.getEnvironment();
        const response = await fetch(`${target.endpoint}${options.url ?? tokenUrl}`, {
            method: options.method ?? 'POST',
            headers: {
                authorization: `Bearer ${options.key ?? environment.AZD_AUTH_KEY}`,
                'content-type': options.contentType ?? 'application/json',
            },
            ...(options.method === 'GET' ? {} : { body: options.body ?? JSON.stringify({ scopes: ['https://management.azure.com//.default'] }) }),
        });
        return { status: response.status, body: await response.text() };
    }

    test('serves tokens on loopback only to callers with the key', async () => {
        const requests: [ConnectorAzdAuthTokenRequest, ConnectorAzdAuthIdentity][] = [];
        server = await ConnectorAzdAuthServer.start({ tenantId: 'fixture-tenant' }, async (request, identity) => {
            requests.push([request, identity]);
            return { token: 'fixture-token', expiresOn: '2030-01-01T00:00:00Z' };
        });
        assert.match(server.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);

        assert.strictEqual((await post(server, { key: 'wrong-key' })).status, 401);
        assert.strictEqual((await post(server, { url: '/token' })).status, 400);
        assert.strictEqual((await post(server, { method: 'GET' })).status, 400);
        assert.strictEqual((await post(server, { contentType: 'text/plain' })).status, 400);
        assert.strictEqual((await post(server, { body: '{"scopes":[]}' })).status, 400);
        assert.strictEqual(requests.length, 0);

        server.identity = { tenantId: 'fixture-tenant', accountId: 'fixture-account' };
        const response = await post(server, { body: JSON.stringify({ scopes: ['scope-a'], tenantId: 'request-tenant' }) });
        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(JSON.parse(response.body), { status: 'success', token: 'fixture-token', expiresOn: '2030-01-01T00:00:00Z' });
        assert.deepStrictEqual(requests, [[
            { scopes: ['scope-a'], tenantId: 'request-tenant' },
            { tenantId: 'fixture-tenant', accountId: 'fixture-account' },
        ]]);
    });

    test('returns azd error codes without leaking unexpected error details', async () => {
        let error: Error = new ConnectorAzdAuthTokenError('NotSignedInError', 'Sign in.');
        server = await ConnectorAzdAuthServer.start({}, async () => { throw error; });

        assert.deepStrictEqual(JSON.parse((await post(server)).body), { status: 'error', code: 'NotSignedInError', message: 'Sign in.' });
        error = new Error('private-detail');
        const response = JSON.parse((await post(server)).body) as { status: string; code: string; message: string };
        assert.strictEqual(response.status, 'error');
        assert.strictEqual(response.code, 'GetTokenError');
        assert.ok(!response.message.includes('private-detail'));
    });

    test('reads token expiry from the JWT and falls back to a short lifetime', () => {
        const jwt = `h.${Buffer.from(JSON.stringify({ exp: 1893456000 })).toString('base64url')}.s`;
        assert.strictEqual(getTokenExpiry(jwt), '2030-01-01T00:00:00Z');
        assert.strictEqual(getTokenExpiry('opaque', Date.UTC(2030, 0, 1)), '2030-01-01T00:05:00Z');
    });

    test('selects exactly one Azure Resources account for the requested tenant, account and cloud', async () => {
        const sessionFor = (token: string) => async () => ({ accessToken: token });
        const subscription = (accountId: string, tenantId: string, environmentName: string, token: string): ConnectorAzdAuthSubscription => ({
            tenantId, account: { id: accountId }, environment: { name: environmentName }, authentication: { getSessionWithScopes: sessionFor(token) },
        });
        const subscriptions = async () => [
            subscription('account-a', 'Tenant-1', 'AzureCloud', 'token-a1'),
            subscription('account-a', 'tenant-1', 'AzureCloud', 'token-a1-second-subscription'),
            subscription('account-b', 'tenant-1', 'AzureCloud', 'token-b1'),
            subscription('account-a', 'tenant-2', 'AzureCloud', 'token-a2'),
            subscription('account-c', 'tenant-3', 'AzureUSGovernment', 'token-c3'),
        ];
        const scopes = ['scope'];

        assert.strictEqual((await getAzureResourcesToken({ scopes }, { tenantId: 'tenant-2' }, subscriptions)).token, 'token-a2');
        assert.strictEqual((await getAzureResourcesToken({ scopes, tenantId: 'TENANT-1' }, { accountId: 'account-a' }, subscriptions)).token, 'token-a1');
        await assert.rejects(getAzureResourcesToken({ scopes }, { tenantId: 'tenant-1' }, subscriptions),
            (error: unknown) => error instanceof ConnectorAzdAuthTokenError && /More than one/.test(error.message));
        await assert.rejects(getAzureResourcesToken({ scopes }, { tenantId: 'tenant-3', environmentName: 'AzureCloud' }, subscriptions),
            (error: unknown) => error instanceof ConnectorAzdAuthTokenError && error.code === 'NotSignedInError' && /No Azure Resources account/.test(error.message));
    });

    test('injects the server, credential pin and azd PATH into the project host task and strips them on read-back', async () => {
        const projectPath = path.join(os.tmpdir(), 'connector-azd-project');
        const pathDirectory = path.join(os.tmpdir(), 'azd-bin');
        let started = 0;
        const start = async (identity: ConnectorAzdAuthIdentity) => {
            started++;
            return await ConnectorAzdAuthServer.start(identity, async () => ({ token: 't', expiresOn: 'e' }));
        };
        const registered = await ensureConnectorAzdAuthServer(projectPath, { tenantId: 'tenant-1' }, { pinCredential: true, pathDirectory }, start);
        const base = { Path: 'existing-path', Other: 'kept' };

        const environment = getConnectorAzdAuthTaskEnvironment({ folderPath: path.dirname(projectPath) }, base);
        assert.deepStrictEqual(environment, {
            ...registered.getEnvironment(),
            AZURE_TOKEN_CREDENTIALS: 'AzureDeveloperCliCredential',
            Path: `${pathDirectory}${path.delimiter}existing-path`,
        });
        assert.strictEqual(getConnectorAzdAuthTaskEnvironment({ folderPath: path.join(os.tmpdir(), 'unrelated') }, base), undefined);
        assert.deepStrictEqual(removeConnectorAzdAuthEnvironment(projectPath, { ...base, ...environment }), base);

        // A user selection is never removed, and a later F5 reuses the running server with the new options.
        const reused = await ensureConnectorAzdAuthServer(projectPath, { tenantId: 'tenant-2' }, { pinCredential: false }, start);
        assert.strictEqual(reused, registered);
        assert.strictEqual(started, 1);
        assert.deepStrictEqual(reused.identity, { tenantId: 'tenant-2' });
        assert.deepStrictEqual(getConnectorAzdAuthTaskEnvironment({ projectPath, folderPath: projectPath }, base), registered.getEnvironment());
        assert.deepStrictEqual(removeConnectorAzdAuthEnvironment(projectPath, { AZURE_TOKEN_CREDENTIALS: 'AzureDeveloperCliCredential' }),
            { AZURE_TOKEN_CREDENTIALS: 'AzureDeveloperCliCredential' });
    });
});
