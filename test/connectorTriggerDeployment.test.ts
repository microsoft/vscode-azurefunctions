/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from '@azure/arm-appservice';
import { type ResourceGroup } from '@azure/arm-resources';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { ResourceGroupCreateStep, type IResourceGroupWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzExtFsExtra, createTestActionContext, UserCancelledError, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { type ConnectorGatewayClient } from '../src/commands/createFunction/connectorSteps/ConnectorGatewayClient';
import { type IFunctionAppWizardContext } from '../src/commands/createFunctionApp/IFunctionAppWizardContext';
import { ConfigureCommonNamesStep } from '../src/commands/createFunctionApp/UniqueNamePromptStep';
import {
    configureConnectorTriggerDeployment,
    ConnectorNamespaceResourceGroupDefault,
    grantConnectorTriggerAccess,
    mergeConnectorTriggerAppSettings,
    tryGetConnectorNamespaceResourceGroup,
    type ConnectorNamespaceResourceGroupContext,
    type ConnectorNamespaceResourceGroupDependencies,
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

    test('configures triggers enabled on the app even when disabled locally', async () => {
        const projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-deploy-'));
        try {
            await AzExtFsExtra.writeFile(path.join(projectPath, 'local.settings.json'), JSON.stringify({
                IsEncrypted: false,
                Values: {
                    ['AzureWebJobs.OnEnabledPoll.Disabled']: 'true',
                    ['AzureWebJobs.OnDisabledPoll.Disabled']: 'true',
                    ['ConnectorNamespace__pollingEndpoint']: pollingEndpoint,
                    OnNewEmailTriggerConfigName: 'fixture-trigger',
                    ['OtherConnector__clientSecret']: 'fixture-secret',
                },
            }));
            for (const remoteDisable of ['false', '', ' true ']) {
                const appSettings: StringDictionary = { properties: { ['azurewebjobs.onenabledpoll.disabled']: remoteDisable } };
                const fixture = createGatewayFixture();
                const context = await createContext();
                const changed = await configureConnectorTriggerDeployment(context, {
                    site: createSite({ type: 'SystemAssigned', principalId: 'app-principal', tenantId: 'app-tenant' }),
                    projectPath,
                    appSettings,
                }, {
                    gateway: fixture.gateway,
                    findBindings: async () => [
                        { ...binding, functionName: 'OnEnabledPoll' },
                        { connectionSettingName: 'OtherConnector', functionName: 'OnDisabledPoll', triggerConfigSettingName: 'OtherTriggerConfigName' },
                    ],
                });

                assert.strictEqual(changed, true);
                assert.strictEqual(appSettings.properties?.['azurewebjobs.onenabledpoll.disabled'], remoteDisable);
                assert.strictEqual(appSettings.properties?.['AzureWebJobs.OnDisabledPoll.Disabled'], 'true');
                assert.strictEqual(appSettings.properties?.['OtherConnector__clientSecret'], undefined);
                assert.strictEqual(appSettings.properties?.['OtherConnector__credential'], undefined);
                assert.strictEqual(fixture.created.length, 1);
                assert.strictEqual(context.telemetry.measurements.connectorTriggerDeployDisabledBindingCount, 1);
            }
        } finally {
            await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
        }
    });

    test('persists local disable settings when all target triggers are disabled', async () => {
        const projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-deploy-'));
        try {
            await AzExtFsExtra.writeFile(path.join(projectPath, 'local.settings.json'), JSON.stringify({
                IsEncrypted: false,
                Values: {
                    ['AzureWebJobs_LocalDisabled_Disabled']: 'true',
                    ['AzureWebJobs.RemoteDisabled.Disabled']: 'false',
                    ['ConnectorNamespace__clientSecret']: 'fixture-secret',
                    ['AzureWebJobsConnectorNamespace__clientSecret']: 'fixture-secret',
                    ['AZURE_CLIENT_SECRET']: 'fixture-secret',
                },
            }));
            const appSettings: StringDictionary = { properties: { Existing: 'value', ['azurewebjobs_remotedisabled_disabled']: 'true' } };
            const context = await createContext();
            const changed = await configureConnectorTriggerDeployment(context, { site: createSite(undefined), projectPath, appSettings }, {
                gateway: {} as ConnectorTriggerDeploymentGateway,
                findBindings: async () => [
                    { ...binding, functionName: 'LocalDisabled' },
                    { ...binding, functionName: 'RemoteDisabled' },
                ],
            });

            assert.strictEqual(changed, true);
            assert.deepStrictEqual(appSettings.properties, {
                Existing: 'value',
                ['azurewebjobs_remotedisabled_disabled']: 'true',
                ['AzureWebJobs_LocalDisabled_Disabled']: 'true',
                ['AzureWebJobs.RemoteDisabled.Disabled']: 'false',
            });
            assert.strictEqual(context.telemetry.measurements.connectorTriggerDeployDisabledBindingCount, 2);
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

        function createNamespaceGateway(namespaces: FixtureNamespace[], options: { failList?: boolean; failTriggerLookup?: string[] } = {}): ConnectorTriggerDeploymentGateway & { lists: string[] } {
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
                    if (options.failTriggerLookup?.includes(namespace.name)) {
                        throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
                    }
                    const endpoint = namespaces.find(ns => ns.name === namespace.name)?.triggers[triggerConfigName];
                    return endpoint ? { id: `${triggerConfigName}-id`, name: triggerConfigName, state: 'Enabled', connectionName: 'fixture-connection', pollingEndpoints: { receiveUri: `${endpoint}/triggerConfigs/${triggerConfigName}/receive` } } : undefined;
                },
                ensureConnectionAccessForPrincipal: async () => assert.fail('Choosing a resource group must not change access policies.'),
            } as unknown as ConnectorTriggerDeploymentGateway & { lists: string[] };
        }

        async function withProject<T>(callback: (projectPath: string) => Promise<T>, localSettings: string = JSON.stringify({ IsEncrypted: false, Values: localValues })): Promise<T> {
            const projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-rg-'));
            try {
                await AzExtFsExtra.writeFile(path.join(projectPath, 'local.settings.json'), localSettings);
                return await callback(projectPath);
            } finally {
                await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
            }
        }

        function getExistingResourceGroup(fail?: Error): ConnectorNamespaceResourceGroupDependencies['getResourceGroup'] & { requests: string[] } {
            const requests: string[] = [];
            return Object.assign(async (context: ISubscriptionContext, name: string): Promise<ResourceGroup> => {
                requests.push(`${context.subscriptionId}/${name}`);
                if (fail) {
                    throw fail;
                }
                return { id: `/subscriptions/${context.subscriptionId}/resourceGroups/${name}`, name, location: 'westus' };
            }, { requests });
        }

        async function resolve(gateway: ConnectorTriggerDeploymentGateway, bindings = [binding, otherBinding], getResourceGroup = getExistingResourceGroup()): Promise<{ name: string | undefined; outcome: string | undefined }> {
            return await withProject(async projectPath => {
                const context = await createContext();
                const resourceGroup = await tryGetConnectorNamespaceResourceGroup(context, projectPath, { gateway, findBindings: async () => bindings, getResourceGroup });
                return { name: resourceGroup?.name, outcome: context.telemetry.properties.connectorTriggerNamespaceResourceGroup as string | undefined };
            });
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

        test('never rewrites local.settings.json and skips the lookup when it is encrypted or unreadable', async () => {
            const gateway = createNamespaceGateway([
                { name: 'fixture-ns', resourceGroupName: 'connector-rg', subscriptionId: 'fixture-subscription', triggers: { ['fixture-trigger']: pollingEndpoint } },
            ]);
            const cases: { settings: string; outcome: string }[] = [
                { settings: `\uFEFF${JSON.stringify({ IsEncrypted: false, Values: localValues }, undefined, 4)}\r\n`, outcome: 'matched' },
                // `func settings decrypt`/`encrypt` would rewrite the file, and a failed re-encrypt would leave it in plaintext
                { settings: JSON.stringify({ IsEncrypted: true, Values: { OnNewEmailTriggerConfigName: 'ZW5jcnlwdGVk' } }), outcome: 'encrypted' },
                { settings: '{ "IsEncrypted": false, ', outcome: 'failed' },
            ];
            for (const { settings, outcome } of cases) {
                gateway.lists.length = 0;
                await withProject(async projectPath => {
                    const settingsPath = path.join(projectPath, 'local.settings.json');
                    const before = await fs.promises.readFile(settingsPath);
                    const context = await createContext();
                    await tryGetConnectorNamespaceResourceGroup(context, projectPath, { gateway, findBindings: async () => [binding], getResourceGroup: getExistingResourceGroup() });

                    assert.strictEqual(context.telemetry.properties.connectorTriggerNamespaceResourceGroup, outcome);
                    assert.ok(before.equals(await fs.promises.readFile(settingsPath)), `local.settings.json changed for outcome "${outcome}"`);
                    assert.deepStrictEqual(gateway.lists, outcome === 'matched' ? ['fixture-subscription'] : []);
                }, settings);
            }
        });

        test('warns instead of reporting not found when some namespaces could not be read, but a verified match still wins', async () => {
            const namespaces: FixtureNamespace[] = [
                { name: 'unreadable-ns', resourceGroupName: 'unreadable-rg', subscriptionId: 'fixture-subscription', triggers: {} },
                { name: 'fixture-ns', resourceGroupName: 'connector-rg', subscriptionId: 'fixture-subscription', triggers: { ['fixture-trigger']: pollingEndpoint } },
            ];
            const unreadableOnly = createNamespaceGateway(namespaces.slice(0, 1), { failTriggerLookup: ['unreadable-ns'] });
            assert.deepStrictEqual(await resolve(unreadableOnly, [binding]), { name: undefined, outcome: 'incomplete' });

            const withMatch = createNamespaceGateway(namespaces, { failTriggerLookup: ['unreadable-ns'] });
            assert.deepStrictEqual(await resolve(withMatch, [binding]), { name: 'connector-rg', outcome: 'matched' });

            // Failures are tracked per search, not by the deploy-wide telemetry flag an earlier lookup may have set
            await withProject(async projectPath => {
                const context = await createContext();
                context.telemetry.properties.connectorTriggerDeployLookupFailed = 'true';
                const missing = createNamespaceGateway(namespaces.slice(0, 1));
                await tryGetConnectorNamespaceResourceGroup(context, projectPath, { gateway: missing, findBindings: async () => [binding], getResourceGroup: getExistingResourceGroup() });
                assert.strictEqual(context.telemetry.properties.connectorTriggerNamespaceResourceGroup, 'notFound');
            });
        });

        test('falls back without creating anything when the namespace resource group cannot be read, but not when cancelled', async () => {
            const gateway = createNamespaceGateway([
                { name: 'fixture-ns', resourceGroupName: 'connector-rg', subscriptionId: 'fixture-subscription', triggers: { ['fixture-trigger']: pollingEndpoint } },
            ]);
            const forbidden = Object.assign(new Error('Forbidden'), { code: 'AuthorizationFailed', statusCode: 403 });
            const getResourceGroup = getExistingResourceGroup(forbidden);
            assert.deepStrictEqual(await resolve(gateway, [binding], getResourceGroup), { name: undefined, outcome: 'failed' });
            assert.deepStrictEqual(getResourceGroup.requests, ['fixture-subscription/connector-rg']);

            await assert.rejects(resolve(gateway, [binding], getExistingResourceGroup(new UserCancelledError('fixture'))), UserCancelledError);
        });

        test('selects the existing resource group so it is masked and never created or updated', async () => {
            const gateway = createNamespaceGateway([
                { name: 'fixture-ns', resourceGroupName: 'connector-rg', subscriptionId: 'fixture-subscription', triggers: { ['fixture-trigger']: pollingEndpoint } },
            ]);
            await withProject(async projectPath => {
                const context = await createContext() as ConnectorNamespaceResourceGroupContext;
                await new ConnectorNamespaceResourceGroupDefault({ gateway, findBindings: async () => [binding], getResourceGroup: getExistingResourceGroup() }).apply(context, projectPath);

                assert.strictEqual(context.resourceGroup?.name, 'connector-rg');
                assert.strictEqual(context.newResourceGroupName, undefined);
                assert.ok(context.valuesToMask.includes('connector-rg'));
                // ResourceGroupCreateStep suppresses a 403 from checkExistence and would then call createOrUpdate on a named group
                assert.strictEqual(new ResourceGroupCreateStep().shouldExecute(context as unknown as IResourceGroupWizardContext), false);

                // Basic creation's generated names must not replace the selected group, or the identity is created in a missing group
                Object.assign(context, { relatedNameTask: Promise.resolve('generatedname') });
                await new ConfigureCommonNamesStep().configureBeforePrompt(context as unknown as IFunctionAppWizardContext);
                assert.strictEqual(context.newResourceGroupName, undefined);
                assert.strictEqual(context.resourceGroup?.name, 'connector-rg');
            });
        });

        test('keeps a chosen resource group and drops its own default when the subscription changes', async () => {
            const gateway = createNamespaceGateway([
                { name: 'fixture-ns', resourceGroupName: 'connector-rg', subscriptionId: 'fixture-subscription', triggers: { ['fixture-trigger']: pollingEndpoint } },
            ]);
            await withProject(async projectPath => {
                const getResourceGroup = getExistingResourceGroup();
                const resourceGroupDefault = new ConnectorNamespaceResourceGroupDefault({ gateway, findBindings: async () => [binding], getResourceGroup });

                const chosen = { name: 'chosen-rg', location: 'westus' };
                const chosenContext = Object.assign(await createContext(), { resourceGroup: chosen }) as ConnectorNamespaceResourceGroupContext;
                await resourceGroupDefault.apply(chosenContext, projectPath);
                assert.strictEqual(chosenContext.resourceGroup, chosen);
                const advancedContext = Object.assign(await createContext(), { advancedCreation: true }) as ConnectorNamespaceResourceGroupContext;
                await resourceGroupDefault.apply(advancedContext, projectPath);
                assert.strictEqual(advancedContext.resourceGroup, undefined);
                assert.deepStrictEqual(getResourceGroup.requests, []);

                const context = await createContext() as ConnectorNamespaceResourceGroupContext;
                await resourceGroupDefault.apply(context, projectPath);
                assert.strictEqual(context.resourceGroup?.name, 'connector-rg');

                // Back to a different subscription where the namespace isn't found
                Object.assign(context, { subscriptionId: 'f5-subscription' });
                await resourceGroupDefault.apply(context, projectPath);
                assert.strictEqual(context.resourceGroup, undefined);
                assert.deepStrictEqual(getResourceGroup.requests, ['fixture-subscription/connector-rg']);
            });
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
