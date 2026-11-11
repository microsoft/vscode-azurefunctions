/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { type ConnectorGatewayClient } from '../src/commands/createFunction/connectorSteps/ConnectorGatewayClient';
import {
    type ConnectorConnectionAccessPolicyCreateOrUpdateRequest,
    type ConnectorConnectionAccessPolicyResource,
    type ConnectorTriggerConfigCreateOrUpdateRequest,
    type ConnectorTriggerConfigResource,
} from '../src/commands/createFunction/connectorSteps/ConnectorGatewayModels';
import {
    AzureConnectorTriggerGatewayAdapter,
    connectorTriggerOwnerTagKey,
    type ConnectorHostEnvironment,
    type LiveConnectorSubscriptionResolver,
} from '../src/debug/connectorNamespace/AzureConnectorTriggerF5Adapters';
import {
    ConnectorTriggerF5SetupError,
    type ConnectorTriggerConnection,
    type ConnectorTriggerConnectionAccessPolicy,
    type ConnectorTriggerF5Dependencies,
    type ConnectorTriggerGateway,
    type ConnectorTriggerHostCredentialConfiguration,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerSetupTarget,
} from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { runConnectorTriggerF5Setup } from '../src/debug/connectorNamespace/connectorTriggerF5Setup';
import {
    planConnectorHostCredential,
    type ConnectorPollingTokenProvider,
} from '../src/debug/connectorNamespace/connectorTriggerHostCredential';
import { parseJson } from '../src/utils/parseJson';

const connectionSettingName = 'AdapterFixtureConnection';
const binding: ConnectorTriggerLocalBinding = {
    connectionSettingName,
    triggerConfigSettingName: 'AdapterFixtureTriggerConfig',
};
const target: ConnectorTriggerSetupTarget = {
    version: 1,
    subscription: {
        id: 'subscription-id',
        tenantId: 'selected-tenant',
        environment: { name: 'AzureCloud', resourceManagerEndpointUrl: 'https://management.azure.com/' },
    },
    region: 'eastus',
    connectorId: 'office365',
    operationId: 'OnNewEmailV3',
};
const namespace: ConnectorTriggerNamespace = {
    id: 'namespace-id',
    name: 'namespace',
    resourceGroupName: 'resource-group',
    location: 'eastus',
    identity: { principalId: 'namespace-principal', tenantId: 'selected-tenant' },
};
const connection: ConnectorTriggerConnection = {
    id: 'connection-id',
    name: 'connection',
    connectorId: target.connectorId,
    status: 'Connected',
    createdBy: { objectId: 'connection-creator', tenantId: 'selected-tenant' },
};
const workspaceId = 'this-workspace';
const hostPrincipal = { objectId: 'host-object-id', tenantId: 'host-tenant' };

function hostCredential(
    connectionSettings: Record<string, string> = {},
    environment: Record<string, string> = {},
): ConnectorTriggerHostCredentialConfiguration {
    return { connectionSettingName, connectionSettings, environment };
}

function createJwt(claims: Record<string, unknown>): string {
    const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
}

