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
    tryGetConnectorNamespaceResourceGroup,
    type ConnectorTriggerDeploymentGateway,
    type ConnectorTriggerDeploymentTarget,
} from '../src/commands/deploy/connectorTriggerDeployment';
import { AzureConnectorTriggerGatewayAdapter, LiveConnectorSubscriptionResolver, type LiveConnectorSubscriptionProvider } from '../src/debug/connectorNamespace/AzureConnectorTriggerF5Adapters';

const binding = { connectionSettingName: 'ConnectorNamespace', triggerConfigSettingName: 'OnNewEmailTriggerConfigName' };
const pollingEndpoint = 'https://fixture.connectors.invalid/api/connectorGateways/fixture-ns';
const environment = { name: 'AzureCloud', resourceManagerEndpointUrl: 'https://management.azure.com/' };
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
            AZURE_CLIENT_SECRET: 'fixture-secret',
            ['AzureWebJobsConnectorNamespace__clientSecret']: 'fixture-secret',
            ['ConnectionStrings:ConnectorNamespace']: 'fixture-secret',
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
            ['onnewemailtriggerconfigname']: 'stale-trigger',
            Existing: 'remote-value',
            ['ConnectorNamespace__pollingEndpoint']: pollingEndpoint,
            ['ConnectorNamespace__credential']: 'managedidentity',
            Unrelated: 'fixture-value',
        });
        assert.deepStrictEqual(result.excludedNames.sort(), [
            'AZURE_CLIENT_SECRET', 'AZURE_TOKEN_CREDENTIALS', 'AzureWebJobsConnectorNamespace__clientSecret', 'AzureWebJobsStorage', 'AzureWebJobsStorage__accountName',
            'ConnectionStrings:ConnectorNamespace', 'ConnectorNamespace__tenantId',
        ]);
        assert.deepStrictEqual(result.keptNames, ['OnNewEmailTriggerConfigName']);
        assert.deepStrictEqual(result.targets, [{ connectionSettingName: 'ConnectorNamespace', triggerConfigName: 'stale-trigger', pollingEndpoint, identitySelectors: [] }]);
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
        await grantConnectorTriggerAccess(await createContext(), createSite({ type: 'SystemAssigned', principalId: 'app-principal', tenantId: 'app-tenant' }), [target()], { gateway: fixture.gateway });

        assert.deepStrictEqual(fixture.triggerLookups, ['other-rg/other-ns', 'fixture-rg/fixture-ns']);
        assert.deepStrictEqual(fixture.created, [{
            subscriptionId: 'fixture-subscription',
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
        await grantConnectorTriggerAccess(await createContext(), createSite(undefined), [target()], {
            gateway: fixture.gateway,
            enableSystemIdentity: async () => {
                enabled += 1;
                return { type: 'SystemAssigned', principalId: 'enabled-principal', tenantId: 'app-tenant' };
            },
        });

        assert.strictEqual(enabled, 1);
        assert.deepStrictEqual(fixture.created, []);
    });

    test('uses the user-assigned identity selected by each supported connection selector', async () => {
        const site = (): ParsedSite => createSite({
            type: 'SystemAssigned, UserAssigned',
            principalId: 'system-principal',
            tenantId: 'app-tenant',
            userAssignedIdentities: {
                ['/fixture/other']: { clientId: 'other-client', principalId: 'other-principal' },
                ['/fixture/uami']: { clientId: 'uami-client', principalId: 'uami-principal' },
            },
        });
        for (const [key, value] of [['clientId', 'UAMI-CLIENT'], ['managedIdentityResourceId', '/FIXTURE/UAMI'], ['managedIdentityObjectId', 'uami-principal']] as const) {
            const fixture = createGatewayFixture();
            await grantConnectorTriggerAccess(await createContext(), site(), [target({ identitySelectors: [{ settingName: `ConnectorNamespace__${key}`, key, value }] })], { gateway: fixture.gateway });
            assert.deepStrictEqual(fixture.created.map(created => created.path), ['fixture-rg/fixture-ns/fixture-connection/uami-principal'], key);
        }
    });

    test('reuses an existing access policy for the identity whatever its name', async () => {
        const fixture = createGatewayFixture({ listed: [{ name: 'bicep-policy', properties: { principal: { type: 'ActiveDirectory', identity: { objectId: 'APP-PRINCIPAL', tenantId: 'app-tenant' } } } }] });
        await grantConnectorTriggerAccess(await createContext(), createSite({ type: 'SystemAssigned', principalId: 'app-principal', tenantId: 'app-tenant' }), [target()], { gateway: fixture.gateway });

        assert.deepStrictEqual(fixture.created, []);
    });

    test('finds the trigger config in another selected subscription', async () => {
        const fixture = createGatewayFixture({ triggerSubscriptionId: 'f5-subscription' });
        await grantConnectorTriggerAccess(await createContext(), createSite({ type: 'SystemAssigned', principalId: 'app-principal', tenantId: 'app-tenant' }), [target()], {
            gateway: fixture.gateway,
            listSubscriptionScopes: async () => [
                { subscriptionId: 'fixture-subscription', tenantId: 'fixture-tenant', environment },
                { subscriptionId: 'other-tenant-subscription', tenantId: 'other-tenant', environment },
                { subscriptionId: 'f5-subscription', tenantId: 'fixture-tenant', environment },
            ] as unknown as ISubscriptionContext[],
        });

        assert.deepStrictEqual(fixture.namespaceLists, ['fixture-subscription', 'f5-subscription']);
        assert.deepStrictEqual(fixture.created.map(created => `${created.subscriptionId}/${created.path}`), ['f5-subscription/fixture-rg/fixture-ns/fixture-connection/app-principal']);
    });

    test('refuses to replace a policy owned by another identity and fails before changes when the trigger config is missing', async () => {
        const site = createSite({ type: 'SystemAssigned', principalId: 'app-principal', tenantId: 'app-tenant' });
        await assert.rejects(
            grantConnectorTriggerAccess(await createContext(), site, [target()], { gateway: createGatewayFixture({ existingObjectId: 'someone-else' }).gateway }),
            /different identity/,
        );

        const fixture = createGatewayFixture();
        await assert.rejects(
            grantConnectorTriggerAccess(await createContext(), createSite(undefined), [target(), target({ triggerConfigName: 'missing-trigger' })], {
                gateway: fixture.gateway,
                listSubscriptionScopes: async () => [],
                enableSystemIdentity: async () => assert.fail('A missing trigger config must fail before the identity changes.'),
            }),
            /Could not find Connector trigger config "missing-trigger"/,
        );
        assert.deepStrictEqual(fixture.created, []);
    });

    test('keeps the app trigger references without prompting', async () => {
        const projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-deploy-'));
        try {
            await AzExtFsExtra.writeFile(path.join(projectPath, 'local.settings.json'), JSON.stringify({
                IsEncrypted: false,
                Values: { ['ConnectorNamespace__pollingEndpoint']: pollingEndpoint, OnNewEmailTriggerConfigName: 'local-trigger' },
            }));
            const context = await createContext();
            context.ui.showWarningMessage = async () => assert.fail('Deploy must not prompt about the app trigger references.');
            const appSettings: StringDictionary = { properties: { ['ConnectorNamespace__pollingEndpoint']: pollingEndpoint, OnNewEmailTriggerConfigName: 'fixture-trigger' } };
            const fixture = createGatewayFixture({ triggerConfigNames: ['fixture-trigger', 'local-trigger'] });

            await configureConnectorTriggerDeployment(context, { site: createSite({ type: 'SystemAssigned', principalId: 'app-principal', tenantId: 'app-tenant' }), projectPath, appSettings }, { gateway: fixture.gateway, findBindings: async () => [binding] });

            assert.strictEqual(appSettings.properties?.OnNewEmailTriggerConfigName, 'fixture-trigger');
            assert.strictEqual(fixture.created.length, 1);
        } finally {
            await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
        }
    });

    test('fails before uploading when a trigger reference is unknown', async () => {
        const appSettings: StringDictionary = {};
        await assert.rejects(
            configureConnectorTriggerDeployment(await createContext(), { site: createSite(undefined), projectPath: os.tmpdir(), appSettings }, {
                gateway: {} as ConnectorTriggerDeploymentGateway,
                findBindings: async () => [binding],
            }),
            /Start debugging locally \(F5\)/,
        );
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
            }, { gateway: fixture.gateway, findBindings: async () => [binding] });

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
            gateway: {} as ConnectorTriggerDeploymentGateway,
            findBindings: async () => [],
        });

        assert.strictEqual(changed, false);
        assert.deepStrictEqual(appSettings.properties, { Existing: 'value' });
    });

    suite('Connector Namespace resource group for a new app', () => {
        const otherBinding = { connectionSettingName: 'OtherNamespace', triggerConfigSettingName: 'OnNewItemTriggerConfigName' };
        const otherEndpoint = 'https://fixture.connectors.invalid/api/connectorGateways/second-ns';
        const localValues = {
            ['ConnectorNamespace__pollingEndpoint']: pollingEndpoint,
            OnNewEmailTriggerConfigName: 'fixture-trigger',
            ['OtherNamespace__pollingEndpoint']: otherEndpoint,
            OnNewItemTriggerConfigName: 'second-trigger',
        };

        interface FixtureNamespace { name: string; resourceGroupName: string; subscriptionId: string; triggers: Record<string, string> }

        function createNamespaceGateway(namespaces: FixtureNamespace[], options: { failList?: boolean } = {}): ConnectorTriggerDeploymentGateway & { lists: string[] } {
            const lists: string[] = [];
            return {
                lists,
                listNamespaces: async (_context: unknown, scope: { subscription: { id: string } }) => {
                    lists.push(scope.subscription.id);
                    if (options.failList) {
                        throw new Error('Forbidden');
                    }
                    return namespaces.filter(ns => ns.subscriptionId === scope.subscription.id)
                        .map(ns => ({ id: `/subscriptions/${ns.subscriptionId}/resourceGroups/${ns.resourceGroupName}/providers/Microsoft.Web/connectorGateways/${ns.name}`, name: ns.name, resourceGroupName: ns.resourceGroupName, location: 'westus' }));
                },
                getTriggerConfig: async (_context: unknown, _scope: unknown, namespace: { name: string }, triggerConfigName: string) => {
                    const endpoint = namespaces.find(ns => ns.name === namespace.name)?.triggers[triggerConfigName];
                    return endpoint ? { id: `${triggerConfigName}-id`, name: triggerConfigName, state: 'Enabled', connectionName: 'fixture-connection', pollingEndpoints: { receiveUri: `${endpoint}/triggerConfigs/${triggerConfigName}/receive` } } : undefined;
                },
                ensureConnectionAccessForPrincipal: async () => assert.fail('Choosing a resource group must not change access policies.'),
            } as unknown as ConnectorTriggerDeploymentGateway & { lists: string[] };
        }

        async function resolve(gateway: ConnectorTriggerDeploymentGateway, bindings = [binding, otherBinding]): Promise<{ name: string | undefined; outcome: string | undefined }> {
            const projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-rg-'));
            try {
                await AzExtFsExtra.writeFile(path.join(projectPath, 'local.settings.json'), JSON.stringify({ IsEncrypted: false, Values: localValues }));
                const context = await createContext();
                const name = await tryGetConnectorNamespaceResourceGroup(context, projectPath, { gateway, findBindings: async () => bindings });
                return { name, outcome: context.telemetry.properties.connectorTriggerNamespaceResourceGroup as string | undefined };
            } finally {
                await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
            }
        }

        test('returns the resource group shared by every trigger config namespace in the selected subscription', async () => {
            const gateway = createNamespaceGateway([
                { name: 'unrelated-ns', resourceGroupName: 'unrelated-rg', subscriptionId: 'fixture-subscription', triggers: {} },
                { name: 'fixture-ns', resourceGroupName: 'Connector-RG', subscriptionId: 'fixture-subscription', triggers: { ['fixture-trigger']: pollingEndpoint } },
                { name: 'second-ns', resourceGroupName: 'connector-rg', subscriptionId: 'fixture-subscription', triggers: { ['second-trigger']: otherEndpoint } },
            ]);

            assert.deepStrictEqual(await resolve(gateway), { name: 'Connector-RG', outcome: 'matched' });
            assert.deepStrictEqual(gateway.lists, ['fixture-subscription']);
        });

        test('does not choose between namespaces in different resource groups', async () => {
            const gateway = createNamespaceGateway([
                { name: 'fixture-ns', resourceGroupName: 'first-rg', subscriptionId: 'fixture-subscription', triggers: { ['fixture-trigger']: pollingEndpoint } },
                { name: 'second-ns', resourceGroupName: 'second-rg', subscriptionId: 'fixture-subscription', triggers: { ['second-trigger']: otherEndpoint } },
            ]);

            assert.deepStrictEqual(await resolve(gateway), { name: undefined, outcome: 'ambiguous' });
        });

        test('does not default when a trigger config is missing or only in another subscription', async () => {
            const missing = createNamespaceGateway([
                { name: 'fixture-ns', resourceGroupName: 'connector-rg', subscriptionId: 'fixture-subscription', triggers: { ['fixture-trigger']: pollingEndpoint } },
            ]);
            assert.deepStrictEqual(await resolve(missing), { name: undefined, outcome: 'notFound' });

            const crossSubscription = createNamespaceGateway([
                { name: 'fixture-ns', resourceGroupName: 'connector-rg', subscriptionId: 'f5-subscription', triggers: { ['fixture-trigger']: pollingEndpoint } },
            ]);
            assert.deepStrictEqual(await resolve(crossSubscription, [binding]), { name: undefined, outcome: 'notFound' });
            assert.deepStrictEqual(crossSubscription.lists, ['fixture-subscription']);
        });

        test('does not default for projects without Poll bindings or when the lookup fails', async () => {
            const gateway = createNamespaceGateway([], { failList: true });
            assert.deepStrictEqual(await resolve(gateway, []), { name: undefined, outcome: 'noBindings' });
            assert.deepStrictEqual(gateway.lists, []);
            assert.deepStrictEqual(await resolve(gateway, [binding]), { name: undefined, outcome: 'failed' });
        });
    });
});

