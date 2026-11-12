/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type PipelineRequest, type PipelineResponse } from '@azure/core-rest-pipeline';
import {
    AzExtFsExtra,
    createTestActionContext,
    UserCancelledError,
    type IActionContext,
    type ISubscriptionContext,
} from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { type ConnectorGatewayClient } from '../src/commands/createFunction/connectorSteps/ConnectorGatewayClient';
import {
    type ConnectorConnectionAccessPolicyCreateOrUpdateRequest,
    type ConnectorConnectionAccessPolicyResource,
    type ConnectorConnectionCreateOrUpdateRequest,
    type ConnectorConnectionResource,
    type ConnectorGatewayProvisioningState,
    type ConnectorGatewayResource,
    type ConnectorTriggerConfigCreateOrUpdateRequest,
    type ConnectorTriggerConfigResource,
} from '../src/commands/createFunction/connectorSteps/ConnectorGatewayModels';
import {
    AzureConnectorTriggerGatewayAdapter,
    connectorTriggerOwnerTagKey,
    getConnectorAuthenticationSupport,
    LiveConnectorSubscriptionResolver,
    type ConnectorResourceGroupsClient,
} from '../src/debug/connectorNamespace/AzureConnectorTriggerF5Adapters';
import {
    ConnectorTriggerF5SetupError,
    createSuffixedConnectorResourceName,
    isSuffixedConnectorResourceName,
    type ConnectorTriggerConnection,
    type ConnectorTriggerConnectionAccessPolicy,
    type ConnectorTriggerF5Dependencies,
    type ConnectorTriggerGateway,
    type ConnectorTriggerHostCredentialConfiguration,
    type ConnectorTriggerHostLaunch,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerSetupTarget,
} from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { runConnectorTriggerF5Setup } from '../src/debug/connectorNamespace/connectorTriggerF5Setup';
import {
    isConnectorHostConflictingSettingName,
    parseConnectorTaskProbeOutput,
    planConnectorHostCredential,
    type ConnectorHostCredentialPlan,
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
const namespaceId = '/subscriptions/subscription-id/resourceGroups/resource-group/providers/Microsoft.Web/connectorGateways/namespace';
const namespace: ConnectorTriggerNamespace = {
    id: namespaceId,
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
const clientSecretValues = {
    [`${connectionSettingName}__tenantId`]: 'conn-tenant',
    [`${connectionSettingName}__clientId`]: 'conn-client',
    [`${connectionSettingName}__clientSecret`]: 'conn-secret',
};

function exactLaunch(environment: Record<string, string> = {}): ConnectorTriggerHostLaunch {
    return { kind: 'exactEnvironment', environment };
}

function taskLaunch(environment: Record<string, string> = {}): ConnectorTriggerHostLaunch {
    return { kind: 'task', execution: 'shell', environment };
}

const probePrincipal = {
    objectId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
};


suite('Connector Trigger task probe output', () => {
    test('accepts only a single oid/tid observation', () => {
        assert.deepStrictEqual(parseConnectorTaskProbeOutput(JSON.stringify({
            oid: probePrincipal.objectId, tid: probePrincipal.tenantId,
        })), probePrincipal);
        assert.deepStrictEqual(parseConnectorTaskProbeOutput(JSON.stringify({
            tid: probePrincipal.tenantId, oid: probePrincipal.objectId,
        })), probePrincipal);
        for (const output of [
            '', '{}', 'null', '[]',
            JSON.stringify({ oid: probePrincipal.objectId }),
            JSON.stringify({ oid: 'not-an-object-id', tid: probePrincipal.tenantId }),
            JSON.stringify({ oid: probePrincipal.objectId, tid: probePrincipal.tenantId, accessToken: 'secret' }),
            `${JSON.stringify({ oid: probePrincipal.objectId, tid: probePrincipal.tenantId })}\n{}`,
            `{"oid":"${probePrincipal.objectId}","oid":"${probePrincipal.objectId}","tid":"${probePrincipal.tenantId}"}`,
            `shell output\n${JSON.stringify({ oid: probePrincipal.objectId, tid: probePrincipal.tenantId })}`,
        ]) {
            assert.strictEqual(parseConnectorTaskProbeOutput(output), undefined);
        }
    });
});

/** `null` models a caller that does not know how the host will be launched. */
function hostCredential(
    connectionSettings: Record<string, string> = {},
    environment: Record<string, string> = {},
    launch: ConnectorTriggerHostLaunch | null = exactLaunch(),
    conflictingSettingNames: string[] = [],
): ConnectorTriggerHostCredentialConfiguration {
    return { connectionSettingName, connectionSettings, environment, conflictingSettingNames, launch: launch ?? undefined };
}

function createJwt(claims: Record<string, unknown>): string {
    const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
}

suite('Connector Trigger host credential planning', () => {
    const secretSettings = { tenantId: 'conn-tenant', clientId: 'conn-client', clientSecret: 'conn-secret' };

    test('connection-section client secret wins over DefaultAzureCredential settings', () => {
        const plan = planConnectorHostCredential(hostCredential(
            secretSettings,
            { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', AZURE_CLIENT_ID: 'env-client', AZURE_CLIENT_SECRET: 'env-secret', AZURE_TENANT_ID: 'env-tenant' },
        ));
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
            hostCredential(secretSettings, {}, exactLaunch({ AZURE_AUTHORITY_HOST: 'https://login.example.invalid/' })),
        );
        assert.strictEqual(plan.kind === 'clientSecret' && plan.authorityHost, 'https://login.example.invalid/');
    });

    test('launch environment takes precedence over local.settings.json values', () => {
        assert.deepStrictEqual(
            planConnectorHostCredential(hostCredential(
                {},
                { AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential' },
                exactLaunch({ AZURE_TOKEN_CREDENTIALS: ' azureclicredential ' }),
            )),
            { kind: 'azureCli', tenantId: undefined, environment: { AZURE_TOKEN_CREDENTIALS: ' azureclicredential ' } },
        );
        assert.deepStrictEqual(
            planConnectorHostCredential(hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' }, exactLaunch({ AZURE_TOKEN_CREDENTIALS: 'dev' }))),
            { kind: 'unsupported', reason: 'defaultCredentialChain' },
        );
    });

    test('Azure CLI uses the connection tenant before AZURE_TENANT_ID', () => {
        const environment = { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', AZURE_TENANT_ID: 'env-tenant' };
        assert.deepStrictEqual(
            planConnectorHostCredential(hostCredential({ tenantId: 'conn-tenant' }, environment)),
            { kind: 'azureCli', tenantId: 'conn-tenant', environment },
        );
        assert.deepStrictEqual(
            planConnectorHostCredential(hostCredential({}, environment)),
            { kind: 'azureCli', tenantId: 'env-tenant', environment },
        );
    });

    test('pinned EnvironmentCredential resolves to the environment client secret', () => {
        const plan = planConnectorHostCredential(hostCredential(
            {},
            { AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential', AZURE_TENANT_ID: 'env-tenant', AZURE_CLIENT_ID: 'env-client' },
            exactLaunch({ AZURE_CLIENT_SECRET: 'env-secret' }),
        ));
        assert.deepStrictEqual(plan, {
            kind: 'clientSecret',
            source: 'environmentCredential',
            tenantId: 'env-tenant',
            clientId: 'env-client',
            clientSecret: 'env-secret',
            authorityHost: 'https://login.microsoftonline.com/',
        });
    });

    const prefixedSetting = `AzureWebJobs${connectionSettingName}__clientId`;
    const failClosedCases: [string, ConnectorTriggerHostCredentialConfiguration, ConnectorHostCredentialPlan][] = [
        ['an unknown launch', hostCredential(secretSettings, {}, null), { kind: 'unsupported', reason: 'launchUnknown' }],
        [
            'a task that selects a conflicting credential',
            hostCredential(secretSettings, {}, taskLaunch({ AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential' })),
            { kind: 'unsupported', reason: 'unverifiedTaskLaunch' },
        ],
        [
            'a task whose credential settings are not observed in its own process',
            hostCredential(secretSettings, {}, taskLaunch()),
            { kind: 'unsupported', reason: 'unverifiedTaskLaunch' },
        ],
        [
            'a local AzureWebJobs-prefixed section',
            hostCredential(secretSettings, {}, exactLaunch(), [prefixedSetting]),
            { kind: 'unsupported', reason: 'conflictingConnectionSection', settingNames: [prefixedSetting] },
        ],
        [
            'a local ConnectionStrings entry',
            hostCredential(secretSettings, {}, exactLaunch(), [`ConnectionStrings:${connectionSettingName}`]),
            { kind: 'unsupported', reason: 'conflictingConnectionSection', settingNames: [`ConnectionStrings:${connectionSettingName}`] },
        ],
        [
            'a prefixed section in the launch environment',
            hostCredential(secretSettings, {}, exactLaunch({ [prefixedSetting]: 'other' })),
            { kind: 'unsupported', reason: 'conflictingConnectionSection', settingNames: [prefixedSetting] },
        ],
        [
            'a CUSTOMCONNSTR_ launch variable',
            hostCredential(secretSettings, {}, exactLaunch({ [`CUSTOMCONNSTR_${connectionSettingName}`]: 'other' })),
            { kind: 'unsupported', reason: 'conflictingConnectionSection', settingNames: [`CUSTOMCONNSTR_${connectionSettingName}`] },
        ],
        [
            'a colon-form launch variable',
            hostCredential(secretSettings, {}, exactLaunch({ [`${connectionSettingName}:clientId`]: 'other' })),
            { kind: 'unsupported', reason: 'conflictingConnectionSection', settingNames: [`${connectionSettingName}:clientId`] },
        ],
        ['unpinned DefaultAzureCredential', hostCredential(), { kind: 'unsupported', reason: 'defaultCredentialChain' }],
        ['DefaultAzureCredential with only a client ID', hostCredential({ clientId: 'c' }), { kind: 'unsupported', reason: 'defaultCredentialChain' }],
        ['dev credential chain', hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'dev' }), { kind: 'unsupported', reason: 'defaultCredentialChain' }],
        ['prod credential chain', hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'prod' }), { kind: 'unsupported', reason: 'defaultCredentialChain' }],
        ['pinned managed identity', hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'ManagedIdentityCredential' }), { kind: 'unsupported', reason: 'unsupportedTokenCredentialsSelection' }],
        ['explicit managed identity credential', hostCredential({ credential: 'managedidentity', clientId: 'c' }), { kind: 'unsupported', reason: 'explicitCredentialType' }],
        ['explicit credential beats client secret', hostCredential({ credential: 'workloadidentity', ...secretSettings }), { kind: 'unsupported', reason: 'explicitCredentialType' }],
        ['client certificate', hostCredential({ tenantId: 't', clientId: 'c', clientCertificate: 'thumbprint' }), { kind: 'unsupported', reason: 'clientCertificate' }],
        ['managedIdentityObjectId without credential', hostCredential({ managedIdentityObjectId: 'o' }), { kind: 'unsupported', reason: 'invalidConnectionSettings' }],
        ['azureCloud setting', hostCredential({ azureCloud: 'AzureChinaCloud', ...secretSettings }), { kind: 'unsupported', reason: 'azureCloudSetting' }],
        [
            'incomplete EnvironmentCredential',
            hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential', AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c' }),
            { kind: 'unsupported', reason: 'environmentCredentialIncomplete' },
        ],
        [
            'EnvironmentCredential tenant conflict',
            hostCredential({ tenantId: 'conn-tenant' }, { AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential', AZURE_TENANT_ID: 'env-tenant', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's' }),
            { kind: 'unsupported', reason: 'environmentCredentialTenantConflict' },
        ],
    ];
    for (const [name, credential, expected] of failClosedCases) {
        test(`fails closed for ${name}`, () => {
            assert.deepStrictEqual(planConnectorHostCredential(credential), expected);
        });
    }

    test('recognizes the configuration sections the WebJobs host reads for a connection', () => {
        const conflicting = [
            `AzureWebJobs${connectionSettingName}`,
            `azurewebjobs${connectionSettingName.toLowerCase()}__clientSecret`,
            `ConnectionStrings:${connectionSettingName}`,
            `ConnectionStrings__AzureWebJobs${connectionSettingName}`,
            `CUSTOMCONNSTR_${connectionSettingName}`,
            `SQLCONNSTR_AzureWebJobs${connectionSettingName}`,
            `${connectionSettingName}:clientId`,
        ];
        const unrelated = [
            `${connectionSettingName}__clientId`,
            `${connectionSettingName}Other:clientId`,
            `AzureWebJobs${connectionSettingName}Other`,
            `ConnectionStrings:${connectionSettingName}Other`,
            'AzureWebJobsStorage',
        ];
        for (const name of conflicting) {
            assert.ok(isConnectorHostConflictingSettingName(name, connectionSettingName), name);
        }
        for (const name of unrelated) {
            assert.ok(!isConnectorHostConflictingSettingName(name, connectionSettingName), name);
        }
    });
});

suite('Connector Trigger polling principal', () => {
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

    test('runs Azure CLI with the host tenant and exact launch environment', async () => {
        const fixture = createAdapterFixture({ token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }) });

        const principal = await fixture.adapter.getPollingPrincipal(
            await createTestActionContext(),
            target,
            hostCredential({}, { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', AZURE_TENANT_ID: 'host-tenant' }, exactLaunch({ PATH: 'launch-path' })),
        );

        assert.deepStrictEqual(principal, hostPrincipal);
        assert.deepStrictEqual(fixture.tokenRequests, [{
            kind: 'azureCli',
            tenantId: 'host-tenant',
            environment: { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', AZURE_TENANT_ID: 'host-tenant', PATH: 'launch-path' },
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

    for (const execution of ['shell', 'process'] as const) {
    test(`fails closed for an unverified ${execution} task credential without exposing its value`, async () => {
        const fixture = createAdapterFixture({ token: createJwt({ oid: 'unused', tid: 'unused' }) });
        const context = await createTestActionContext();

        await assert.rejects(
            fixture.adapter.getPollingPrincipal(
                context,
                target,
                hostCredential({ tenantId: 't', clientId: 'c', clientSecret: 's' }, {},
                    { kind: 'task', execution, environment: { AZURE_TOKEN_CREDENTIALS: 'task-conflict', UNRELATED: 'value' } }),
            ),
            (error: unknown) => error instanceof ConnectorTriggerF5SetupError &&
                error.message.includes('same execution context') &&
                !error.message.includes('task-conflict') &&
                !error.message.includes('UNRELATED'),
        );
        assert.deepStrictEqual(fixture.tokenRequests, []);
        assert.ok(context.valuesToMask.includes('task-conflict'));
        assert.strictEqual(context.telemetry.properties.connectorF5PollingCredential, 'unverifiedTaskLaunch');
    });
    }

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
});

suite('Connector Trigger subscription resolution', () => {
    test('matches tenant, cloud and endpoint among duplicate subscription IDs', async () => {
        const resolver = new LiveConnectorSubscriptionResolver(async () => [
            subscriptionCandidate({ tenantId: 'other-tenant', accountId: 'account-x' }),
            subscriptionCandidate({ name: 'AzureUSGovernment', endpoint: 'https://management.usgovcloudapi.net/', accountId: 'account-y' }),
            subscriptionCandidate({ tenantId: 'SELECTED-TENANT', name: 'AzurePublicCloud', accountId: 'account-a' }),
        ]);
        const context = await createTestActionContext();

        const resolved = await resolver.resolve(context, target);

        assert.strictEqual(getCandidateAccountId(resolved), 'account-a');
        assert.ok(context.valuesToMask.includes('account-a'));
    });

    test('uses the selected account when the subscription is listed under several accounts', async () => {
        const resolver = new LiveConnectorSubscriptionResolver(async () => [
            subscriptionCandidate({ accountId: 'account-a' }),
            subscriptionCandidate({ accountId: 'account-b' }),
        ]);

        const resolved = await resolver.resolve(await createTestActionContext(), {
            ...target,
            subscription: { ...target.subscription, accountId: 'account-b' },
        });

        assert.strictEqual(getCandidateAccountId(resolved), 'account-b');
    });

    test('refuses to pick an account when the selection does not identify one', async () => {
        const resolver = new LiveConnectorSubscriptionResolver(async () => [
            subscriptionCandidate({ accountId: 'account-a' }),
            subscriptionCandidate({ accountId: 'account-b' }),
        ]);
        const context = await createTestActionContext();

        await assert.rejects(
            resolver.resolve(context, target),
            (error: unknown) => error instanceof ConnectorTriggerF5SetupError && /more than one signed-in Azure account/.test(error.message),
        );
        assert.strictEqual(context.telemetry.properties.connectorF5SubscriptionAmbiguous, 'true');
    });

    test('fails when no signed-in subscription matches the selected identity', async () => {
        const resolver = new LiveConnectorSubscriptionResolver(async () => [
            subscriptionCandidate({ tenantId: 'other-tenant' }),
            subscriptionCandidate({ endpoint: 'https://management.example.invalid/' }),
        ]);

        await assert.rejects(resolver.resolve(await createTestActionContext(), target), /not available in the current Azure sign-in/);
        await assert.rejects(
            new LiveConnectorSubscriptionResolver(async () => [subscriptionCandidate({ accountId: 'account-a' })])
                .resolve(await createTestActionContext(), { ...target, subscription: { ...target.subscription, accountId: 'account-b' } }),
            /not available in the current Azure sign-in/,
        );
    });
});

suite('Connector Trigger namespace setup', () => {
    const createPlan = { kind: 'create', resourceGroupName: 'resource-group', namespaceName: 'namespace' } as const;

    for (const status of [409, 412]) {
        test(`recovers a namespace created concurrently (HTTP ${status})`, async () => {
            const fixture = createNamespaceFixture({
                getNamespace: [undefined, namespaceResource('Succeeded')],
                createError: httpError(status),
            });
            const context = await createTestActionContext();

            assert.deepStrictEqual(await fixture.adapter.ensureNamespace(context, target, createPlan), namespace);
            assert.strictEqual(fixture.createCalls, 1);
            assert.strictEqual(context.telemetry.properties.connectorF5NamespaceCreateConflict, 'true');
        });
    }

    test('does not adopt a namespace after a non-conflict create failure', async () => {
        const createError = httpError(500);
        const fixture = createNamespaceFixture({
            getNamespace: [undefined, namespaceResource('Succeeded')],
            createError,
        });

        await assert.rejects(fixture.adapter.ensureNamespace(await createTestActionContext(), target, createPlan), error => error === createError);
        assert.strictEqual(fixture.getCalls, 1);
    });

    for (const state of ['Failed', 'InProgress'] as const) {
        test(`rejects an existing namespace whose provisioning state is ${state}`, async () => {
            const fixture = createNamespaceFixture({ getNamespace: [namespaceResource(state)] });

            await assert.rejects(
                fixture.adapter.ensureNamespace(await createTestActionContext(), target, createPlan),
                (error: unknown) => error instanceof ConnectorTriggerF5SetupError && /not ready/.test(error.message) && error.message.includes(state),
            );
            assert.strictEqual(fixture.createCalls, 0);
        });
    }

    test('rejects a concurrently created namespace that failed to provision', async () => {
        const fixture = createNamespaceFixture({
            getNamespace: [undefined, namespaceResource('Failed')],
            createError: httpError(409),
        });

        await assert.rejects(fixture.adapter.ensureNamespace(await createTestActionContext(), target, createPlan), /not ready/);
    });

    test('rejects a created namespace that failed to provision', async () => {
        const fixture = createNamespaceFixture({ getNamespace: [undefined], created: namespaceResource('Failed') });

        await assert.rejects(fixture.adapter.ensureNamespace(await createTestActionContext(), target, createPlan), /not ready/);
    });

    test('stops before any mutation when setup is cancelled', async () => {
        const cancellation = new vscode.CancellationTokenSource();
        const fixture = createNamespaceFixture({ getNamespace: [undefined], onGetNamespace: () => cancellation.cancel() });

        await assert.rejects(
            fixture.adapter.ensureNamespace(await createTestActionContext(), target, createPlan, { cancellationToken: cancellation.token }),
            UserCancelledError,
        );
        assert.strictEqual(fixture.providerChecks, 0);
        assert.strictEqual(fixture.resourceGroupCreates, 0);
        assert.strictEqual(fixture.createCalls, 0);
        cancellation.dispose();
    });

    test('stops before creating the resource group when cancelled during lookup', async () => {
        const cancellation = new vscode.CancellationTokenSource();
        const fixture = createNamespaceFixture({
            getNamespace: [undefined],
            resourceGroupMissing: true,
            onGetResourceGroup: () => cancellation.cancel(),
        });

        await assert.rejects(
            fixture.adapter.ensureNamespace(await createTestActionContext(), target, createPlan, { cancellationToken: cancellation.token }),
            UserCancelledError,
        );
        assert.strictEqual(fixture.resourceGroupCreates, 0);
        assert.strictEqual(fixture.createCalls, 0);
        cancellation.dispose();
    });

    test('passes the cancellation token to namespace requests', async () => {
        const cancellation = new vscode.CancellationTokenSource();
        const fixture = createNamespaceFixture({ getNamespace: [undefined], created: namespaceResource('Succeeded') });

        await fixture.adapter.ensureNamespace(await createTestActionContext(), target, createPlan, { cancellationToken: cancellation.token });

        assert.ok(fixture.tokens.length > 0);
        assert.ok(fixture.tokens.every(token => token === cancellation.token));
        cancellation.dispose();
    });
});

suite('Connector Trigger connection setup', () => {
    const plannedName = 'office365-0123456789';
    const createPlan = { kind: 'create', connectionName: plannedName } as const;
    const options = { ownerWorkspaceId: workspaceId };

    test('creates an OAuth connection at the planned name with the workspace owner tag', async () => {
        const fixture = createConnectionFixture({ metadata: oauthMetadata() });

        const created = await fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, options);

        assert.strictEqual(created.name, plannedName);
        assert.strictEqual(created.ownerWorkspaceId, workspaceId);
        assert.deepStrictEqual(fixture.creates.map(create => create.name), [plannedName]);
        assert.deepStrictEqual(fixture.creates[0].request.tags, { [connectorTriggerOwnerTagKey]: workspaceId });
        assert.strictEqual(fixture.creates[0].createOnly, true);
        assert.strictEqual(fixture.metadataRequests.length, 1);
        assert.match(fixture.metadataRequests[0], /\/providers\/Microsoft\.Web\/locations\/eastus\/managedApis\/office365\?api-version=2016-06-01$/);
    });

    test('reuses its own connection when a concurrent setup for this workspace created it first', async () => {
        const fixture: ConnectionFixture = createConnectionFixture({
            metadata: oauthMetadata(),
            onMetadata: () => fixture.connections.set(plannedName, connectionResource(plannedName, workspaceId)),
        });

        const reused = await fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, options);

        assert.strictEqual(reused.name, plannedName);
        assert.deepStrictEqual(fixture.creates, []);
    });

    test('never overwrites a connection another workspace created after the existence check', async () => {
        const fixture: ConnectionFixture = createConnectionFixture({
            metadata: oauthMetadata(),
            onMetadata: () => fixture.connections.set(plannedName, connectionResource(plannedName, 'other-workspace')),
        });

        await assert.rejects(
            fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, options),
            /Another connection with the same name was created/,
        );
        assert.deepStrictEqual(fixture.creates, []);
        assert.strictEqual(fixture.connections.get(plannedName)?.tags?.[connectorTriggerOwnerTagKey], 'other-workspace');
    });

    test('reuses a connection this workspace created at the planned name', async () => {
        const fixture = createConnectionFixture({ connections: [connectionResource(plannedName, workspaceId)] });

        const reused = await fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, options);

        assert.strictEqual(reused.name, plannedName);
        assert.deepStrictEqual(fixture.creates, []);
        assert.deepStrictEqual(fixture.metadataRequests, []);
    });

    test('creates a hex-suffixed connection instead of adopting one owned by someone else', async () => {
        const fixture = createConnectionFixture({
            connections: [connectionResource(plannedName, 'other-workspace')],
            metadata: oauthMetadata(),
            suffixes: ['a1b2c3'],
        });
        const context = await createTestActionContext();

        const created = await fixture.adapter.ensureConnection(context, target, namespace, createPlan, options);

        assert.strictEqual(created.name, `${plannedName}-a1b2c3`);
        assert.deepStrictEqual(fixture.creates.map(create => create.name), [`${plannedName}-a1b2c3`]);
        assert.deepStrictEqual(fixture.creates[0].request.tags, { [connectorTriggerOwnerTagKey]: workspaceId });
        assert.strictEqual(fixture.connections.get(plannedName)?.tags?.[connectorTriggerOwnerTagKey], 'other-workspace');
        assert.strictEqual(context.telemetry.properties.connectorF5ConnectionNameSuffixed, 'true');
    });

    test('does not adopt an untagged connection or one for another connector at the planned name', async () => {
        for (const existing of [connectionResource(plannedName, undefined), connectionResource(plannedName, workspaceId, 'teams')]) {
            const fixture = createConnectionFixture({ connections: [existing], metadata: oauthMetadata(), suffixes: ['d4e5f6'] });

            const created = await fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, options);

            assert.strictEqual(created.name, `${plannedName}-d4e5f6`);
        }
    });

    test('reuses the suffixed connection an earlier setup for this workspace created', async () => {
        const fixture = createConnectionFixture({
            connections: [
                connectionResource(plannedName, 'other-workspace'),
                connectionResource(`${plannedName}-0f0f0f`, 'other-workspace'),
                connectionResource(`${plannedName}-abcdef`, workspaceId),
            ],
        });

        const reused = await fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, options);

        assert.strictEqual(reused.name, `${plannedName}-abcdef`);
        assert.deepStrictEqual(fixture.creates, []);
    });

    test('skips suffixed names that are already taken', async () => {
        const fixture = createConnectionFixture({
            connections: [connectionResource(plannedName, 'other-workspace'), connectionResource(`${plannedName}-111111`, 'other-workspace')],
            metadata: oauthMetadata(),
            suffixes: ['111111', '222222'],
        });

        const created = await fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, options);

        assert.strictEqual(created.name, `${plannedName}-222222`);
    });

    test('creates nothing when no unused suffixed name is found', async () => {
        const suffixes = ['000001', '000002', '000003', '000004', '000005'];
        const fixture = createConnectionFixture({
            connections: [plannedName, ...suffixes.map(suffix => `${plannedName}-${suffix}`)].map(name => connectionResource(name, 'other-workspace')),
            metadata: oauthMetadata(),
            suffixes,
        });

        await assert.rejects(
            fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, options),
            /Could not find an unused connector connection name/,
        );
        assert.deepStrictEqual(fixture.creates, []);
    });

    const unsupportedMetadata: [string, { status: number; body?: unknown }, RegExp][] = [
        [
            'an API key parameter',
            { status: 200, body: { properties: { connectionParameters: { api_key: { type: 'securestring', uiDefinition: { constraints: { required: 'true' } } } } } } },
            /cannot collect/,
        ],
        [
            'a parameter without an optional marker',
            { status: 200, body: { properties: { connectionParameters: { server: { type: 'string' }, token: { type: 'oauthSetting' } } } } },
            /cannot collect/,
        ],
        [
            'multiple authentication types',
            { status: 200, body: { properties: { connectionParameterSets: { values: [{ name: 'oauth' }, { name: 'key' }] } } } },
            /cannot collect/,
        ],
        ['unreadable metadata', { status: 404 }, /Could not load the authentication settings/],
    ];
    for (const [name, metadata, message] of unsupportedMetadata) {
        test(`creates no connection for a connector with ${name}`, async () => {
            const fixture = createConnectionFixture({ metadata });

            await assert.rejects(
                fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, options),
                (error: unknown) => error instanceof ConnectorTriggerF5SetupError && message.test(error.message) && /No connection was created/.test(error.message),
            );
            assert.deepStrictEqual(fixture.creates, []);
        });
    }

    test('does not create a connection when setup is cancelled before the create', async () => {
        const cancellation = new vscode.CancellationTokenSource();
        const fixture = createConnectionFixture({ metadata: oauthMetadata(), onMetadata: () => cancellation.cancel() });

        await assert.rejects(
            fixture.adapter.ensureConnection(await createTestActionContext(), target, namespace, createPlan, { ...options, cancellationToken: cancellation.token }),
            UserCancelledError,
        );
        assert.deepStrictEqual(fixture.creates, []);
        cancellation.dispose();
    });

    test('classifies connector authentication metadata', () => {
        const optional = { type: 'string', uiDefinition: { constraints: { required: 'false' } } };
        assert.strictEqual(getConnectorAuthenticationSupport({ properties: {} }), 'none');
        assert.strictEqual(getConnectorAuthenticationSupport({ properties: { connectionParameters: { token: { type: 'oauthSetting' } } } }), 'oauth');
        assert.strictEqual(getConnectorAuthenticationSupport({ properties: { connectionParameters: { token: { type: 'oauthSetting' }, extra: optional } } }), 'oauth');
        assert.strictEqual(getConnectorAuthenticationSupport({ properties: { connectionParameterSets: { values: [] }, connectionParameters: {} } }), 'none');
        assert.strictEqual(getConnectorAuthenticationSupport({ properties: { connectionParameters: { key: { type: 'securestring' } } } }), 'unsupported');
        assert.strictEqual(getConnectorAuthenticationSupport({ properties: { connectionParameterSets: [] } }), 'unsupported');
        assert.strictEqual(getConnectorAuthenticationSupport(undefined), 'unknown');
        assert.strictEqual(getConnectorAuthenticationSupport({ properties: { connectionParameters: 'invalid' } }), 'unknown');
        assert.strictEqual(getConnectorAuthenticationSupport({ properties: { connectionParameters: { token: 'invalid' } } }), 'unknown');
    });
});