suite('Connector Trigger host credential planning', () => {
    test('connection-section client secret wins over DefaultAzureCredential settings', () => {
        const plan = planConnectorHostCredential(
            hostCredential(
                { tenantId: 'conn-tenant', clientId: 'conn-client', clientSecret: 'conn-secret' },
                { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', AZURE_CLIENT_ID: 'env-client', AZURE_CLIENT_SECRET: 'env-secret', AZURE_TENANT_ID: 'env-tenant' },
            ),
            {},
        );
        assert.deepStrictEqual(plan, {
            kind: 'clientSecret',
            source: 'connectionSettings',
            tenantId: 'conn-tenant',
            clientId: 'conn-client',
            clientSecret: 'conn-secret',
            authorityHost: 'https://login.microsoftonline.com/',
        });
    });

    test('honors AZURE_AUTHORITY_HOST for client secret credentials', () => {
        const plan = planConnectorHostCredential(
            hostCredential({ tenantId: 't', clientId: 'c', clientSecret: 's' }, { AZURE_AUTHORITY_HOST: 'https://login.example.invalid/' }),
            {},
        );
        assert.strictEqual(plan.kind === 'clientSecret' && plan.authorityHost, 'https://login.example.invalid/');
    });

    test('process environment takes precedence over local.settings.json values', () => {
        const plan = planConnectorHostCredential(
            hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential' }),
            { AZURE_TOKEN_CREDENTIALS: ' azureclicredential ' },
        );
        assert.deepStrictEqual(plan, { kind: 'azureCli', tenantId: undefined });
    });

    test('Azure CLI uses the connection tenant before AZURE_TENANT_ID', () => {
        assert.deepStrictEqual(
            planConnectorHostCredential(hostCredential({ tenantId: 'conn-tenant' }, { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', AZURE_TENANT_ID: 'env-tenant' }), {}),
            { kind: 'azureCli', tenantId: 'conn-tenant' },
        );
        assert.deepStrictEqual(
            planConnectorHostCredential(hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', AZURE_TENANT_ID: 'env-tenant' }), {}),
            { kind: 'azureCli', tenantId: 'env-tenant' },
        );
    });

    test('pinned EnvironmentCredential resolves to the environment client secret', () => {
        const plan = planConnectorHostCredential(
            hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential', AZURE_TENANT_ID: 'env-tenant', AZURE_CLIENT_ID: 'env-client' }),
            { AZURE_CLIENT_SECRET: 'env-secret' },
        );
        assert.deepStrictEqual(plan, {
            kind: 'clientSecret',
            source: 'environmentCredential',
            tenantId: 'env-tenant',
            clientId: 'env-client',
            clientSecret: 'env-secret',
            authorityHost: 'https://login.microsoftonline.com/',
        });
    });

    const failClosedCases: [string, ConnectorTriggerHostCredentialConfiguration, NodeJS.ProcessEnv, string][] = [
        ['unpinned DefaultAzureCredential', hostCredential(), {}, 'defaultCredentialChain'],
        ['DefaultAzureCredential with only a client ID', hostCredential({ clientId: 'c' }), {}, 'defaultCredentialChain'],
        ['dev credential chain', hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'dev' }), {}, 'defaultCredentialChain'],
        ['prod credential chain', hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'prod' }), {}, 'defaultCredentialChain'],
        ['pinned managed identity', hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'ManagedIdentityCredential' }), {}, 'unsupportedTokenCredentialsSelection'],
        ['explicit managed identity credential', hostCredential({ credential: 'managedidentity', clientId: 'c' }), {}, 'explicitCredentialType'],
        ['explicit credential beats client secret', hostCredential({ credential: 'workloadidentity', tenantId: 't', clientId: 'c', clientSecret: 's' }), {}, 'explicitCredentialType'],
        ['client certificate', hostCredential({ tenantId: 't', clientId: 'c', clientCertificate: 'thumbprint' }), {}, 'clientCertificate'],
        ['managedIdentityObjectId without credential', hostCredential({ managedIdentityObjectId: 'o' }), {}, 'invalidConnectionSettings'],
        ['azureCloud setting', hostCredential({ azureCloud: 'AzureChinaCloud', tenantId: 't', clientId: 'c', clientSecret: 's' }), {}, 'azureCloudSetting'],
        ['prefixed AzureWebJobs section', hostCredential({ tenantId: 't', clientId: 'c', clientSecret: 's' }), { [`AzureWebJobs${connectionSettingName}__clientId`]: 'other' }, 'prefixedConnectionSection'],
        ['incomplete EnvironmentCredential', hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential', AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c' }), {}, 'environmentCredentialIncomplete'],
        ['EnvironmentCredential tenant conflict', hostCredential({ tenantId: 'conn-tenant' }, { AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential', AZURE_TENANT_ID: 'env-tenant', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's' }), {}, 'environmentCredentialTenantConflict'],
    ];
    for (const [name, credential, environment, reason] of failClosedCases) {
        test(`fails closed for ${name}`, () => {
            assert.deepStrictEqual(planConnectorHostCredential(credential, environment), { kind: 'unsupported', reason });
        });
    }
});