function target(overrides: Partial<ConnectorTriggerDeploymentTarget> = {}): ConnectorTriggerDeploymentTarget {
    return { connectionSettingName: 'ConnectorNamespace', triggerConfigName: 'fixture-trigger', pollingEndpoint: `${pollingEndpoint}/`, identitySelectors: [], ...overrides };
}

async function createContext(): Promise<IActionContext & ISubscriptionContext> {
    const context = await createTestActionContext();
    context.ui.showWarningMessage = async () => ({ title: '' });
    return Object.assign(context, {
        subscriptionId: 'fixture-subscription',
        subscriptionDisplayName: 'Fixture subscription',
        tenantId: 'fixture-tenant',
        environment,
    }) as unknown as IActionContext & ISubscriptionContext;
}

function createSite(identity: NonNullable<ParsedSite['rawSite']['identity']> | undefined): ParsedSite {
    return { fullName: 'fixture-app', rawSite: { identity } } as unknown as ParsedSite;
}

interface CreatedPolicy {
    subscriptionId: string;
    path: string;
    body: unknown;
}

interface GatewayFixtureOptions {
    existingObjectId?: string;
    listed?: unknown[];
    /** Subscription that contains the trigger configs; defaults to the app subscription. */
    triggerSubscriptionId?: string;
    triggerConfigNames?: string[];
}