suite('Connector resource name suffixes', () => {
    test('creates six-hex-character suffixes that are recognized only for their base name', () => {
        const name = createSuffixedConnectorResourceName('trigger-config');
        assert.match(name, /^trigger-config-[0-9a-f]{6}$/);
        assert.ok(isSuffixedConnectorResourceName(name, 'trigger-config'));
        assert.ok(isSuffixedConnectorResourceName('TRIGGER-CONFIG-ABCDEF', 'trigger-config'));
        for (const candidate of [undefined, 'trigger-config', 'trigger-config-abcdeg', 'trigger-config-abcde', 'trigger-config-abcdef0', 'other-config-abcdef', 'trigger-config-x-abcdef']) {
            assert.ok(!isSuffixedConnectorResourceName(candidate, 'trigger-config'), String(candidate));
        }
    });
});

suite('Connector Trigger access policies and Trigger Config', () => {
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

    test('stops granting policies once setup is cancelled', async () => {
        const cancellation = new vscode.CancellationTokenSource();
        const fixture = createAdapterFixture({ onPolicyWrite: () => cancellation.cancel() });
        const policy = (name: string): ConnectorTriggerConnectionAccessPolicy => ({
            name,
            principal: { type: 'ActiveDirectory', identity: { objectId: 'host-object-id', tenantId: 'host-tenant' } },
        });

        await assert.rejects(
            fixture.adapter.ensureConnectionAccessPolicies(
                await createTestActionContext(),
                target,
                namespace,
                connection,
                [policy('first'), policy('second')],
                { cancellationToken: cancellation.token },
            ),
            UserCancelledError,
        );
        assert.deepStrictEqual(fixture.policyWrites.map(write => write.name), ['first']);
        cancellation.dispose();
    });

    test('persists and reads the Trigger Config owner marker', async () => {
        const fixture = createAdapterFixture({});
        const context = await createTestActionContext();

        assert.strictEqual(await fixture.adapter.getTriggerConfig(context, target, namespace, 'trigger-config'), undefined);
        const created = await fixture.adapter.createOrUpdateTriggerConfig(context, triggerConfigRequest());

        assert.deepStrictEqual(fixture.triggerConfigWrites[0].request.tags, { [connectorTriggerOwnerTagKey]: workspaceId });
        assert.strictEqual(created.ownerWorkspaceId, workspaceId);
        assert.strictEqual((await fixture.adapter.getTriggerConfig(context, target, namespace, 'trigger-config'))?.ownerWorkspaceId, workspaceId);
    });

    test('does not write a Trigger Config after setup is cancelled', async () => {
        const cancellation = new vscode.CancellationTokenSource();
        cancellation.cancel();
        const fixture = createAdapterFixture({});

        await assert.rejects(
            fixture.adapter.createOrUpdateTriggerConfig(await createTestActionContext(), triggerConfigRequest(), { cancellationToken: cancellation.token }),
            UserCancelledError,
        );
        assert.deepStrictEqual(fixture.triggerConfigWrites, []);
        cancellation.dispose();
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

    for (const { execution, source } of (['shell', 'process', 'custom'] as const).flatMap(execution =>
        (['unset', 'environment', 'file', 'connectionSecret', 'conflictingPin', 'shadowedLayer'] as const).map(source => ({ execution, source })))) {
        test(`rejects an unverified ${execution} task with ${source} credentials before any setup side effects`, async () => {
            const original = JSON.stringify(settingsFile(source === 'file' ?
                { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' } :
                source === 'connectionSecret' ? clientSecretValues : {}));
            await fs.promises.writeFile(settingsPath, original);
            const fixture = createAdapterFixture({ token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }) });
            const launch: ConnectorTriggerHostLaunch = {
                kind: 'task',
                execution,
                environment: source === 'conflictingPin' ? { AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential' } :
                    source === 'environment' || source === 'shadowedLayer' ? { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' } : {},
                environmentLayers: source === 'shadowedLayer' ?
                    [{ AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential' }, { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' }] : [],
            };
            const dependencies = createDependencies(fixture.adapter, launch);
            const unexpected = async (): Promise<never> => assert.fail('Unverified tasks cannot start setup.');
            dependencies.openSetup = unexpected;
            dependencies.workspaceIdentity = { get: unexpected };
            dependencies.localSettingsWriter = { write: unexpected };
            const context = await createTestActionContext();

            await assert.rejects(runConnectorTriggerF5Setup(
                context, projectPath, undefined, binding, dependencies,
            ), /same execution context/);

            assert.deepStrictEqual(fixture.tokenRequests, []);
            assert.deepStrictEqual(fixture.policyWrites, []);
            assert.deepStrictEqual(fixture.triggerConfigWrites, []);
            assert.strictEqual(context.telemetry.properties.connectorF5SetupBlocked, 'unverifiedTaskLaunch');
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
        });
    }

    test('refuses encrypted exact-launch settings before any grants or settings writes', async () => {
        const original = JSON.stringify({ IsEncrypted: true, Values: {} });
        await fs.promises.writeFile(settingsPath, original);
        const fixture = createAdapterFixture({});

        await assert.rejects(runConnectorTriggerF5Setup(
            await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter),
        ), /Decrypt local.settings.json/);

        assert.deepStrictEqual(fixture.tokenRequests, []);
        assert.deepStrictEqual(fixture.policyWrites, []);
        assert.deepStrictEqual(fixture.triggerConfigWrites, []);
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
    });

    test('preserves connection-section secret precedence without adding a host-wide credential pin', async () => {
        await writeSettings(clientSecretValues);
        const fixture = createAdapterFixture({ token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }) });

        await runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding,
            createDependencies(fixture.adapter));

        assert.strictEqual((fixture.tokenRequests[0] as { kind: string }).kind, 'clientSecret');
        assert.strictEqual((await readSettings()).AZURE_TOKEN_CREDENTIALS, undefined);
    });

    test('does not add a canonical pin when a differently cased file key exists', async () => {
        await writeSettings({ ...clientSecretValues, azure_token_credentials: 'AzureCliCredential' });
        const fixture = createAdapterFixture({ token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }) });

        await runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding,
            createDependencies(fixture.adapter));

        const values = await readSettings();
        assert.strictEqual(values.azure_token_credentials, 'AzureCliCredential');
        assert.strictEqual(values.AZURE_TOKEN_CREDENTIALS, undefined);
    });

    test('grants nothing when a file credential changes during identity resolution', async () => {
        await writeSettings({});
        const fixture = createAdapterFixture({
            token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }),
            beforeToken: async () => await writeSettings({ AZURE_TENANT_ID: 'changed-tenant' }),
        });

        await assert.rejects(runConnectorTriggerF5Setup(
            await createTestActionContext(), projectPath, undefined, binding,
            createDependencies(fixture.adapter, exactLaunch({ AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' })),
        ), /credential settings in local.settings.json changed/);

        assert.deepStrictEqual(fixture.policyWrites, []);
        assert.deepStrictEqual(fixture.triggerConfigWrites, []);
        assert.deepStrictEqual(await readSettings(), { AZURE_TENANT_ID: 'changed-tenant' });
    });

    const zeroGrantCases: { name: string; settings: object; launch: ConnectorTriggerHostLaunch | null; message: RegExp; secrets: string[] }[] = [
        {
            name: 'the host would use the unpinned default chain',
            settings: settingsFile({}),
            launch: exactLaunch(),
            message: /DefaultAzureCredential/,
            secrets: [],
        },
        {
            name: 'local.settings.json has an AzureWebJobs-prefixed connection setting',
            settings: settingsFile({ ...clientSecretValues, [`AzureWebJobs${connectionSettingName}__clientId`]: 'prefixed-client' }),
            launch: exactLaunch(),
            message: new RegExp(`AzureWebJobs${connectionSettingName}__clientId`),
            secrets: ['prefixed-client', 'conn-secret'],
        },
        {
            name: 'local.settings.json has a ConnectionStrings entry for the connection',
            settings: { ...settingsFile(clientSecretValues), ConnectionStrings: { [connectionSettingName]: 'connection-string-secret' } },
            launch: exactLaunch(),
            message: new RegExp(`ConnectionStrings:${connectionSettingName}`),
            secrets: ['connection-string-secret', 'conn-secret'],
        },
        {
            name: 'the launch environment has a prefixed connection section',
            settings: settingsFile(clientSecretValues),
            launch: exactLaunch({ [`AzureWebJobs${connectionSettingName}__clientSecret`]: 'launch-secret' }),
            message: new RegExp(`AzureWebJobs${connectionSettingName}__clientSecret`),
            secrets: ['launch-secret', 'conn-secret'],
        },
        {
            name: 'the host task is unverified even with connection credentials',
            settings: settingsFile(clientSecretValues),
            launch: taskLaunch({ AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential' }),
            message: /same execution context/,
            secrets: ['conn-secret'],
        },
        {
            name: 'the host launch is unknown',
            settings: settingsFile(clientSecretValues),
            launch: null,
            message: /does not know how the local Functions host will be started/,
            secrets: ['conn-secret'],
        },
        {
            name: 'the launch environment unpins the credential selected in local.settings.json',
            settings: settingsFile({ AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' }),
            launch: exactLaunch({ AZURE_TOKEN_CREDENTIALS: 'dev' }),
            message: /DefaultAzureCredential/,
            secrets: [],
        },
    ];
    for (const testCase of zeroGrantCases) {
        test(`grants nothing and writes nothing when ${testCase.name}`, async () => {
            const original = JSON.stringify(testCase.settings);
            await fs.promises.writeFile(settingsPath, original);
            const fixture = createAdapterFixture({ token: createJwt({ oid: 'unused', tid: 'unused' }) });

            await assert.rejects(
                runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter, testCase.launch)),
                (error: unknown) => error instanceof Error &&
                    /No connection access was granted|requires AZURE_TOKEN_CREDENTIALS/.test(error.message) &&
                    testCase.message.test(error.message) &&
                    testCase.secrets.every(secret => !error.message.includes(secret)),
            );
            assert.deepStrictEqual(fixture.tokenRequests, []);
            assert.deepStrictEqual(fixture.policyWrites, []);
            assert.deepStrictEqual(fixture.triggerConfigWrites, []);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
        });
    }

    for (const credentialKind of ['connectionSettings', 'environmentCredential', 'azureCli'] as const) {
        test(`rejects a ${credentialKind} task launch whose environment was not observed in its own process`, async () => {
            const values = credentialKind === 'connectionSettings' ? {
                ...clientSecretValues,
                [`${connectionSettingName}__tenantId`]: probePrincipal.tenantId,
            } : {};
            await writeSettings(values);
            const environment: Record<string, string> = credentialKind === 'environmentCredential' ? {
                AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential',
                AZURE_TENANT_ID: probePrincipal.tenantId,
                AZURE_CLIENT_ID: '33333333-3333-3333-3333-333333333333',
                AZURE_CLIENT_SECRET: 'synthetic-secret',
            } : { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' };
            const fixture = createAdapterFixture({});
            const context = await createTestActionContext();
            const original = await fs.promises.readFile(settingsPath, 'utf8');

            await assert.rejects(runConnectorTriggerF5Setup(context, projectPath, undefined, binding,
                createDependencies(fixture.adapter, taskLaunch(environment))),
                /same execution context/);

            assert.deepStrictEqual(fixture.tokenRequests, []);
            assert.deepStrictEqual(fixture.policyWrites, []);
            assert.deepStrictEqual(fixture.triggerConfigWrites, []);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
        });
    }

    for (const [name, launch] of [
        ['missing launch', null],
        ['an Azure CLI pin', taskLaunch({ AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' })],
        ['no credential selector', taskLaunch()],
        ['tenant mismatch', taskLaunch({
            AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential',
            AZURE_TENANT_ID: '44444444-4444-4444-4444-444444444444',
        })],
    ] as const) {
        test(`grants nothing and writes nothing for an unobserved task with ${name}`, async () => {
            const original = JSON.stringify(settingsFile({}));
            await fs.promises.writeFile(settingsPath, original);
            const fixture = createAdapterFixture({});

            await assert.rejects(runConnectorTriggerF5Setup(
                await createTestActionContext(), projectPath, undefined, binding,
                createDependencies(fixture.adapter, launch),
            ));

            assert.deepStrictEqual(fixture.tokenRequests, []);
            assert.deepStrictEqual(fixture.policyWrites, []);
            assert.deepStrictEqual(fixture.triggerConfigWrites, []);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
        });
    }

    test('grants the host token principal, not the connection creator, and records the owner', async () => {
        await writeSettings(clientSecretValues);
        const fixture = createAdapterFixture({ token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }) });

        await runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter));

        assert.deepStrictEqual(fixture.tokenRequests, [{
            kind: 'clientSecret',
            tenantId: 'conn-tenant',
            clientId: 'conn-client',
            clientSecret: 'conn-secret',
            authorityHost: 'https://login.microsoftonline.com/',
        }]);
        const granted = fixture.policyWrites.map(write => write.request.properties.principal.identity.objectId);
        assert.ok(granted.includes(hostPrincipal.objectId));
        assert.ok(!granted.includes(nonNull(connection.createdBy?.objectId)));
        assert.deepStrictEqual(fixture.triggerConfigWrites[0].request.tags, { [connectorTriggerOwnerTagKey]: workspaceId });
        assert.strictEqual(fixture.triggerConfigWrites[0].createOnly, true);
        assert.strictEqual((await readSettings())[binding.triggerConfigSettingName], 'trigger-config');
    });

    test('writes no settings when another Trigger Config with the new name is created concurrently', async () => {
        const original = JSON.stringify(settingsFile(clientSecretValues));
        await fs.promises.writeFile(settingsPath, original);
        const fixture = createAdapterFixture({
            token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }),
            triggerConfigCreateRaced: true,
        });

        await assert.rejects(
            runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter)),
            /Another Trigger Config with the same name was created/,
        );
        assert.deepStrictEqual(fixture.triggerConfigWrites, []);
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
    });

    test('authorizes the Azure CLI identity selected by the exact launch environment over local.settings.json', async () => {
        await writeSettings({ AZURE_TOKEN_CREDENTIALS: 'dev', AZURE_TENANT_ID: 'file-tenant' });
        const fixture = createAdapterFixture({ token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }) });

        await runConnectorTriggerF5Setup(
            await createTestActionContext(),
            projectPath,
            undefined,
            binding,
            createDependencies(fixture.adapter, exactLaunch({ AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' })),
        );

        assert.deepStrictEqual(fixture.tokenRequests, [{
            kind: 'azureCli',
            tenantId: 'file-tenant',
            environment: { AZURE_TENANT_ID: 'file-tenant', AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' },
        }]);
        assert.ok(fixture.policyWrites.some(write => write.request.properties.principal.identity.objectId === hostPrincipal.objectId));
    });

    test('reads credential environment variables from local.settings.json with the host platform case rule', async () => {
        await writeSettings({ ['azure_token_credentials']: 'AzureCliCredential' });
        const fixture = createAdapterFixture({ token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }) });

        const run = runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter));

        if (process.platform === 'win32') {
            await run;
            assert.strictEqual((fixture.tokenRequests[0] as { kind: string }).kind, 'azureCli');
        } else {
            // The host does not see a lowercase variable as AZURE_TOKEN_CREDENTIALS, so it would use the full chain.
            await assert.rejects(run, /DefaultAzureCredential/);
            assert.deepStrictEqual(fixture.tokenRequests, []);
            assert.deepStrictEqual(fixture.policyWrites, []);
        }
    });

    test('grants nothing when a conflicting setting appears after the host identity was resolved', async () => {
        await writeSettings(clientSecretValues);
        const changed = settingsFile({ ...clientSecretValues, [`AzureWebJobs${connectionSettingName}__clientId`]: 'late-client' });
        const fixture = createAdapterFixture({
            token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }),
            beforeToken: async () => await fs.promises.writeFile(settingsPath, JSON.stringify(changed)),
        });

        await assert.rejects(
            runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter)),
            /credential settings in local\.settings\.json changed/,
        );
        assert.strictEqual(fixture.tokenRequests.length, 1);
        assert.deepStrictEqual(fixture.policyWrites, []);
        assert.deepStrictEqual(fixture.triggerConfigWrites, []);
        assert.deepStrictEqual(await readSettings(), changed.Values);
    });

    test('uses a hex-suffixed Trigger Config name when another workspace owns the planned name', async () => {
        await writeSettings(clientSecretValues);
        const fixture = createAdapterFixture({
            token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }),
            triggerConfigs: { 'trigger-config': createTriggerConfigResource('trigger-config', { [connectorTriggerOwnerTagKey]: 'other-workspace' }) },
        });
        const context = await createTestActionContext();

        await runConnectorTriggerF5Setup(context, projectPath, undefined, binding, createDependencies(fixture.adapter));

        assert.strictEqual(fixture.triggerConfigWrites.length, 1);
        const name = fixture.triggerConfigWrites[0].name;
        assert.ok(isSuffixedConnectorResourceName(name, 'trigger-config'), name);
        assert.strictEqual((await readSettings())[binding.triggerConfigSettingName], name);
        assert.strictEqual(fixture.triggerConfigs['trigger-config'].tags?.[connectorTriggerOwnerTagKey], 'other-workspace');
        assert.strictEqual(context.telemetry.properties.connectorF5TriggerConfigNameSuffixed, 'true');
        assert.ok(context.valuesToMask.includes(name));
    });

    test('reuses the saved suffixed Trigger Config name on retry', async () => {
        await writeSettings({ ...clientSecretValues, [binding.triggerConfigSettingName]: 'trigger-config-a1b2c3' });
        const fixture = createAdapterFixture({
            token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }),
            triggerConfigs: {
                'trigger-config': createTriggerConfigResource('trigger-config', { [connectorTriggerOwnerTagKey]: 'other-workspace' }),
                'trigger-config-a1b2c3': createTriggerConfigResource('trigger-config-a1b2c3', { [connectorTriggerOwnerTagKey]: workspaceId }),
            },
        });

        await runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter));

        assert.deepStrictEqual(fixture.triggerConfigWrites.map(write => write.name), ['trigger-config-a1b2c3']);
        assert.strictEqual(fixture.triggerConfigWrites[0].createOnly, false);
        assert.strictEqual((await readSettings())[binding.triggerConfigSettingName], 'trigger-config-a1b2c3');
    });

    test('does not reuse a saved suffixed name owned by another workspace', async () => {
        await writeSettings({ ...clientSecretValues, [binding.triggerConfigSettingName]: 'trigger-config-a1b2c3' });
        const foreign = { [connectorTriggerOwnerTagKey]: 'other-workspace' };
        const fixture = createAdapterFixture({
            token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }),
            triggerConfigs: {
                'trigger-config': createTriggerConfigResource('trigger-config', foreign),
                'trigger-config-a1b2c3': createTriggerConfigResource('trigger-config-a1b2c3', foreign),
            },
        });

        await runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter));

        const name = fixture.triggerConfigWrites[0].name;
        assert.ok(isSuffixedConnectorResourceName(name, 'trigger-config') && name !== 'trigger-config-a1b2c3', name);
        assert.strictEqual((await readSettings())[binding.triggerConfigSettingName], name);
    });

    test('writes no Trigger Config or settings when every candidate name belongs to another workspace', async () => {
        const original = JSON.stringify(settingsFile(clientSecretValues));
        await fs.promises.writeFile(settingsPath, original);
        const fixture = createAdapterFixture({
            token: createJwt({ oid: hostPrincipal.objectId, tid: hostPrincipal.tenantId }),
            foreignTriggerConfigs: true,
        });

        await assert.rejects(
            runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, createDependencies(fixture.adapter)),
            /Could not find an unused Trigger Config name/,
        );
        assert.deepStrictEqual(fixture.triggerConfigWrites, []);
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
    });

    async function writeSettings(values: Record<string, string>): Promise<void> {
        await fs.promises.writeFile(settingsPath, JSON.stringify(settingsFile(values)));
    }

    for (const [name, metadata] of [
        ['needs settings setup cannot collect', { status: 200, body: { properties: { connectionParameterSets: { values: [{ name: 'oauth' }, { name: 'key' }] } } } }],
        ['has authentication metadata that cannot be loaded', { status: 404 }],
    ] as const) {
        test(`provisions nothing for a new namespace and connection when the connector ${name}`, async () => {
            const original = JSON.stringify(settingsFile(clientSecretValues));
            await fs.promises.writeFile(settingsPath, original);
            const fixture = createProvisioningFixture({ metadata });

            await assert.rejects(
                runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, fixture.dependencies),
                /No connection was created/,
            );

            assert.deepStrictEqual(fixture.events, ['metadata']);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
        });
    }

    test('checks connector authentication before creating the resource group or namespace', async () => {
        await writeSettings(clientSecretValues);
        const fixture = createProvisioningFixture({ metadata: oauthMetadata() });

        await assert.rejects(
            runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, fixture.dependencies),
            /stop after connection/,
        );

        assert.deepStrictEqual(fixture.events.slice(0, 4), ['metadata', 'provider', 'resourceGroupCreate', 'namespaceCreate']);
        assert.ok(fixture.events.includes('connectionCreate'));
    });

    test('provisions nothing when setup is cancelled during the connector authentication check', async () => {
        const original = JSON.stringify(settingsFile(clientSecretValues));
        await fs.promises.writeFile(settingsPath, original);
        const fixture: ProvisioningFixture = createProvisioningFixture({
            metadata: oauthMetadata(),
            onMetadata: () => fixture.cancelSetup(),
        });

        await assert.rejects(
            runConnectorTriggerF5Setup(await createTestActionContext(), projectPath, undefined, binding, fixture.dependencies),
            UserCancelledError,
        );

        assert.deepStrictEqual(fixture.events, ['metadata']);
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
    });

    async function readSettings(): Promise<Record<string, string>> {
        return parseJson<{ Values: Record<string, string> }>(await fs.promises.readFile(settingsPath, 'utf8')).Values;
    }
});

