/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Environment } from '@azure/ms-rest-azure-env';
import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { type AuthenticationSession } from 'vscode';
import { type ConnectorTriggerHostCredentialConfiguration } from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import {
    resolveConnectorVscodePrincipal,
    usesConnectorVscodeCredential,
} from '../src/debug/connectorNamespace/connectorTriggerVscodeCredential';

suite('Connector Trigger VS Code credential prerequisites', () => {
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

    function credential(): ConnectorTriggerHostCredentialConfiguration {
        return {
            connectionSettingName: 'FixtureConnection',
            useVisualStudioCodeCredential: true,
            connectionSettings: {},
            environment: {},
            conflictingSettingNames: [],
            launch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        };
    }

    test('resolves the selected Azure Resources account principal without reading a broker record', async () => {
        const context = await createTestActionContext();

        assert.deepStrictEqual(await resolveConnectorVscodePrincipal(context, subscription, credential()), {
            objectId: 'fixture-developer', tenantId,
        });
        assert.ok(context.valuesToMask.includes(token));
        assert.ok(context.valuesToMask.includes(account.id));
        assert.strictEqual(context.telemetry.properties.connectorF5VscodeIdentityMatches, 'true');
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

    test('selects VS Code only when no explicit credential or external azd server is configured', () => {
        const settings = { IsEncrypted: false, Values: {} };
        assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', settings, {}), true);
        for (const selection of [' azuredeveloperclicredential ', 'VisualStudioCodeCredential', 'dev', 'AzureCliCredential', 'ManagedIdentityCredential']) {
            assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', settings, {
                AZURE_TOKEN_CREDENTIALS: selection,
            }), false);
        }
        for (const name of ['AZD_AUTH_ENDPOINT', 'AZD_AUTH_KEY', 'AZD_AUTH_CERT']) {
            assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', settings, { [name]: 'configured' }), false);
        }
        assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', settings, {
            AZURE_CLIENT_ID: 'fixture-client', AZURE_CLIENT_SECRET: 'fixture-secret',
        }), false);
        assert.strictEqual(usesConnectorVscodeCredential('FixtureConnection', {
            IsEncrypted: false,
            Values: { ['FixtureConnection__credential']: 'managedidentity' },
        }, { AZURE_TOKEN_CREDENTIALS: 'AzureDeveloperCliCredential' }), false);
    });
});