function createGatewayFixture(options: GatewayFixtureOptions = {}): { gateway: ConnectorTriggerDeploymentGateway; triggerLookups: string[]; namespaceLists: string[]; created: CreatedPolicy[] } {
    const triggerLookups: string[] = [];
    const namespaceLists: string[] = [];
    const created: CreatedPolicy[] = [];
    const triggerSubscriptionId = options.triggerSubscriptionId ?? 'fixture-subscription';
    const triggerConfigNames = options.triggerConfigNames ?? ['fixture-trigger'];
    const client = {
        listNamespaces: async (context: ISubscriptionContext) => {
            namespaceLists.push(context.subscriptionId);
            return context.subscriptionId !== triggerSubscriptionId ? [] : [
                { id: `/subscriptions/${triggerSubscriptionId}/resourceGroups/other-rg/providers/Microsoft.Web/connectorGateways/other-ns`, name: 'other-ns', location: 'eastus' },
                { id: `/subscriptions/${triggerSubscriptionId}/resourceGroups/fixture-rg/providers/Microsoft.Web/connectorGateways/fixture-ns`, name: 'fixture-ns', location: 'westus' },
            ];
        },
        getTriggerConfig: async (_context: unknown, resourceGroupName: string, namespaceName: string, triggerConfigName: string) => {
            triggerLookups.push(`${resourceGroupName}/${namespaceName}`);
            if (namespaceName === 'other-ns') {
                throw new Error('Forbidden');
            }
            const configReceiveUri = receiveUri.replace('fixture-trigger', triggerConfigName);
            return triggerConfigNames.includes(triggerConfigName) ?
                { id: `${triggerConfigName}-id`, name: triggerConfigName, properties: { state: 'Enabled', pollingEndpoints: { receiveUri: configReceiveUri }, connectionDetails: { connectionName: 'fixture-connection' } } } :
                undefined;
        },
        listConnectionAccessPolicies: async () => options.listed ?? [],
        getConnectionAccessPolicy: async () => options.existingObjectId ?
            { properties: { principal: { type: 'ActiveDirectory', identity: { objectId: options.existingObjectId, tenantId: 'app-tenant' } } } } :
            undefined,
        createOrUpdateConnectionAccessPolicy: async (context: ISubscriptionContext, resourceGroupName: string, namespaceName: string, connectionName: string, policyName: string, body: unknown) => {
            created.push({ subscriptionId: context.subscriptionId, path: `${resourceGroupName}/${namespaceName}/${connectionName}/${policyName}`, body });
            return body;
        },
    } as unknown as ConnectorGatewayClient;
    const subscriptions = ['fixture-subscription', 'f5-subscription'].map(subscriptionId =>
        ({ subscriptionId, tenantId: 'fixture-tenant', environment }) as unknown as Awaited<ReturnType<LiveConnectorSubscriptionProvider>>[number]);
    const gateway = new AzureConnectorTriggerGatewayAdapter(client, new LiveConnectorSubscriptionResolver(async () => subscriptions));
    return { gateway, triggerLookups, namespaceLists, created };
}