function settingsFile(values: Record<string, string>): { IsEncrypted: false; Values: Record<string, string> } {
    return { IsEncrypted: false, Values: values };
}

interface AdapterFixtureOptions {
    token?: string;
    tokenError?: Error;
    beforeToken?: () => Promise<void>;
    accessPolicies?: Record<string, ConnectorConnectionAccessPolicyResource>;
    onPolicyWrite?: () => void;
    triggerConfigs?: Record<string, ConnectorTriggerConfigResource>;
    foreignTriggerConfigs?: boolean;
    triggerConfigCreateRaced?: boolean;
}

interface AdapterFixture {
    adapter: AzureConnectorTriggerGatewayAdapter;
    tokenRequests: unknown[];
    accessPolicies: Record<string, ConnectorConnectionAccessPolicyResource>;
    policyWrites: { name: string; request: ConnectorConnectionAccessPolicyCreateOrUpdateRequest }[];
    triggerConfigs: Record<string, ConnectorTriggerConfigResource>;
    triggerConfigWrites: { name: string; request: ConnectorTriggerConfigCreateOrUpdateRequest; createOnly?: boolean }[];
}

function preconditionFailed(): Error {
    return Object.assign(new Error('Precondition failed'), { statusCode: 412 });
}

function createAdapterFixture(options: AdapterFixtureOptions): AdapterFixture {
    const fixture: Omit<AdapterFixture, 'adapter'> = {
        tokenRequests: [],
        accessPolicies: { ...options.accessPolicies },
        policyWrites: [],
        triggerConfigs: { ...options.triggerConfigs },
        triggerConfigWrites: [],
    };
    const issueToken = async (request: unknown): Promise<string> => {
        fixture.tokenRequests.push(request);
        await options.beforeToken?.();
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
            options.onPolicyWrite?.();
            return fixture.accessPolicies[name];
        },
        getTriggerConfig: async (_context, _rg, _ns, name) => fixture.triggerConfigs[name] ??
            (options.foreignTriggerConfigs ? createTriggerConfigResource(name, { [connectorTriggerOwnerTagKey]: 'other-workspace' }) : undefined),
        createOrUpdateTriggerConfig: async (_context, _rg, _ns, name, request, writeOptions) => {
            if (writeOptions?.createOnly && (fixture.triggerConfigs[name] || options.triggerConfigCreateRaced)) {
                throw preconditionFailed();
            }
            fixture.triggerConfigWrites.push({ name, request, createOnly: writeOptions?.createOnly });
            fixture.triggerConfigs[name] = createTriggerConfigResource(name, request.tags);
            return fixture.triggerConfigs[name];
        },
    };
    return {
        ...fixture,
        adapter: createAdapter(client, { tokenProvider }),
    };
}