suite('Connector Trigger Azure gateway adapter', () => {
    test('returns the principal from the host credential token, not the connection creator', async () => {
        const fixture = createAdapterFixture({ token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }) });
        const context = await createTestActionContext();

        const principal = await fixture.adapter.getPollingPrincipal(
            context,
            target,
            hostCredential({ tenantId: 'conn-tenant', clientId: 'conn-client', clientSecret: 'conn-secret' }),
        );

        assert.deepStrictEqual(principal, hostPrincipal);
        assert.deepStrictEqual(fixture.tokenRequests, [{
            kind: 'clientSecret',
            tenantId: 'conn-tenant',
            clientId: 'conn-client',
            clientSecret: 'conn-secret',
            authorityHost: 'https://login.microsoftonline.com/',
        }]);
        assert.ok(context.valuesToMask.includes('conn-secret'));
        assert.ok(!JSON.stringify(context.telemetry.properties).includes('conn-secret'));
        assert.strictEqual(context.telemetry.properties.connectorF5PollingCredential, 'connectionSettings');
    });

    test('passes the host tenant and merged environment to Azure CLI', async () => {
        const fixture = createAdapterFixture({
            token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }),
            processEnvironment: { PATH: 'process-path' },
        });

        const principal = await fixture.adapter.getPollingPrincipal(
            await createTestActionContext(),
            target,
            hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', AZURE_TENANT_ID: 'host-tenant' }),
        );

        assert.deepStrictEqual(principal, hostPrincipal);
        assert.deepStrictEqual(fixture.tokenRequests, [{
            kind: 'azureCli',
            tenantId: 'host-tenant',
            environment: { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', AZURE_TENANT_ID: 'host-tenant', PATH: 'process-path' },
        }]);
    });

    test('fails closed without acquiring a token when the identity cannot be proven', async () => {
        const fixture = createAdapterFixture({ token: createJwt({ oid: 'unused', tid: 'unused' }) });

        await assert.rejects(
            fixture.adapter.getPollingPrincipal(await createTestActionContext(), target, hostCredential()),
            (error: unknown) => error instanceof ConnectorTriggerF5SetupError &&
                /DefaultAzureCredential/.test(error.message) &&
                /No connection access was granted/.test(error.message) &&
                error.message.includes(`${connectionSettingName}__clientSecret`),
        );
        assert.deepStrictEqual(fixture.tokenRequests, []);
    });

    test('fails closed when terminal settings change credential variables for the host task', async () => {
        const fixture = createAdapterFixture({
            token: createJwt({ oid: 'unused', tid: 'unused' }),
            terminalOverrides: { AZURE_CLIENT_ID: 'terminal-client', UNRELATED: 'value' },
        });

        await assert.rejects(
            fixture.adapter.getPollingPrincipal(
                await createTestActionContext(),
                target,
                hostCredential({ tenantId: 't', clientId: 'c', clientSecret: 's' }),
            ),
            (error: unknown) => error instanceof ConnectorTriggerF5SetupError &&
                error.message.includes('AZURE_CLIENT_ID') &&
                !error.message.includes('terminal-client') &&
                !error.message.includes('UNRELATED'),
        );
        assert.deepStrictEqual(fixture.tokenRequests, []);
    });

    test('does not expose credential details when token acquisition fails', async () => {
        const fixture = createAdapterFixture({ tokenError: new Error('AADSTS failure for conn-secret') });

        await assert.rejects(
            fixture.adapter.getPollingPrincipal(
                await createTestActionContext(),
                target,
                hostCredential({ tenantId: 't', clientId: 'c', clientSecret: 'conn-secret' }),
            ),
            (error: unknown) => error instanceof ConnectorTriggerF5SetupError &&
                !error.message.includes('conn-secret') &&
                /No connection access was granted/.test(error.message),
        );
    });

    test('rejects a token without principal claims', async () => {
        const fixture = createAdapterFixture({ token: createJwt({ tid: 'tenant-only' }) });

        await assert.rejects(
            fixture.adapter.getPollingPrincipal(
                await createTestActionContext(),
                target,
                hostCredential({ tenantId: 't', clientId: 'c', clientSecret: 's' }),
            ),
            /did not identify a Microsoft Entra principal/,
        );
    });

    test('creates missing policies, skips equal ones, and never overwrites another principal', async () => {
        const policy = (name: string, objectId: string): ConnectorTriggerConnectionAccessPolicy => ({
            name,
            principal: { type: 'ActiveDirectory', identity: { objectId, tenantId: 'host-tenant' } },
        });
        const fixture = createAdapterFixture({
            accessPolicies: {
                equal: toPolicyResource(policy('equal', 'host-object-id')),
                conflict: toPolicyResource(policy('conflict', 'someone-else')),
            },
        });
        const context = await createTestActionContext();

        await fixture.adapter.ensureConnectionAccessPolicies(context, target, namespace, connection, [
            policy('equal', 'HOST-OBJECT-ID'),
            policy('missing', 'host-object-id'),
        ]);
        assert.deepStrictEqual(fixture.policyWrites.map(write => write.name), ['missing']);

        await assert.rejects(
            fixture.adapter.ensureConnectionAccessPolicies(context, target, namespace, connection, [policy('conflict', 'host-object-id')]),
            (error: unknown) => error instanceof ConnectorTriggerF5SetupError && /different identity/.test(error.message),
        );
        assert.deepStrictEqual(fixture.policyWrites.map(write => write.name), ['missing']);
        assert.strictEqual(fixture.accessPolicies.conflict.properties?.principal?.identity?.objectId, 'someone-else');
    });

    test('persists and reads the Trigger Config owner marker', async () => {
        const fixture = createAdapterFixture({});
        const context = await createTestActionContext();

        assert.strictEqual(await fixture.adapter.getTriggerConfig(context, target, namespace, 'trigger-config'), undefined);
        const created = await fixture.adapter.createOrUpdateTriggerConfig(context, {
            target,
            namespace,
            connection,
            triggerConfigName: 'trigger-config',
            ownerWorkspaceId: workspaceId,
            deliveryMode: 'Poll',
            state: 'Enabled',
            type: 'NotSpecified',
            parameters: [],
        });

        assert.deepStrictEqual(fixture.triggerConfigWrites[0].tags, { [connectorTriggerOwnerTagKey]: workspaceId });
        assert.strictEqual(created.ownerWorkspaceId, workspaceId);
        assert.strictEqual((await fixture.adapter.getTriggerConfig(context, target, namespace, 'trigger-config'))?.ownerWorkspaceId, workspaceId);
    });
});

