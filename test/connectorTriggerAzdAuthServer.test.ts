/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../src/extensionVariables';
import { BallerinaDebugProvider } from '../src/debug/BallerinaDebugProvider';
import { FuncTaskProvider } from '../src/debug/FuncTaskProvider';
import { JavaDebugProvider } from '../src/debug/JavaDebugProvider';
import { NodeDebugProvider } from '../src/debug/NodeDebugProvider';
import { PowerShellDebugProvider } from '../src/debug/PowerShellDebugProvider';
import { PythonDebugProvider } from '../src/debug/PythonDebugProvider';
import {
    ConnectorAzdAuthServer,
    ConnectorAzdAuthTokenError,
    authorizeConnectorAzdAuth,
    disposeConnectorAzdAuthServer,
    disposeConnectorAzdAuthServers,
    ensureConnectorAzdAuthServer,
    getAzureResourcesToken,
    getConnectorAzdAuthAccount,
    getConnectorAzdAuthTaskEnvironment,
    getTokenExpiry,
    removeConnectorAzdAuthEnvironment,
    updateConnectorAzdAuthIdentity,
    type ConnectorAzdAuthIdentity,
    type ConnectorAzdAuthSubscription,
    type ConnectorAzdAuthTokenRequest,
} from '../src/debug/connectorNamespace/connectorTriggerAzdAuthServer';
import { getCurrentConnectorAzdAuthTaskEnvironment } from '../src/debug/connectorNamespace/connectorTriggerAzdTaskEnvironment';
import { getTestWorkspaceFolder } from './global.test';
import { getTestApi } from './utils/testApiAccess';

const tokenUrl = '/token?api-version=2023-07-12-preview';
const noTenants: ConnectorAzdAuthIdentity = { tenantIds: [undefined], accounts: {} };
async function clearSavedAccounts(projectPath: string): Promise<void> {
    const resolvedPath = path.resolve(projectPath);
    const key = process.platform === 'win32' || process.platform === 'darwin' ? resolvedPath.toLowerCase() : resolvedPath;
    await ext.context.workspaceState.update(`connectorAzdAuthAccounts:${key}`, undefined);
}
const startFake = async (identity: ConnectorAzdAuthIdentity) =>
    await ConnectorAzdAuthServer.start(identity, async () => ({ token: 't', expiresOn: 'e' }));

