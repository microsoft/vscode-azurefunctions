/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from '@azure/arm-appservice';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { AzExtFsExtra, createTestActionContext, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { type ConnectorGatewayClient } from '../src/commands/createFunction/connectorSteps/ConnectorGatewayClient';
import {
    configureConnectorTriggerDeployment,
    grantConnectorTriggerAccess,
    mergeConnectorTriggerAppSettings,
    type ConnectorTriggerDeploymentTarget,
} from '../src/commands/deploy/connectorTriggerDeployment';

const binding = { connectionSettingName: 'ConnectorNamespace', triggerConfigSettingName: 'OnNewEmailTriggerConfigName' };
const pollingEndpoint = 'https://fixture.connectors.invalid/api/connectorGateways/fixture-ns';
const receiveUri = `${pollingEndpoint}/triggerConfigs/fixture-trigger/receive`;

suite('Connector Trigger deployment', () => {
    test('merges connector, local and managed identity settings without uploading local-only values', () => {
        const remote: Record<string, string> = {
            ['AzureWebJobsStorage__blobServiceUri']: 'https://fixturestorage.blob.core.windows.net',
            ['AzureWebJobsStorage__credential']: 'managedidentity',
            ['APPLICATIONINSIGHTS_CONNECTION_STRING']: 'fixture-ai',
            ['onnewemailtriggerconfigname']: 'stale-trigger',
            Existing: 'remote-value',
        };

        const result = mergeConnectorTriggerAppSettings({
            AzureWebJobsStorage: 'UseDevelopmentStorage=true',
            ['AzureWebJobsStorage__accountName']: 'localstorage',
            AZURE_TOKEN_CREDENTIALS: 'VisualStudioCodeCredential',
            ['FUNCTIONS_WORKER_RUNTIME']: 'dotnet-isolated',
            ['ConnectorNamespace__tenantId']: 'local-tenant',
            ['ConnectorNamespace__pollingEndpoint']: pollingEndpoint,
            OnNewEmailTriggerConfigName: 'fixture-trigger',
            Existing: 'local-value',
            Unrelated: 'fixture-value',
            IsNumber: 1,
        }, [binding], remote);

        assert.deepStrictEqual(remote, {
            ['AzureWebJobsStorage__blobServiceUri']: 'https://fixturestorage.blob.core.windows.net',
            ['AzureWebJobsStorage__credential']: 'managedidentity',
            ['AzureWebJobsStorage__accountName']: 'fixturestorage',
            ['APPLICATIONINSIGHTS_CONNECTION_STRING']: 'fixture-ai',
            ['onnewemailtriggerconfigname']: 'fixture-trigger',
            Existing: 'remote-value',
            ['ConnectorNamespace__pollingEndpoint']: pollingEndpoint,
            ['ConnectorNamespace__credential']: 'managedidentity',
            Unrelated: 'fixture-value',
        });
        assert.deepStrictEqual(result.excludedNames.sort(), ['AZURE_TOKEN_CREDENTIALS', 'AzureWebJobsStorage', 'AzureWebJobsStorage__accountName', 'ConnectorNamespace__tenantId']);
        assert.deepStrictEqual(result.targets, [{ connectionSettingName: 'ConnectorNamespace', triggerConfigName: 'fixture-trigger', pollingEndpoint, managedIdentityClientId: undefined }]);
        assert.deepStrictEqual(result.unresolvedSettingNames, []);
        assert.strictEqual(result.storageMissing, false);
        assert.strictEqual(result.appInsightsMissing, false);
    });

    test('reports unresolved trigger configs and missing storage or App Insights', () => {
        const remote: Record<string, string> = { ['ConnectorNamespace__credential']: 'managedidentity' };
        const result = mergeConnectorTriggerAppSettings({}, [binding], remote);

        assert.deepStrictEqual(result.changedNames, []);
        assert.deepStrictEqual(result.targets, []);
        assert.deepStrictEqual(result.unresolvedSettingNames, ['OnNewEmailTriggerConfigName']);
        assert.strictEqual(result.storageMissing, true);
        assert.strictEqual(result.appInsightsMissing, true);
    });

    test('grants the system identity access to the connection that owns the trigger config', async () => {
        const fixture = createGatewayFixture();
        const warnings = await grantConnectorTriggerAccess(await createContext(), createSite({ type: 'SystemAssigned', principalId: 'app-principal', tenantId: 'app-tenant' }), [target()], { client: fixture.client });

        assert.deepStrictEqual(warnings, []);
        assert.deepStrictEqual(fixture.triggerLookups, ['other-rg/other-ns', 'fixture-rg/fixture-ns']);
        assert.deepStrictEqual(fixture.created, [{
            path: 'fixture-rg/fixture-ns/fixture-connection/app-principal',
            body: {
                location: 'westus',
                properties: { principal: { type: 'ActiveDirectory', identity: { objectId: 'app-principal', tenantId: 'app-tenant' } } },
            },
        }]);
    });

    test('enables a system identity when the app has none and skips an existing policy', async () => {
        const fixture = createGatewayFixture({ existingObjectId: 'enabled-principal' });
        let enabled = 0;
        const warnings = await grantConnectorTriggerAccess(await createContext(), createSite(undefined), [target()], {
            client: fixture.client,
            enableSystemIdentity: async () => {
                enabled += 1;
                return { type: 'SystemAssigned', principalId: 'enabled-principal', tenantId: 'app-tenant' };
            },
        });

        assert.deepStrictEqual(warnings, []);
        assert.strictEqual(enabled, 1);
        assert.deepStrictEqual(fixture.created, []);
    });

    test('uses the user-assigned identity selected by the connection client ID', async () => {
        const fixture = createGatewayFixture();
        await grantConnectorTriggerAccess(await createContext(), createSite({
            type: 'UserAssigned',
            tenantId: 'app-tenant',
            userAssignedIdentities: { ['/fixture/uami']: { clientId: 'uami-client', principalId: 'uami-principal' } },
        }), [target({ managedIdentityClientId: 'UAMI-CLIENT' })], {
            client: fixture.client,
            enableSystemIdentity: async () => assert.fail('A user-assigned identity must not enable the system identity.'),
        });

        assert.deepStrictEqual(fixture.created.map(created => created.path), ['fixture-rg/fixture-ns/fixture-connection/uami-principal']);
    });

    test('refuses to replace a policy owned by another identity and warns when the trigger config is missing', async () => {
        const site = createSite({ type: 'SystemAssigned', principalId: 'app-principal', tenantId: 'app-tenant' });
        await assert.rejects(
            grantConnectorTriggerAccess(await createContext(), site, [target()], { client: createGatewayFixture({ existingObjectId: 'someone-else' }).client }),
            /different identity/,
        );

        const fixture = createGatewayFixture();
        const warnings = await grantConnectorTriggerAccess(await createContext(), site, [target({ pollingEndpoint: 'https://other.invalid/api' })], { client: fixture.client });
        assert.strictEqual(warnings.length, 1);
        assert.match(warnings[0], /Could not find Connector trigger config/);
        assert.deepStrictEqual(fixture.created, []);
    });

    test('updates deployed settings from a BOM-prefixed local.settings.json and grants access', async () => {
        const projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-deploy-'));
        try {
            await AzExtFsExtra.writeFile(path.join(projectPath, 'local.settings.json'), '\uFEFF' + JSON.stringify({
                IsEncrypted: false,
                Values: { ['ConnectorNamespace__pollingEndpoint']: pollingEndpoint, OnNewEmailTriggerConfigName: 'fixture-trigger' },
            }));
            const fixture = createGatewayFixture();
            const appSettings: StringDictionary = {};

            const changed = await configureConnectorTriggerDeployment(await createContext(), {
                site: createSite({ type: 'SystemAssigned', principalId: 'app-principal', tenantId: 'app-tenant' }),
                projectPath,
                appSettings,
            }, { client: fixture.client, findBindings: async () => [binding] });

            assert.strictEqual(changed, true);
            assert.deepStrictEqual(appSettings.properties, {
                ['ConnectorNamespace__pollingEndpoint']: pollingEndpoint,
                OnNewEmailTriggerConfigName: 'fixture-trigger',
                ['ConnectorNamespace__credential']: 'managedidentity',
            });
            assert.strictEqual(fixture.created.length, 1);
        } finally {
            await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
        }
    });

    test('leaves projects without Connector Triggers unchanged', async () => {
        const appSettings: StringDictionary = { properties: { Existing: 'value' } };
        const changed = await configureConnectorTriggerDeployment(await createContext(), { site: createSite(undefined), projectPath: os.tmpdir(), appSettings }, {
            client: {} as ConnectorGatewayClient,
            findBindings: async () => [],
        });

        assert.strictEqual(changed, false);
        assert.deepStrictEqual(appSettings.properties, { Existing: 'value' });
    });
});

function target(overrides: Partial<ConnectorTriggerDeploymentTarget> = {}): ConnectorTriggerDeploymentTarget {
    return { connectionSettingName: 'ConnectorNamespace', triggerConfigName: 'fixture-trigger', pollingEndpoint: `${pollingEndpoint}/`, ...overrides };
}

async function createContext(): Promise<IActionContext & ISubscriptionContext> {
    const context = await createTestActionContext();
    context.ui.showWarningMessage = async () => ({ title: '' });
    return Object.assign(context, {
        subscriptionId: 'fixture-subscription',
        subscriptionDisplayName: 'Fixture subscription',
        tenantId: 'fixture-tenant',
    }) as unknown as IActionContext & ISubscriptionContext;
}

function createSite(identity: NonNullable<ParsedSite['rawSite']['identity']> | undefined): ParsedSite {
    return { fullName: 'fixture-app', rawSite: { identity } } as unknown as ParsedSite;
}

interface CreatedPolicy {
    path: string;
    body: unknown;
}

function createGatewayFixture(options: { existingObjectId?: string } = {}): { client: ConnectorGatewayClient; triggerLookups: string[]; created: CreatedPolicy[] } {
    const triggerLookups: string[] = [];
    const created: CreatedPolicy[] = [];
    const client = {
        listNamespaces: async () => [
            { id: '/subscriptions/fixture-subscription/resourceGroups/other-rg/providers/Microsoft.Web/connectorGateways/other-ns', name: 'other-ns', location: 'eastus' },
            { id: '/subscriptions/fixture-subscription/resourceGroups/fixture-rg/providers/Microsoft.Web/connectorGateways/fixture-ns', name: 'fixture-ns', location: 'westus' },
        ],
        getTriggerConfig: async (_context: unknown, resourceGroupName: string, namespaceName: string) => {
            triggerLookups.push(`${resourceGroupName}/${namespaceName}`);
            if (namespaceName === 'other-ns') {
                throw new Error('Forbidden');
            }
            return { properties: { pollingEndpoints: { receiveUri }, connectionDetails: { connectionName: 'fixture-connection' } } };
        },
        getConnectionAccessPolicy: async () => options.existingObjectId ?
            { properties: { principal: { identity: { objectId: options.existingObjectId } } } } :
            undefined,
        createOrUpdateConnectionAccessPolicy: async (_context: unknown, resourceGroupName: string, namespaceName: string, connectionName: string, policyName: string, body: unknown) => {
            created.push({ path: `${resourceGroupName}/${namespaceName}/${connectionName}/${policyName}`, body });
            return body;
        },
    } as unknown as ConnectorGatewayClient;
    return { client, triggerLookups, created };
}