suite('Connector Trigger F5 setup with the Azure gateway adapter', () => {
    let projectPath: string;
    let settingsPath: string;

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-adapter-'));
        settingsPath = path.join(projectPath, 'local.settings.json');
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
    });

    test('grants nothing and writes no settings when the host would use the unpinned default chain', async () => {
        assertNoAmbientCredentialSelection();
        const values = {};
        await writeSettings(values);
        const fixture = createAdapterFixture({ token: createJwt({ oid: 'unused', tid: 'unused' }) });

        await assert.rejects(
            runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter)),
            /No connection access was granted/,
        );
        assert.deepStrictEqual(fixture.tokenRequests, []);
        assert.deepStrictEqual(fixture.policyWrites, []);
        assert.deepStrictEqual(fixture.triggerConfigWrites, []);
        assert.deepStrictEqual(await readSettings(), values);
    });

    test('grants the host token principal, not the connection creator, and records the owner', async () => {
        assertNoAmbientCredentialSelection();
        await writeSettings({ AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' });
        const fixture = createAdapterFixture({ token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }) });

        await runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter));

        const granted = fixture.policyWrites.map(write => write.request.properties.principal.identity.objectId);
        assert.ok(granted.includes(hostPrincipal.objectId));
        assert.ok(!granted.includes(nonNull(connection.createdBy?.objectId)));
        assert.deepStrictEqual(fixture.triggerConfigWrites[0].tags, { [connectorTriggerOwnerTagKey]: workspaceId });
        assert.strictEqual((await readSettings())[binding.triggerConfigSettingName], 'trigger-config');
    });

    test('refuses a retry against a Trigger Config owned by another workspace', async () => {
        assertNoAmbientCredentialSelection();
        await writeSettings({ AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' });
        const fixture = createAdapterFixture({
            token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }),
            triggerConfig: createTriggerConfigResource({ [connectorTriggerOwnerTagKey]: 'other-workspace' }),
        });

        await assert.rejects(
            runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter)),
            /belongs to another workspace/,
        );
        assert.deepStrictEqual(fixture.triggerConfigWrites, []);
    });

    async function writeSettings(values: Record<string, string>): Promise<void> {
        await fs.promises.writeFile(settingsPath, JSON.stringify({ IsEncrypted: false, Values: values }));
    }

    async function readSettings(): Promise<Record<string, string>> {
        return parseJson<{ Values: Record<string, string> }>(await fs.promises.readFile(settingsPath, 'utf8')).Values;
    }
});

