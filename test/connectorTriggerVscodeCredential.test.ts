/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Environment } from '@azure/ms-rest-azure-env';
import { AzExtFsExtra, createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { type AuthenticationSession } from 'vscode';
import { type ConnectorTriggerHostCredentialConfiguration } from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import {
    resolveConnectorVscodePrincipal,
    usesConnectorVscodeCredential,
} from '../src/debug/connectorNamespace/connectorTriggerVscodeCredential';
import {
    getBrokerNativeAsset,
    hasConnectorVscodeDependencies,
} from '../src/debug/connectorNamespace/connectorTriggerVscodeRuntime';

suite('Connector Trigger VS Code credential prerequisites', () => {
    let home: string;
    let recordPath: string;
    const account = {
        id: 'fixture-home-account',
        label: 'Fixture account',
        environment: { ...Environment.AzureCloud, isCustomCloud: false },
    };
    const tenantId = 'fixture-tenant';
    const token = `header.${Buffer.from(JSON.stringify({ oid: 'fixture-developer', tid: tenantId })).toString('base64url')}.signature`;
    const session: AuthenticationSession = { id: 'fixture-session', account, accessToken: token, scopes: [] };
    const subscription = {
        account,
        tenantId,
        environment: Environment.AzureCloud,
        authentication: { getSession: () => session, getSessionWithScopes: () => session },
    };

    setup(async () => {
        home = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-vscode-'));
        recordPath = path.join(home, '.azure', 'ms-azuretools.vscode-azureresourcegroups', 'authRecord.json');
        await AzExtFsExtra.ensureDir(path.dirname(recordPath));
        await writeRecord();
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(home, { recursive: true, useTrash: false });
    });

    function credential(): ConnectorTriggerHostCredentialConfiguration {
        return {
            connectionSettingName: 'FixtureConnection',
            useVisualStudioCodeCredential: true,
            connectionSettings: {},
            environment: {},
            conflictingSettingNames: [],
            launch: {
                kind: 'task',
                execution: 'process',
                standardFunctionsTask: true,
                environment: { USERPROFILE: home, HOME: home, AZURE_TOKEN_CREDENTIALS: 'VisualStudioCodeCredential' },
            },
        };
    }

    async function writeRecord(overrides: Record<string, unknown> = {}): Promise<void> {
        await fs.promises.writeFile(recordPath, JSON.stringify({
            tenantId, homeAccountId: account.id, authority: 'https://login.microsoftonline.com/', ...overrides,
        }));
    }

    test('matches the broker record to the selected Azure Resources account, session, tenant and cloud', async () => {
        const context = await createTestActionContext();

        assert.deepStrictEqual(await resolveConnectorVscodePrincipal(context, subscription, credential()), {
            objectId: 'fixture-developer', tenantId,
        });
        assert.ok(context.valuesToMask.includes(token));
        assert.ok(context.valuesToMask.includes(account.id));
        assert.strictEqual(context.telemetry.properties.connectorF5VscodeIdentityMatches, 'true');
        assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(recordPath, 'utf8')), {
            tenantId, homeAccountId: account.id, authority: 'https://login.microsoftonline.com/',
        });
    });

    for (const [name, overrides] of [
        ['account', { homeAccountId: 'another-account' }],
        ['cloud', { authority: 'https://login.microsoftonline.us/' }],
    ] as const) {
        test(`rejects a different broker ${name} without changing the authentication record`, async () => {
            await writeRecord(overrides);
            const original = await fs.promises.readFile(recordPath, 'utf8');

            await assert.rejects(resolveConnectorVscodePrincipal(
                await createTestActionContext(), subscription, credential()), /does not match the selected/i);

            assert.strictEqual(await fs.promises.readFile(recordPath, 'utf8'), original);
        });
    }

    test('preserves a guest account home-tenant record while authorizing its selected resource-tenant principal', async () => {
        await writeRecord({ tenantId: 'fixture-home-tenant' });
        const original = await fs.promises.readFile(recordPath, 'utf8');

        assert.deepStrictEqual(await resolveConnectorVscodePrincipal(
            await createTestActionContext(), subscription, credential()), { objectId: 'fixture-developer', tenantId });

        assert.strictEqual(await fs.promises.readFile(recordPath, 'utf8'), original);
    });

    test('does not equate another VS Code session with the selected account', async () => {
        await assert.rejects(resolveConnectorVscodePrincipal(await createTestActionContext(), {
            ...subscription,
            authentication: {
                getSession: () => ({ ...session, account: { ...account, id: 'another-session-account' } }),
                getSessionWithScopes: () => session,
            },
        }, credential()), /does not match the selected/i);
    });

    test('rejects a conflicting runtime tenant', async () => {
        const host = credential();
        host.connectionSettings = { tenantId: 'another-tenant' };
        await assert.rejects(resolveConnectorVscodePrincipal(
            await createTestActionContext(), subscription, host), /does not match the selected/i);
    });

    test('reports missing VS Code authentication separately from missing broker support', async () => {
        await fs.promises.rm(recordPath);
        await assert.rejects(resolveConnectorVscodePrincipal(
            await createTestActionContext(), subscription, credential()), /authentication record.*sign in through Azure Resources/is);
    });

    test('does not disclose malformed authentication-record content through an error cause', async () => {
        await fs.promises.writeFile(recordPath, '{"username":"private-record-content",');
        await assert.rejects(resolveConnectorVscodePrincipal(
            await createTestActionContext(), subscription, credential()), (error: unknown) =>
            error instanceof Error && /cannot read the VS Code authentication record/i.test(error.message) &&
            !error.message.includes('private-record-content') && error.cause === undefined);
    });

    test('rejects a missing selected-account session without using another credential', async () => {
        await assert.rejects(resolveConnectorVscodePrincipal(await createTestActionContext(), {
            ...subscription,
            authentication: { getSession: () => undefined, getSessionWithScopes: () => undefined },
        }, credential()), /no usable VS Code sign-in/i);
    });

    test('does not grant a VS Code principal when the host reads an explicit credential or connection string', async () => {
        const host = credential();
        host.connectionSettings = { credential: 'managedidentity' };
        await assert.rejects(resolveConnectorVscodePrincipal(
            await createTestActionContext(), subscription, host), /overrides the VS Code credential/i);
        host.connectionSettings = {};
        host.conflictingSettingNames = ['ConnectionStrings:FixtureConnection'];
        await assert.rejects(resolveConnectorVscodePrincipal(
            await createTestActionContext(), subscription, host), /overrides the VS Code credential/i);
    });

    test('does not infer the credential of an opaque custom host execution', async () => {
        const host = credential();
        host.launch = { kind: 'task', execution: 'custom', environment: {} };
        await assert.rejects(resolveConnectorVscodePrincipal(
            await createTestActionContext(), subscription, host), /custom host task/i);
    });

    test('selects VS Code only for an unconfigured or explicitly selected developer credential', () => {
        const settings = { IsEncrypted: false, Values: {} };
        assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', settings, {}), true);
        assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', settings, {
            AZURE_TOKEN_CREDENTIALS: 'VisualStudioCodeCredential',
        }), true);
        for (const selection of ['AzureCliCredential', 'EnvironmentCredential', 'ManagedIdentityCredential']) {
            assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', settings, {
                AZURE_TOKEN_CREDENTIALS: selection,
            }), false);
        }
        assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', settings, {
            AZURE_CLIENT_ID: 'fixture-client', AZURE_CLIENT_SECRET: 'fixture-secret',
        }), false);
        assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', {
            IsEncrypted: false,
            Values: { ['FixtureConnection__credential']: 'managedidentity' },
        }, { AZURE_TOKEN_CREDENTIALS: 'VisualStudioCodeCredential' }), false);
    });

    test('requires Identity named-credential support and every broker dependency', () => {
        const libraries = {
            'Azure.Identity/1.17.1': {},
            'Azure.Identity.Broker/1.3.1': {},
            'Microsoft.Identity.Client.Broker/4.80.0': {},
            'Microsoft.Identity.Client.NativeInterop/0.19.4': {},
        };
        assert.strictEqual(hasConnectorVscodeDependencies({ libraries }), true);
        for (const missing of Object.keys(libraries)) {
            assert.strictEqual(hasConnectorVscodeDependencies({
                libraries: Object.fromEntries(Object.entries(libraries).filter(([key]) => key !== missing)),
            }), false);
        }
        assert.strictEqual(hasConnectorVscodeDependencies({
            libraries: { ...libraries, 'Azure.Identity/1.16.0': {}, 'Azure.Identity/1.17.1': undefined },
        }), false);
        assert.strictEqual(hasConnectorVscodeDependencies({
            libraries: { 'Azure.Identity/1.16.0': {}, 'Azure.Identity.Broker/1.3.1': {} },
        }), false);
        assert.strictEqual(hasConnectorVscodeDependencies({}), false);
    });

    test('resolves platform-specific native assets without assuming Windows or x64', () => {
        assert.strictEqual(getBrokerNativeAsset('win32', 'x64'), path.join('runtimes', 'win-x64', 'native', 'msalruntime.dll'));
        assert.strictEqual(getBrokerNativeAsset('win32', 'arm64'), path.join('runtimes', 'win-arm64', 'native', 'msalruntime_arm64.dll'));
        assert.strictEqual(getBrokerNativeAsset('darwin', 'arm64'), path.join('runtimes', 'osx-arm64', 'native', 'msalruntime_arm64.dylib'));
        assert.strictEqual(getBrokerNativeAsset('linux', 'x64'), path.join('runtimes', 'linux-x64', 'native', 'libmsalruntime.so'));
        assert.strictEqual(getBrokerNativeAsset('linux', 'arm64'), undefined);
    });
});