function createAdapter(
    client: Partial<ConnectorGatewayClient>,
    options: {
        tokenProvider?: ConnectorPollingTokenProvider;
        resourceGroups?: ConnectorResourceGroupsClient;
        providerVerifier?: () => Promise<void>;
        sendRequest?: (request: PipelineRequest) => Promise<PipelineResponse>;
        createSuffixedName?: (baseName: string) => string;
    } = {},
): AzureConnectorTriggerGatewayAdapter {
    const resolver = {
        resolve: async (context: IActionContext) => Object.assign({}, context, {
            subscriptionId: target.subscription.id,
            tenantId: target.subscription.tenantId,
            environment: target.subscription.environment,
        }),
    } as unknown as LiveConnectorSubscriptionResolver;
    const unexpected = (name: string) => async (): Promise<never> => { throw new Error(`unexpected ${name} call`); };
    return new AzureConnectorTriggerGatewayAdapter(
        client as ConnectorGatewayClient,
        resolver,
        options.resourceGroups ? async () => nonNull(options.resourceGroups) : unexpected('resource group'),
        options.sendRequest ? async () => ({ sendRequest: nonNull(options.sendRequest) }) : unexpected('ARM'),
        options.providerVerifier ?? unexpected('provider'),
        options.tokenProvider ?? { getClientSecretToken: unexpected('token'), getAzureCliToken: unexpected('token') },
        options.createSuffixedName ?? (() => { throw new Error('unexpected suffix'); }),
    );
}