interface AdapterFixtureOptions {
    token?: string;
    tokenError?: Error;
    processEnvironment?: NodeJS.ProcessEnv;
    terminalOverrides?: Record<string, string | null>;
    accessPolicies?: Record<string, ConnectorConnectionAccessPolicyResource>;
    triggerConfig?: ConnectorTriggerConfigResource;
}

interface AdapterFixture {
    adapter: AzureConnectorTriggerGatewayAdapter;
    tokenRequests: unknown[];
    accessPolicies: Record<string, ConnectorConnectionAccessPolicyResource>;
    policyWrites: { name: string; request: ConnectorConnectionAccessPolicyCreateOrUpdateRequest }[];
    triggerConfigWrites: ConnectorTriggerConfigCreateOrUpdateRequest[];
}

function createAdapterFixture(options: AdapterFixtureOptions): AdapterFixture {
    const fixture: Omit<AdapterFixture, 'adapter'> = {
        tokenRequests: [],
        accessPolicies: { ...options.accessPolicies },
        policyWrites: [],
        triggerConfigWrites: [],
    };
    let triggerConfig = options.triggerConfig;
    const issueToken = async (request: unknown): Promise<string> => {
        fixture.tokenRequests.push(request);
        if (options.tokenError) {
            throw options.tokenError;
        }
        return nonNull(options.token);
    };
    const tokenProvider: ConnectorPollingTokenProvider = {
        getClientSecretToken: async (_context, request) => await issueToken({ kind: 'clientSecret', ...request }),
        getAzureCliToken: async (_context, request) => await issueToken({ kind: 'azureCli', ...request }),
    };
    const client: Partial<ConnectorGatewayClient> = {
        getConnectionAccessPolicy: async (_context, _rg, _ns, _conn, name) => fixture.accessPolicies[name],
        createOrUpdateConnectionAccessPolicy: async (_context, _rg, _ns, _conn, name, request) => {
            fixture.policyWrites.push({ name, request });
            fixture.accessPolicies[name] = { name, properties: { principal: request.properties.principal } };
            return fixture.accessPolicies[name];
        },
        getTriggerConfig: async () => triggerConfig,
        createOrUpdateTriggerConfig: async (_context, _rg, _ns, _name, request) => {
            fixture.triggerConfigWrites.push(request);
            triggerConfig = createTriggerConfigResource(request.tags);
            return triggerConfig;
        },
    };
    const resolver = {
        resolve: async (context: IActionContext) => Object.assign({}, context, { subscriptionId: target.subscription.id }),
    } as unknown as LiveConnectorSubscriptionResolver;
    const hostEnvironment = (): ConnectorHostEnvironment => ({
        processEnvironment: options.processEnvironment ?? {},
        terminalOverrides: options.terminalOverrides ?? {},
    });
    return {
        ...fixture,
        adapter: new AzureConnectorTriggerGatewayAdapter(
            client as ConnectorGatewayClient,
            resolver,
            async () => { throw new Error('unexpected resource group call'); },
            async () => { throw new Error('unexpected swagger call'); },
            async () => undefined,
            tokenProvider,
            hostEnvironment,
        ),
    };
}