suite('Connector Trigger azd authentication server', () => {
    let server: ConnectorAzdAuthServer | undefined;
    let originalContext: typeof ext.context;

    suiteSetup(async () => {
        originalContext = ext.context;
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        ext.context = context;
    });

    suiteTeardown(() => {
        ext.context = originalContext;
    });

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
        return await new Promise((resolve, reject) => {
            const request = http.request({
                socketPath: target.socketPath,
                path: options.url ?? tokenUrl,
                method: options.method ?? 'POST',
                headers: {
                    authorization: `Bearer ${options.key ?? environment.AZD_AUTH_KEY}`,
                    'content-type': options.contentType ?? 'application/json',
                },
            }, response => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
                response.on('error', reject);
            });
            request.on('error', reject);
            request.end(options.method === 'GET' ? undefined : options.body ?? JSON.stringify({ scopes: ['https://management.azure.com//.default'] }));
        });
    }

    test('serves tokens over a restricted local socket only to callers with the key', async () => {
        const requests: [ConnectorAzdAuthTokenRequest, ConnectorAzdAuthIdentity][] = [];
        server = await ConnectorAzdAuthServer.start({ tenantIds: ['fixture-tenant'], accounts: {} }, async (request, identity) => {
            requests.push([request, identity]);
            return { token: 'fixture-token', expiresOn: '2030-01-01T00:00:00Z' };
        });
        assert.match(server.endpoint, process.platform === 'win32' ? /^npipe:/ : /^unix:/);
        if (process.platform !== 'win32') {
            assert.strictEqual((await fs.promises.stat(server.socketPath)).mode & 0o777, 0o600);
            assert.strictEqual((await fs.promises.stat(path.dirname(server.socketPath))).mode & 0o777, 0o700);
        }

        assert.strictEqual((await post(server, { key: 'wrong-key' })).status, 401);
        assert.strictEqual((await post(server, { url: '/token' })).status, 400);
        assert.strictEqual((await post(server, { method: 'GET' })).status, 400);
        assert.strictEqual((await post(server, { contentType: 'text/plain' })).status, 400);
        assert.strictEqual((await post(server, { body: '{"scopes":[]}' })).status, 400);
        assert.strictEqual(requests.length, 0);

        server.identity = { tenantIds: ['fixture-tenant'], accounts: { 'fixture-tenant': { accountId: 'fixture-account' } } };
        const response = await post(server, { body: JSON.stringify({ scopes: ['scope-a'], tenantId: 'request-tenant' }) });
        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(JSON.parse(response.body), { status: 'success', token: 'fixture-token', expiresOn: '2030-01-01T00:00:00Z' });
        assert.deepStrictEqual(requests, [[
            { scopes: ['scope-a'], tenantId: 'request-tenant' },
            { tenantIds: ['fixture-tenant'], accounts: { 'fixture-tenant': { accountId: 'fixture-account' } } },
        ]]);
    });

    test('returns azd error codes without leaking unexpected error details', async () => {
        let error: Error = new ConnectorAzdAuthTokenError('NotSignedInError', 'Sign in.');
        server = await ConnectorAzdAuthServer.start(noTenants, async () => { throw error; });

        assert.deepStrictEqual(JSON.parse((await post(server)).body), { status: 'error', code: 'NotSignedInError', message: 'Sign in.' });
        error = new Error('private-detail');
        const response = JSON.parse((await post(server)).body) as { status: string; code: string; message: string };
        assert.strictEqual(response.status, 'error');
        assert.strictEqual(response.code, 'GetTokenError');
        assert.ok(!response.message.includes('private-detail'));
    });

    test('removes its private Unix socket directory on disposal', async function () {
        if (process.platform === 'win32') {
            this.skip();
        }
        server = await ConnectorAzdAuthServer.start(noTenants, async () => ({ token: 't', expiresOn: 'e' }));
        const directory = path.dirname(server.socketPath);
        server.dispose();
        server = undefined;
        for (let attempt = 0; attempt < 100 && fs.existsSync(directory); attempt++) {
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.strictEqual(fs.existsSync(directory), false);
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
            subscription('account-a', 'tenant-1', 'AzureUSGovernment', 'token-a1-gov'),
        ];
        const scopes = ['scope'];

        const identity = (tenantIds: (string | undefined)[], accounts: ConnectorAzdAuthIdentity['accounts'] = {}): ConnectorAzdAuthIdentity => ({ tenantIds, accounts });

        assert.strictEqual((await getAzureResourcesToken({ scopes }, identity(['tenant-2']), subscriptions)).token, 'token-a2');
        assert.strictEqual((await getAzureResourcesToken({ scopes, tenantId: 'TENANT-1' }, identity(['Tenant-1'], { 'tenant-1': { accountId: 'account-a', environmentName: 'AzureCloud' } }), subscriptions)).token, 'token-a1');
        await assert.rejects(getAzureResourcesToken({ scopes, tenantId: 'tenant-1' }, identity(['tenant-1'], { 'tenant-1': { accountId: 'account-a' } }), subscriptions),
            (error: unknown) => error instanceof ConnectorAzdAuthTokenError && /More than one/.test(error.message));
        await assert.rejects(getAzureResourcesToken({ scopes }, identity(['tenant-1']), subscriptions),
            (error: unknown) => error instanceof ConnectorAzdAuthTokenError && /More than one/.test(error.message));
        await assert.rejects(getAzureResourcesToken({ scopes }, identity(['tenant-3'], { 'tenant-3': { environmentName: 'AzureCloud' } }), subscriptions),
            (error: unknown) => error instanceof ConnectorAzdAuthTokenError && error.code === 'NotSignedInError' && /not signed in/.test(error.message));
        await assert.rejects(getAzureResourcesToken({ scopes }, identity(['tenant-4']), subscriptions),
            (error: unknown) => error instanceof ConnectorAzdAuthTokenError && error.code === 'NotSignedInError' && /No Azure Resources account/.test(error.message));
    });

    test('serves only configured tenants, each with its own selected account', async () => {
        const subscription = (accountId: string, tenantId: string, token: string): ConnectorAzdAuthSubscription => ({
            tenantId, account: { id: accountId }, environment: { name: 'AzureCloud' }, authentication: { getSessionWithScopes: () => ({ accessToken: token }) },
        });
        const subscriptions = async () => [
            subscription('account-a', 'tenant-1', 'token-a1'),
            subscription('account-b', 'tenant-1', 'token-b1'),
            subscription('account-b', 'tenant-2', 'token-b2'),
            subscription('account-c', 'tenant-3', 'token-c3'),
        ];
        const scopes = ['scope'];
        const identity: ConnectorAzdAuthIdentity = {
            tenantIds: ['tenant-1', 'TENANT-2'],
            accounts: { 'tenant-1': { accountId: 'account-a' }, 'tenant-2': { accountId: 'account-b' } },
        };

        assert.strictEqual((await getAzureResourcesToken({ scopes, tenantId: 'tenant-1' }, identity, subscriptions)).token, 'token-a1');
        assert.strictEqual((await getAzureResourcesToken({ scopes, tenantId: 'tenant-2' }, identity, subscriptions)).token, 'token-b2');
        await assert.rejects(getAzureResourcesToken({ scopes, tenantId: 'tenant-3' }, identity, subscriptions),
            (error: unknown) => error instanceof ConnectorAzdAuthTokenError && error.code === 'NotSignedInError' && /no Connector Trigger connection/.test(error.message));
        await assert.rejects(getAzureResourcesToken({ scopes }, identity, subscriptions),
            (error: unknown) => error instanceof ConnectorAzdAuthTokenError && /without a tenant/.test(error.message));
        assert.strictEqual((await getAzureResourcesToken({ scopes }, { tenantIds: ['tenant-3'], accounts: {} }, subscriptions)).token, 'token-c3');
    });

    test('allows consent when the requested token scope has no existing session', async () => {
        let receivedOptions: unknown;
        const subscriptions = async () => [{
            tenantId: 'tenant',
            account: { id: 'account' },
            environment: { name: 'AzureCloud' },
            authentication: {
                getSessionWithScopes: async (_scopes: string[], options?: { createIfNone?: boolean }) => {
                    receivedOptions = options;
                    return { accessToken: 'token' };
                },
            },
        }];
        await getAzureResourcesToken({ scopes: ['polling-scope'] }, { tenantIds: ['tenant'], accounts: {} }, subscriptions);
        assert.deepStrictEqual(receivedOptions, { createIfNone: true });
    });

    test('keeps each tenant\'s selected account across F5 sessions and server restarts', async () => {
        const projectPath = path.join(os.tmpdir(), `connector-azd-${randomUUID()}`);
        try {
            const registered = await ensureConnectorAzdAuthServer(projectPath, ['tenant-1', 'tenant-2'], { pinCredential: true }, startFake);
            await updateConnectorAzdAuthIdentity(projectPath, { tenantId: 'Tenant-1', accountId: 'account-a', environmentName: 'AzureCloud' });
            await updateConnectorAzdAuthIdentity(projectPath, { tenantId: 'tenant-2', accountId: 'account-b', environmentName: 'AzureCloud' });
            const accounts = {
                'tenant-1': { accountId: 'account-a', environmentName: 'AzureCloud' },
                'tenant-2': { accountId: 'account-b', environmentName: 'AzureCloud' },
            };
            assert.deepStrictEqual(registered.identity, { tenantIds: ['tenant-1', 'tenant-2'], accounts });
            assert.deepStrictEqual(getConnectorAzdAuthAccount(projectPath, 'TENANT-2'), accounts['tenant-2']);

            const reused = await ensureConnectorAzdAuthServer(projectPath, ['tenant-1'], { pinCredential: true }, startFake);
            assert.strictEqual(reused, registered);
            assert.deepStrictEqual(reused.identity, { tenantIds: ['tenant-1'], accounts });

            // Selecting another account replaces only that tenant's selection.
            await updateConnectorAzdAuthIdentity(projectPath, { tenantId: 'tenant-1', accountId: 'account-c', environmentName: 'AzureCloud' });
            disposeConnectorAzdAuthServer(projectPath);
            const restarted = await ensureConnectorAzdAuthServer(projectPath, ['tenant-1', 'tenant-2'], { pinCredential: true }, startFake);
            assert.deepStrictEqual(restarted.identity.accounts, { ...accounts, 'tenant-1': { accountId: 'account-c', environmentName: 'AzureCloud' } });
        } finally {
            disposeConnectorAzdAuthServer(projectPath);
            await clearSavedAccounts(projectPath);
        }
    });

    test('requests polling consent for each configured tenant using its selected account', async () => {
        const projectPath = path.join(os.tmpdir(), `connector-azd-${randomUUID()}`);
        const subscriptions = async (): Promise<ConnectorAzdAuthSubscription[]> => [
            { tenantId: 'tenant-1', account: { id: 'account-a' }, environment: { name: 'AzureCloud' }, authentication: { getSessionWithScopes: () => ({ accessToken: 't' }) } },
            { tenantId: 'tenant-2', account: { id: 'account-b' }, environment: { name: 'AzureCloud' }, authentication: { getSessionWithScopes: () => ({ accessToken: 't' }) } },
        ];
        const context = await createTestActionContext();
        try {
            await ensureConnectorAzdAuthServer(projectPath, [], { pinCredential: true }, startFake);
            await updateConnectorAzdAuthIdentity(projectPath, { tenantId: 'tenant-1', accountId: 'account-a', environmentName: 'AzureCloud' });
            await updateConnectorAzdAuthIdentity(projectPath, { tenantId: 'tenant-2', accountId: 'account-b', environmentName: 'AzureCloud' });
            const requests: [ConnectorAzdAuthTokenRequest, ConnectorAzdAuthIdentity][] = [];
            await authorizeConnectorAzdAuth(context, projectPath, ['tenant-1', 'tenant-2'], async (request, identity) => {
                requests.push([request, identity]);
                return await getAzureResourcesToken(request, identity, subscriptions);
            }, subscriptions);
            assert.deepStrictEqual(requests.map(([request, identity]) => [request.tenantId, identity.tenantIds]), [
                ['tenant-1', ['tenant-1', 'tenant-2']],
                ['tenant-2', ['tenant-1', 'tenant-2']],
            ]);
        } finally {
            disposeConnectorAzdAuthServer(projectPath);
            await clearSavedAccounts(projectPath);
        }
    });

    test('prompts for another account when the selected account is signed out, and saves the choice', async () => {
        const projectPath = path.join(os.tmpdir(), `connector-azd-${randomUUID()}`);
        const subscriptions = async (): Promise<ConnectorAzdAuthSubscription[]> => [
            { tenantId: 'tenant-1', account: { id: 'account-b', label: 'Account B' }, environment: { name: 'AzureCloud' }, authentication: { getSessionWithScopes: () => ({ accessToken: 'token-b' }) } },
        ];
        const context = await createTestActionContext();
        try {
            await ensureConnectorAzdAuthServer(projectPath, ['tenant-1'], { pinCredential: true }, startFake);
            await updateConnectorAzdAuthIdentity(projectPath, { tenantId: 'tenant-1', accountId: 'signed-out-account', environmentName: 'AzureCloud' });
            await assert.rejects(authorizeConnectorAzdAuth(context, projectPath, ['tenant-1'], async (request, identity) =>
                await getAzureResourcesToken(request, identity, subscriptions), async () => []),
            (error: unknown) => error instanceof ConnectorAzdAuthTokenError && /not signed in/.test(error.message));

            await context.ui.runWithInputs(['Account B'], async () => {
                await authorizeConnectorAzdAuth(context, projectPath, ['tenant-1'], async (request, identity) =>
                    await getAzureResourcesToken(request, identity, subscriptions), subscriptions);
            });
            assert.deepStrictEqual(getConnectorAzdAuthAccount(projectPath, 'tenant-1'), { accountId: 'account-b', environmentName: 'AzureCloud' });
            assert.strictEqual(context.telemetry.properties.connectorAzdAuthAccountReselected, 'true');
        } finally {
            disposeConnectorAzdAuthServer(projectPath);
            await clearSavedAccounts(projectPath);
        }
    });

    test('injects the server, credential pin and azd PATH into the project host task and strips them on read-back', async () => {
        const projectPath = path.join(os.tmpdir(), 'connector-azd-project');
        const pathDirectory = path.join(os.tmpdir(), 'azd-bin');
        let started = 0;
        const start = async (identity: ConnectorAzdAuthIdentity) => {
            started++;
            return await ConnectorAzdAuthServer.start(identity, async () => ({ token: 't', expiresOn: 'e' }));
        };
        const registered = await ensureConnectorAzdAuthServer(projectPath, ['tenant-1'], { pinCredential: true, pathDirectory }, start);
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
        const reused = await ensureConnectorAzdAuthServer(projectPath, ['tenant-2'], { pinCredential: false }, start);
        assert.strictEqual(reused, registered);
        assert.strictEqual(started, 1);
        assert.deepStrictEqual(reused.identity.tenantIds, ['tenant-2']);
        assert.deepStrictEqual(getConnectorAzdAuthTaskEnvironment({ projectPath, folderPath: projectPath }, base), registered.getEnvironment());
        assert.deepStrictEqual(removeConnectorAzdAuthEnvironment(projectPath, { AZURE_TOKEN_CREDENTIALS: 'AzureDeveloperCliCredential' }),
            { AZURE_TOKEN_CREDENTIALS: 'AzureDeveloperCliCredential' });
        disposeConnectorAzdAuthServer(projectPath);
        assert.strictEqual(getConnectorAzdAuthTaskEnvironment({ projectPath, folderPath: projectPath }, base), undefined);
    });

    test('revalidates bindings and explicit credentials before injecting a later host task', async () => {
        const projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-azd-task-'));
        const functionPath = path.join(projectPath, 'Poll');
        const settingsPath = path.join(projectPath, 'local.settings.json');
        const location = { projectPath, folderPath: projectPath };
        const context = await createTestActionContext();
        try {
            await fs.promises.mkdir(functionPath);
            await fs.promises.writeFile(path.join(functionPath, 'function.json'), JSON.stringify({
                bindings: [{ type: 'connectorTrigger', deliveryMode: 'Poll', connection: 'Connection', triggerConfigName: '%Config%' }],
            }));
            await fs.promises.writeFile(settingsPath, JSON.stringify({ IsEncrypted: false, Values: {} }));
            await ensureConnectorAzdAuthServer(projectPath, [undefined], { pinCredential: true }, startFake);

            assert.ok(await getCurrentConnectorAzdAuthTaskEnvironment(context, location, {}));
            assert.strictEqual(await getCurrentConnectorAzdAuthTaskEnvironment(context, location, { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' }), undefined);
            await fs.promises.writeFile(settingsPath, JSON.stringify({ IsEncrypted: false, Values: { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' } }));
            assert.strictEqual(await getCurrentConnectorAzdAuthTaskEnvironment(context, location, {}), undefined);
            await fs.promises.writeFile(settingsPath, JSON.stringify({ IsEncrypted: false, Values: {} }));
            assert.ok(await getCurrentConnectorAzdAuthTaskEnvironment(context, location, {}));

            await fs.promises.rm(path.join(functionPath, 'function.json'));
            assert.strictEqual(await getCurrentConnectorAzdAuthTaskEnvironment(context, location, {}), undefined);
            assert.strictEqual(getConnectorAzdAuthTaskEnvironment(location), undefined);
        } finally {
            disposeConnectorAzdAuthServer(projectPath);
            await fs.promises.rm(projectPath, { recursive: true, force: true });
        }
    });

    test('resolves host tasks using their current configured credentials and project', async () => {
        const workspacePath = getTestWorkspaceFolder();
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(workspacePath));
        assert.ok(folder);
        const projectPath = path.join(workspacePath, 'ProjectA');
        const otherProject = path.join(workspacePath, 'ProjectB');
        const functionPath = path.join(projectPath, 'Poll');
        const taskConfig = vscode.workspace.getConfiguration('tasks', folder.uri);
        const previous = taskConfig.inspect('tasks')?.workspaceFolderValue;
        const provider = new FuncTaskProvider(new NodeDebugProvider(), new PythonDebugProvider(), new JavaDebugProvider(),
            new BallerinaDebugProvider(), new PowerShellDebugProvider());
        const definition = { type: 'func', command: 'host start' };
        const task = new vscode.Task(definition, folder, 'func: host start', 'func');
        const resolveEnvironment = async (): Promise<Record<string, string> | undefined> => {
            const resolved = await provider.resolveTask(task);
            assert.ok(resolved?.execution instanceof vscode.ShellExecution);
            return resolved.execution.options?.env;
        };
        try {
            await fs.promises.mkdir(functionPath, { recursive: true });
            await fs.promises.mkdir(otherProject, { recursive: true });
            await fs.promises.writeFile(path.join(projectPath, 'host.json'), '{}');
            await fs.promises.writeFile(path.join(otherProject, 'host.json'), '{}');
            await fs.promises.writeFile(path.join(functionPath, 'function.json'), JSON.stringify({
                bindings: [{ type: 'connectorTrigger', deliveryMode: 'Poll', connection: 'Connection', triggerConfigName: '%Config%' }],
            }));
            const configure = async (cwd: string | undefined, env: Record<string, string> = {}) =>
                await taskConfig.update('tasks', [{ ...definition, label: task.name, options: { cwd, env } }], vscode.ConfigurationTarget.WorkspaceFolder);

            await configure('${workspaceFolder}/ProjectA');
            assert.strictEqual((await resolveEnvironment())?.AZD_AUTH_ENDPOINT, undefined);
            await ensureConnectorAzdAuthServer(projectPath, [undefined], { pinCredential: true }, startFake);
            assert.ok((await resolveEnvironment())?.AZD_AUTH_ENDPOINT);
            await configure('${workspaceFolder}/ProjectA', { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' });
            assert.strictEqual((await resolveEnvironment())?.AZD_AUTH_ENDPOINT, undefined);
            await configure('${workspaceFolder}/ProjectB');
            assert.strictEqual((await resolveEnvironment())?.AZD_AUTH_ENDPOINT, undefined);
            await configure(undefined);
            assert.strictEqual((await resolveEnvironment())?.AZD_AUTH_ENDPOINT, undefined);
        } finally {
            await taskConfig.update('tasks', previous, vscode.ConfigurationTarget.WorkspaceFolder);
            disposeConnectorAzdAuthServer(projectPath);
            await fs.promises.rm(projectPath, { recursive: true, force: true });
            await fs.promises.rm(otherProject, { recursive: true, force: true });
        }
    });
});