interface NamespaceFixture {
    adapter: AzureConnectorTriggerGatewayAdapter;
    readonly getCalls: number;
    readonly createCalls: number;
    readonly providerChecks: number;
    readonly resourceGroupCreates: number;
    tokens: (vscode.CancellationToken | undefined)[];
}

function createNamespaceFixture(options: {
    getNamespace: (ConnectorGatewayResource | undefined)[];
    created?: ConnectorGatewayResource;
    createError?: Error;
    onGetNamespace?: () => void;
    resourceGroupMissing?: boolean;
    onGetResourceGroup?: () => void;
}): NamespaceFixture {
    const counts = { getCalls: 0, createCalls: 0, providerChecks: 0, resourceGroupCreates: 0 };
    const tokens: (vscode.CancellationToken | undefined)[] = [];
    const client: Partial<ConnectorGatewayClient> = {
        getNamespace: async (_context, _rg, _name, requestOptions) => {
            tokens.push(requestOptions?.cancellationToken);
            const result = options.getNamespace[counts.getCalls];
            counts.getCalls += 1;
            options.onGetNamespace?.();
            return result;
        },
        createNamespace: async (_context, _rg, _name, _request, requestOptions) => {
            tokens.push(requestOptions?.cancellationToken);
            counts.createCalls += 1;
            if (options.createError) {
                throw options.createError;
            }
            return nonNull(options.created);
        },
    };
    const resourceGroups = {
        get: async () => {
            options.onGetResourceGroup?.();
            if (options.resourceGroupMissing) {
                throw httpError(404);
            }
            return {};
        },
        createOrUpdate: async () => {
            counts.resourceGroupCreates += 1;
            return {};
        },
    } as unknown as ConnectorResourceGroupsClient;
    const adapter = createAdapter(client, {
        resourceGroups,
        providerVerifier: async () => { counts.providerChecks += 1; },
    });
    return {
        adapter,
        tokens,
        get getCalls() { return counts.getCalls; },
        get createCalls() { return counts.createCalls; },
        get providerChecks() { return counts.providerChecks; },
        get resourceGroupCreates() { return counts.resourceGroupCreates; },
    };
}