function createDependencies(adapter: AzureConnectorTriggerGatewayAdapter): ConnectorTriggerF5Dependencies {
    const progressCancellation = new vscode.CancellationTokenSource();
    const setupCancellation = new vscode.CancellationTokenSource();
    let now = 0;
    const gateway: Partial<ConnectorTriggerGateway> = {
        ensureNamespace: async () => namespace,
        ensureConnection: async () => connection,
        getConnection: async () => connection,
        getConsentLink: async () => 'https://consent.example.invalid/',
        getPollingPrincipal: adapter.getPollingPrincipal.bind(adapter),
        ensureConnectionAccessPolicies: adapter.ensureConnectionAccessPolicies.bind(adapter),
        getTriggerConfig: adapter.getTriggerConfig.bind(adapter),
        createOrUpdateTriggerConfig: adapter.createOrUpdateTriggerConfig.bind(adapter),
    };
    return {
        bindingResolver: { find: async () => [binding], resolve: async () => binding },
        gateway: gateway as ConnectorTriggerGateway,
        projectStore: { read: async () => undefined, markComplete: async () => undefined },
        operationResolver: {
            resolveOperation: async () => ({ inputs: [] }),
            resolveDynamicInput: async () => ({}),
            serializeParameters: () => [],
        },
        workspaceIdentity: { get: async () => workspaceId },
        openSetup: async (_context, request) => ({
            cancellationToken: setupCancellation.token,
            selectResources: async () => ({
                target,
                namespace: { kind: 'existing', namespace },
                connection: { kind: 'existing', connection },
                triggerConfigName: 'trigger-config',
                localSettings: request.localSettings,
            }),
            collectParameters: async () => ({}),
            setStatus: () => undefined,
            dispose: () => {
                progressCancellation.dispose();
                setupCancellation.dispose();
            },
        }),
        runtime: {
            now: () => now++,
            delay: async () => undefined,
            openExternal: async () => true,
            withProgress: async (_title, task) => await task(progressCancellation.token),
        },
    };
}

function createTriggerConfigResource(tags: Readonly<Record<string, string>> | undefined): ConnectorTriggerConfigResource {
    return {
        id: 'trigger-config-id',
        name: 'trigger-config',
        tags,
        properties: {
            state: 'Enabled',
            pollingEndpoints: {
                receiveUri: 'https://poll.example.invalid/api/connectorGateways/gateway/triggerConfigs/trigger-config/receive',
            },
        },
    };
}

function toPolicyResource(policy: ConnectorTriggerConnectionAccessPolicy): ConnectorConnectionAccessPolicyResource {
    return { name: policy.name, properties: { principal: policy.principal } };
}

function assertNoAmbientCredentialSelection(): void {
    for (const name of ['AZURE_TOKEN_CREDENTIALS', `${connectionSettingName}__clientId`, `${connectionSettingName}__credential`]) {
        assert.strictEqual(process.env[name], undefined, `test requires ${name} to be unset`);
    }
}

function nonNull<T>(value: T | undefined): T {
    assert.ok(value);
    return value;
}