function namespaceResource(provisioningState: ConnectorGatewayProvisioningState): ConnectorGatewayResource {
    return {
        id: namespaceId,
        name: 'namespace',
        location: 'eastus',
        identity: { type: 'SystemAssigned', principalId: 'namespace-principal', tenantId: 'selected-tenant' },
        properties: { provisioningState },
    };
}

interface ConnectionFixture {
    adapter: AzureConnectorTriggerGatewayAdapter;
    connections: Map<string, ConnectorConnectionResource>;
    creates: { name: string; request: ConnectorConnectionCreateOrUpdateRequest; createOnly?: boolean }[];
    metadataRequests: string[];
}

function createConnectionFixture(options: {
    connections?: ConnectorConnectionResource[];
    metadata?: { status: number; body?: unknown };
    suffixes?: string[];
    onMetadata?: () => void;
}): ConnectionFixture {
    const connections = new Map((options.connections ?? []).map(resource => [nonNull(resource.name), resource]));
    const creates: ConnectionFixture['creates'] = [];
    const metadataRequests: string[] = [];
    const suffixes = [...options.suffixes ?? []];
    const client: Partial<ConnectorGatewayClient> = {
        getConnection: async (_context, _rg, _ns, name) => connections.get(name),
        listConnections: async () => [...connections.values()],
        createOrUpdateConnection: async (_context, _rg, _ns, name, request, writeOptions) => {
            if (writeOptions?.createOnly && connections.has(name)) {
                throw preconditionFailed();
            }
            creates.push({ name, request, createOnly: writeOptions?.createOnly });
            const resource = connectionResource(name, request.tags?.[connectorTriggerOwnerTagKey]);
            connections.set(name, resource);
            return resource;
        },
    };
    const adapter = createAdapter(client, {
        sendRequest: async request => {
            metadataRequests.push(request.url);
            options.onMetadata?.();
            const metadata = nonNull(options.metadata);
            return { status: metadata.status, parsedBody: metadata.body, request } as unknown as PipelineResponse;
        },
        createSuffixedName: baseName => `${baseName}-${nonNull(suffixes.shift())}`,
    });
    return { adapter, connections, creates, metadataRequests };
}

interface ProvisioningFixture {
    dependencies: ConnectorTriggerF5Dependencies;
    events: string[];
    cancelSetup: () => void;
}

/**
 * Runs the real adapter for every provisioning call setup makes for a new namespace and a new
 * connection, recording each metadata read and write in order. Setup stops at the first call after
 * the connection is created.
 */
function createProvisioningFixture(options: {
    metadata: { status: number; body?: unknown };
    onMetadata?: () => void;
}): ProvisioningFixture {
    const events: string[] = [];
    const record = (event: string) => async (): Promise<never> => {
        events.push(event);
        throw new Error(`unexpected ${event}`);
    };
    const connections = new Map<string, ConnectorConnectionResource>();
    const client: Partial<ConnectorGatewayClient> = {
        getNamespace: async () => undefined,
        createNamespace: async () => {
            events.push('namespaceCreate');
            return namespaceResource('Succeeded');
        },
        getConnection: async (_context, _rg, _ns, name) => connections.get(name),
        createOrUpdateConnection: async (_context, _rg, _ns, name, request) => {
            events.push('connectionCreate');
            const resource = connectionResource(name, request.tags?.[connectorTriggerOwnerTagKey]);
            connections.set(name, resource);
            return resource;
        },
        createOrUpdateConnectionAccessPolicy: record('policyWrite'),
        createOrUpdateTriggerConfig: record('triggerConfigWrite'),
    };
    const adapter = createAdapter(client, {
        resourceGroups: {
            get: async () => { throw httpError(404); },
            createOrUpdate: async () => {
                events.push('resourceGroupCreate');
                return {};
            },
        } as unknown as ConnectorResourceGroupsClient,
        providerVerifier: async () => { events.push('provider'); },
        sendRequest: async request => {
            events.push('metadata');
            options.onMetadata?.();
            return { status: options.metadata.status, parsedBody: options.metadata.body, request } as unknown as PipelineResponse;
        },
    });
    const progressCancellation = new vscode.CancellationTokenSource();
    const setupCancellation = new vscode.CancellationTokenSource();
    const stop = async (): Promise<never> => { throw new Error('stop after connection'); };
    const gateway: Partial<ConnectorTriggerGateway> = {
        assertConnectorConnectionCreatable: adapter.assertConnectorConnectionCreatable.bind(adapter),
        ensureNamespace: adapter.ensureNamespace.bind(adapter),
        ensureConnection: adapter.ensureConnection.bind(adapter),
        getConnection: stop,
        getConsentLink: stop,
        getPollingPrincipal: stop,
        ensureConnectionAccessPolicies: adapter.ensureConnectionAccessPolicies.bind(adapter),
        getTriggerConfig: stop,
        createOrUpdateTriggerConfig: adapter.createOrUpdateTriggerConfig.bind(adapter),
    };
    let now = 0;
    return {
        events,
        cancelSetup: () => setupCancellation.cancel(),
        dependencies: {
            bindingResolver: { find: async () => [binding], resolve: async () => binding },
            gateway: gateway as ConnectorTriggerGateway,
            projectStore: { read: async () => undefined, markComplete: async () => undefined },
            operationResolver: {
                resolveOperation: async () => ({ inputs: [] }),
                resolveDynamicInput: async () => ({}),
                serializeParameters: () => [],
            },
            workspaceIdentity: { get: async () => workspaceId },
            hostLaunch: exactLaunch(),
            openSetup: async (_context, request) => ({
                cancellationToken: setupCancellation.token,
                selectResources: async () => ({
                    target,
                    namespace: { kind: 'create', resourceGroupName: 'resource-group', namespaceName: 'namespace' },
                    connection: { kind: 'create', connectionName: 'office365-planned' },
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
        },
    };
}

function connectionResource(name: string, ownerWorkspaceId: string | undefined, connectorName: string = target.connectorId): ConnectorConnectionResource {
    return {
        id: `${namespaceId}/connections/${name}`,
        name,
        tags: ownerWorkspaceId ? { [connectorTriggerOwnerTagKey]: ownerWorkspaceId } : undefined,
        properties: { connectorName, overallStatus: 'Unauthenticated' },
    };
}

function oauthMetadata(): { status: number; body: unknown } {
    return { status: 200, body: { properties: { connectionParameters: { token: { type: 'oauthSetting' } } } } };
}

function subscriptionCandidate(overrides: { tenantId?: string; name?: string; endpoint?: string; accountId?: string }): ISubscriptionContext {
    return {
        subscriptionId: target.subscription.id,
        tenantId: overrides.tenantId ?? target.subscription.tenantId,
        environment: {
            name: overrides.name ?? 'AzureCloud',
            resourceManagerEndpointUrl: overrides.endpoint ?? 'https://management.azure.com/',
        },
        account: { id: overrides.accountId ?? 'account-a' },
    } as unknown as ISubscriptionContext;
}

function getCandidateAccountId(context: unknown): unknown {
    return (context as { account?: { id?: unknown } }).account?.id;
}

function httpError(statusCode: number): Error {
    return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

function triggerConfigRequest(): Parameters<AzureConnectorTriggerGatewayAdapter['createOrUpdateTriggerConfig']>[1] {
    return {
        target,
        namespace,
        connection,
        triggerConfigName: 'trigger-config',
        ownerWorkspaceId: workspaceId,
        deliveryMode: 'Poll',
        state: 'Enabled',
        type: 'NotSpecified',
        parameters: [],
    };
}

function createDependencies(
    adapter: AzureConnectorTriggerGatewayAdapter,
    hostLaunch: ConnectorTriggerHostLaunch | null = exactLaunch(),
): ConnectorTriggerF5Dependencies {
    const progressCancellation = new vscode.CancellationTokenSource();
    const setupCancellation = new vscode.CancellationTokenSource();
    let now = 0;
    const gateway: Partial<ConnectorTriggerGateway> = {
        ensureNamespace: async () => namespace,
        assertConnectorConnectionCreatable: async () => { throw new Error('unexpected preflight for an existing connection'); },
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
        hostLaunch: hostLaunch ?? undefined,
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

function createTriggerConfigResource(name: string, tags: Readonly<Record<string, string>> | undefined): ConnectorTriggerConfigResource {
    return {
        id: `${namespaceId}/triggerConfigs/${name}`,
        name,
        tags,
        properties: {
            state: 'Enabled',
            pollingEndpoints: {
                receiveUri: `https://poll.example.invalid/api/connectorGateways/gateway/triggerConfigs/${name}/receive`,
            },
        },
    };
}

function toPolicyResource(policy: ConnectorTriggerConnectionAccessPolicy): ConnectorConnectionAccessPolicyResource {
    return { name: policy.name, properties: { principal: policy.principal } };
}

function nonNull<T>(value: T | undefined): T {
    assert.ok(value);
    return value;
}
