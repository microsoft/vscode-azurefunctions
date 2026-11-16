/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';
import { ConnectorAzdAuthTokenError } from '../src/debug/connectorNamespace/connectorTriggerAzdAuthServer';
import { type ConnectorTriggerF5Dependencies, type ConnectorTriggerHostLaunch, type ConnectorTriggerLocalBinding } from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { ConnectorTriggerF5SetupError } from '../src/debug/connectorNamespace/connectorTriggerF5Setup';
import { validateConnectorNamespacePreDebug } from '../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';
import { getFuncCliPath } from '../src/funcCoreTools/getFuncCliPath';
import { cpUtils } from '../src/utils/cpUtils';

const binding: ConnectorTriggerLocalBinding = {
    connectionSettingName: 'SyntheticConnection',
    triggerConfigSettingName: 'SyntheticTriggerConfigName',
};
const endpointKey = `${binding.connectionSettingName}__pollingEndpoint`;
const configKey = binding.triggerConfigSettingName;
const validEndpoint = 'https://synthetic.example.logic.azure.com/api/connectorGateways/synthetic-gateway';
const validConfig = 'synthetic-trigger-config';

interface Harness {
    context: IActionContext;
    dependencies: ConnectorTriggerF5Dependencies;
    prompts: { message: string; items: string[] }[];
    azureCalls: string[];
}

async function createHarness(answer?: string): Promise<Harness> {
    const context = await createTestActionContext();
    const prompts: Harness['prompts'] = [];
    const azureCalls: string[] = [];
    context.ui.showWarningMessage = async <T extends vscode.MessageItem>(message: string, ...args: unknown[]): Promise<T> => {
        const items = args.slice(1) as T[];
        prompts.push({ message, items: items.map(item => item.title) });
        const selected = items.find(item => item.title === answer);
        if (!selected) {
            throw new Error('Unexpected prompt');
        }
        return selected;
    };
    const record = (name: string) => async (): Promise<never> => {
        azureCalls.push(name);
        throw new Error(`Unexpected ${name}`);
    };
    const dependencies = {
        bindingResolver: { find: async () => [binding], resolve: async () => binding },
        projectStore: { read: async () => undefined },
        gateway: new Proxy({}, { get: (_target, name) => record(`gateway.${String(name)}`) }),
        operationResolver: new Proxy({}, { get: (_target, name) => record(`operationResolver.${String(name)}`) }),
        openSetup: record('openSetup'),
        localSettingsWriter: { write: record('localSettingsWriter.write') },
        workspaceIdentity: { get: async () => 'synthetic-workspace-id' },
        azdAuth: { prepare: async () => true, updateIdentity: async () => undefined, authorize: async () => undefined, dispose: () => undefined },
    } as unknown as ConnectorTriggerF5Dependencies;
    return { context, dependencies, prompts, azureCalls };
}

suite('Connector Namespace pre-debug flow', () => {
    let projectPath: string;
    const savedEnvironment: Record<string, string | undefined> = {};

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-predebug-'));
        for (const key of [endpointKey, configKey]) {
            savedEnvironment[key] = process.env[key];
            delete process.env[key];
        }
    });

    teardown(async () => {
        for (const [key, value] of Object.entries(savedEnvironment)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        await fs.promises.rm(projectPath, { recursive: true, force: true });
    });

    async function writeSettings(settings: unknown): Promise<void> {
        await fs.promises.writeFile(path.join(projectPath, 'local.settings.json'), JSON.stringify(settings));
    }

    async function readSettings(): Promise<string> {
        return (await fs.promises.readFile(path.join(projectPath, 'local.settings.json'))).toString();
    }

    test('retires azd authentication when bindings are removed or another credential is selected', async () => {
        const harness = await createHarness();
        const disposed: string[] = [];
        harness.dependencies.azdAuth = {
            prepare: async () => assert.fail('The azd server must not be prepared.'),
            updateIdentity: async () => assert.fail('The selected identity must not be changed.'),
            authorize: async () => assert.fail('Consent must not be requested.'),
            dispose: project => { disposed.push(project); },
        };
        harness.dependencies.bindingResolver.find = async () => [];
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies);

        await writeSettings({ IsEncrypted: false, Values: {
            [endpointKey]: validEndpoint,
            [configKey]: validConfig,
            AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential',
        } });
        harness.dependencies.bindingResolver.find = async () => [binding];
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        });
        assert.deepStrictEqual(disposed, [projectPath, projectPath]);
        assert.deepStrictEqual(harness.azureCalls, []);
    });

    test('requests polling consent for an already configured Connector before returning', async () => {
        await writeSettings({ IsEncrypted: false, Values: {
            [endpointKey]: validEndpoint,
            [configKey]: validConfig,
            [`${binding.connectionSettingName}__tenantId`]: 'Fixture-Tenant',
        } });
        const harness = await createHarness();
        const calls: string[] = [];
        harness.dependencies.azdAuth = {
            prepare: async () => { calls.push('prepare'); return true; },
            updateIdentity: async () => assert.fail('Already configured'),
            authorize: async (project, tenants) => {
                assert.strictEqual(project, projectPath);
                assert.deepStrictEqual(tenants, ['fixture-tenant']);
                calls.push('authorize');
            },
            dispose: () => assert.fail('VS Code authentication is still selected'),
        };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        });
        assert.deepStrictEqual(calls, ['prepare', 'authorize']);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
    });

    test('blocks host startup with the actionable consent error', async () => {
        await writeSettings({ IsEncrypted: false, Values: { [endpointKey]: validEndpoint, [configKey]: validConfig } });
        const harness = await createHarness();
        assert.ok(harness.dependencies.azdAuth);
        harness.dependencies.azdAuth.authorize = async () => {
            throw new ConnectorAzdAuthTokenError('NotSignedInError', 'Sign in through Azure Resources.');
        };
        await assert.rejects(validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        }), /Sign in through Azure Resources/);
    });

    test('does not expose unexpected authentication errors during consent', async () => {
        await writeSettings({ IsEncrypted: false, Values: { [endpointKey]: validEndpoint, [configKey]: validConfig } });
        const harness = await createHarness();
        assert.ok(harness.dependencies.azdAuth);
        harness.dependencies.azdAuth.authorize = async () => { throw new Error('private-detail'); };
        await assert.rejects(validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        }), (error: unknown) => error instanceof ConnectorTriggerF5SetupError &&
            /authorize the Connector Trigger polling scope/.test(error.message) && !String(error.cause).includes('private-detail'));
    });

    test('requests consent for the decrypted tenant without changing encrypted settings', async () => {
        await writeSettings({ IsEncrypted: true, Values: {
            [endpointKey]: 'encrypted',
            [configKey]: 'encrypted',
            [`${binding.connectionSettingName}__tenantId`]: 'encrypted',
        } });
        const before = await readSettings();
        const harness = await createHarness();
        const calls: string[] = [];
        harness.dependencies.readEncryptedTenants = async (_context, project, encrypted) => {
            assert.strictEqual(project, projectPath);
            assert.deepStrictEqual(encrypted, ['encrypted']);
            calls.push('read');
            return ['Fixture-Tenant'];
        };
        harness.dependencies.azdAuth = {
            prepare: async (_context, _project, options) => {
                assert.strictEqual(options.identity.tenantId, 'fixture-tenant');
                calls.push('prepare');
                return true;
            },
            updateIdentity: async () => assert.fail('Already configured'),
            authorize: async (_project, tenants) => {
                assert.deepStrictEqual(tenants, ['fixture-tenant']);
                calls.push('authorize');
            },
            dispose: () => assert.fail('VS Code authentication is still selected'),
        };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        });
        assert.deepStrictEqual(calls, ['read', 'prepare', 'authorize']);
        assert.strictEqual(await readSettings(), before);
    });

    test('requests consent before debug with a Core Tools encrypted tenant', async function () {
        if (!process.env.FUNC_TEST_ENCRYPTED_TENANTS) {
            this.skip();
        }
        this.timeout(30000);
        await writeSettings({ IsEncrypted: false, Values: {
            [endpointKey]: validEndpoint,
            [configKey]: validConfig,
            [`${binding.connectionSettingName}__tenantId`]: 'fixture-tenant',
        } });
        const harness = await createHarness();
        const cli = await getFuncCliPath(harness.context, projectPath);
        const encrypted = await cpUtils.tryExecuteCommand(undefined, projectPath, cli, ['settings', 'encrypt']);
        assert.strictEqual(encrypted.code, 0, 'Core Tools could not encrypt the synthetic fixture');
        const before = await readSettings();
        const environment: Record<string, string> = {};
        for (const [name, value] of Object.entries(process.env)) {
            if (value !== undefined) {
                environment[name] = value;
            }
        }
        const excluded = [
            'AZURE_TOKEN_CREDENTIALS', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_CLIENT_CERTIFICATE_PATH',
            'AZURE_FEDERATED_TOKEN_FILE', 'IDENTITY_ENDPOINT', 'MSI_ENDPOINT', 'AZURE_TENANT_ID',
            configKey,
        ].map(name => name.toLowerCase());
        for (const name of Object.keys(environment)) {
            if (excluded.includes(name.toLowerCase()) || name.toLowerCase().startsWith(`${binding.connectionSettingName.toLowerCase()}__`)) {
                delete environment[name];
            }
        }
        const calls: string[] = [];
        assert.ok(harness.dependencies.azdAuth);
        harness.dependencies.azdAuth.prepare = async (_context, _project, options) => {
            assert.strictEqual(options.identity.tenantId, 'fixture-tenant');
            calls.push('prepare');
            return true;
        };
        harness.dependencies.azdAuth.authorize = async (_project, tenants) => {
            assert.deepStrictEqual(tenants, ['fixture-tenant']);
            calls.push('authorize');
        };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment },
        });
        assert.deepStrictEqual(calls, ['prepare', 'authorize']);
        assert.strictEqual(await readSettings(), before);
    });

    test('uses the host environment tenant before encrypted values', async () => {
        await writeSettings({ IsEncrypted: true, Values: {
            [endpointKey]: 'encrypted',
            [configKey]: 'encrypted',
            [`${binding.connectionSettingName}__tenantId`]: 'encrypted',
        } });
        const harness = await createHarness();
        harness.dependencies.readEncryptedTenants = async () => assert.fail('The environment overrides the encrypted value');
        assert.ok(harness.dependencies.azdAuth);
        harness.dependencies.azdAuth.authorize = async (_project, tenants) => {
            assert.deepStrictEqual(tenants, ['environment-tenant']);
        };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {
                [`${binding.connectionSettingName}__tenantId`]: 'Environment-Tenant',
            } },
        });
    });

    test('requests consent for the default tenant when encrypted settings contain no tenant', async () => {
        await writeSettings({ IsEncrypted: true, Values: { [endpointKey]: 'encrypted', [configKey]: 'encrypted' } });
        const harness = await createHarness();
        assert.ok(harness.dependencies.azdAuth);
        harness.dependencies.azdAuth.authorize = async (_project, tenants) => {
            assert.deepStrictEqual(tenants, [undefined]);
        };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        });
    });

    test('uses encrypted AZURE_TENANT_ID when the connection has no tenant', async () => {
        await writeSettings({ IsEncrypted: true, Values: {
            [endpointKey]: 'encrypted',
            [configKey]: 'encrypted',
            AZURE_TENANT_ID: 'encrypted-default-tenant',
        } });
        const harness = await createHarness();
        harness.dependencies.readEncryptedTenants = async (_context, _project, encrypted) => {
            assert.deepStrictEqual(encrypted, ['encrypted-default-tenant']);
            return ['Default-Tenant'];
        };
        assert.ok(harness.dependencies.azdAuth);
        harness.dependencies.azdAuth.authorize = async (_project, tenants) => {
            assert.deepStrictEqual(tenants, ['default-tenant']);
        };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        });
    });

    test('authorizes each encrypted connection tenant before starting a multi-event project', async () => {
        const second: ConnectorTriggerLocalBinding = {
            connectionSettingName: 'AnotherConnection',
            triggerConfigSettingName: 'AnotherTriggerConfig',
        };
        await writeSettings({ IsEncrypted: true, Values: {
            [endpointKey]: 'encrypted',
            [configKey]: 'encrypted',
            [`${binding.connectionSettingName}__tenantId`]: 'first-cipher',
            [`${second.connectionSettingName}__pollingEndpoint`]: 'encrypted',
            [second.triggerConfigSettingName]: 'encrypted',
            [`${second.connectionSettingName}__tenantId`]: 'second-cipher',
        } });
        const harness = await createHarness();
        harness.dependencies.bindingResolver.find = async () => [binding, second];
        harness.dependencies.readEncryptedTenants = async (_context, _project, encrypted) => {
            assert.deepStrictEqual(encrypted, ['first-cipher', 'second-cipher']);
            return ['First-Tenant', 'Second-Tenant'];
        };
        assert.ok(harness.dependencies.azdAuth);
        harness.dependencies.azdAuth.prepare = async (_context, _project, options) => {
            assert.strictEqual(options.identity.tenantId, undefined);
            return true;
        };
        harness.dependencies.azdAuth.authorize = async (_project, tenants) => {
            assert.deepStrictEqual(tenants, ['first-tenant', 'second-tenant']);
        };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        });
    });

    test('prefers an encrypted connection tenant over the environment default', async () => {
        await writeSettings({ IsEncrypted: true, Values: {
            [endpointKey]: 'encrypted',
            [configKey]: 'encrypted',
            [`${binding.connectionSettingName}__tenantId`]: 'connection-cipher',
        } });
        const harness = await createHarness();
        harness.dependencies.readEncryptedTenants = async () => ['connection-tenant'];
        assert.ok(harness.dependencies.azdAuth);
        harness.dependencies.azdAuth.authorize = async (_project, tenants) => {
            assert.deepStrictEqual(tenants, ['connection-tenant']);
        };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {
                AZURE_TENANT_ID: 'environment-tenant',
            } },
        });
    });

    test('blocks setup before any Azure change when a valid environment override exists for a setting setup must write', async () => {
        await writeSettings({ IsEncrypted: false, Values: {} });
        process.env[endpointKey] = validEndpoint;
        const harness = await createHarness('Debug Anyway');

        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies);

        assert.deepStrictEqual(harness.azureCalls, []);
        assert.strictEqual(harness.prompts.length, 1);
        assert.deepStrictEqual(harness.prompts[0].items, ['Debug Anyway']);
        assert.match(harness.prompts[0].message, /environment variable/i);
        assert.ok(!harness.prompts[0].message.includes(validEndpoint));
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupBlocked, 'environmentOverride');
    });

    test('uses the provided effective host environment instead of the extension host environment', async () => {
        await writeSettings({ IsEncrypted: false, Values: {} });
        const configured = await createHarness();
        await validateConnectorNamespacePreDebug(configured.context, projectPath, configured.dependencies, {
            environment: { [endpointKey]: validEndpoint, [configKey]: validConfig },
        });
        assert.deepStrictEqual(configured.prompts, []);
        assert.strictEqual(configured.context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');

        process.env[endpointKey] = validEndpoint;
        process.env[configKey] = validConfig;
        const unconfigured = await createHarness('Debug Anyway');
        await validateConnectorNamespacePreDebug(unconfigured.context, projectPath, unconfigured.dependencies, { environment: {} });
        assert.deepStrictEqual(unconfigured.prompts[0].items, ['Configure', 'Debug Anyway']);
        assert.deepStrictEqual(unconfigured.azureCalls, []);
    });

    test('skips setup when the injected host launch environment has valid settings', async () => {
        await writeSettings({ IsEncrypted: false, Values: {} });
        const harness = await createHarness('Debug Anyway');
        harness.dependencies.hostLaunch = {
            kind: 'task',
            execution: 'process',
            environment: { [endpointKey]: validEndpoint, [configKey]: validConfig },
        };

        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, { environment: {} });

        assert.deepStrictEqual(harness.prompts, []);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
        assert.deepStrictEqual(harness.azureCalls, []);
    });

    test('blocks setup when an injected host launch environment overrides a setting', async () => {
        await writeSettings({ IsEncrypted: false, Values: {} });
        const harness = await createHarness('Debug Anyway');
        harness.dependencies.hostLaunch = {
            kind: 'exactEnvironment',
            environment: { [endpointKey]: validEndpoint },
        };

        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, { environment: {} });

        assert.deepStrictEqual(harness.prompts[0].items, ['Debug Anyway']);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupBlocked, 'environmentOverride');
        assert.deepStrictEqual(harness.azureCalls, []);
    });

    test('forwards the selected host launch to setup and validates its environment', async () => {
        await writeSettings({ IsEncrypted: false, Values: {} });
        process.env[endpointKey] = validEndpoint;
        const harness = await createHarness('Configure');
        const hostLaunch: ConnectorTriggerHostLaunch = {
            kind: 'exactEnvironment',
            environment: { SYNTHETIC_TASK_VARIABLE: 'synthetic-task-value' },
        };
        let forwarded: ConnectorTriggerHostLaunch | undefined;
        harness.dependencies.hostLaunch = { kind: 'exactEnvironment', environment: {} };
        harness.dependencies.openSetup = async context => {
            forwarded = (context as IActionContext & { hostLaunch?: ConnectorTriggerHostLaunch }).hostLaunch;
            throw new UserCancelledError('syntheticSetup');
        };

        await assert.rejects(
            validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
                environment: { [endpointKey]: validEndpoint, [configKey]: validConfig },
                hostLaunch,
            }),
            isUserCancelledError,
        );

        assert.deepStrictEqual(forwarded, hostLaunch);
        assert.deepStrictEqual(harness.prompts[0].items, ['Configure', 'Debug Anyway']);
        assert.deepStrictEqual(harness.azureCalls, []);
    });

    test('rejects setup for an unverified task launch without provisioning or writing settings', async () => {
        const taskLaunch: ConnectorTriggerHostLaunch = {
            kind: 'task',
            execution: 'process',
            environment: { SYNTHETIC_TASK_VARIABLE: 'synthetic-task-value' },
            environmentLayers: [{ SYNTHETIC_TASK_VARIABLE: 'synthetic-task-value', SYNTHETIC_DELETED_VARIABLE: null }],
        };
        await writeSettings({ IsEncrypted: false, Values: {} });
        const before = await readSettings();

        for (const viaOptions of [true, false]) {
            const harness = await createHarness('Configure');
            let setupOpened = false;
            harness.dependencies.openSetup = async () => {
                setupOpened = true;
                throw new UserCancelledError('syntheticSetup');
            };
            if (!viaOptions) {
                harness.dependencies.hostLaunch = taskLaunch;
            }

            await assert.rejects(
                validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, viaOptions ? { hostLaunch: taskLaunch } : { environment: {} }),
                (error: unknown) => error instanceof ConnectorTriggerF5SetupError && /can't verify the identity/.test(error.message),
            );
            assert.strictEqual(setupOpened, false);
            assert.deepStrictEqual(harness.azureCalls, []);
            assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupBlocked, 'unverifiedTaskLaunch');
        }
        assert.strictEqual(await readSettings(), before);

        const debugAnyway = await createHarness('Debug Anyway');
        await validateConnectorNamespacePreDebug(debugAnyway.context, projectPath, debugAnyway.dependencies, { hostLaunch: taskLaunch });
        assert.strictEqual(debugAnyway.context.telemetry.properties.connectorF5SetupResult, 'debugAnyway');

        const configuredByTask = await createHarness();
        await validateConnectorNamespacePreDebug(configuredByTask.context, projectPath, configuredByTask.dependencies, {
            hostLaunch: { ...taskLaunch, environment: { [endpointKey]: validEndpoint, [configKey]: validConfig } },
        });
        assert.deepStrictEqual(configuredByTask.prompts, []);
        assert.strictEqual(configuredByTask.context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
        assert.deepStrictEqual(configuredByTask.azureCalls, []);
    });

    test('defers encrypted settings that are present to Core Tools without changing the file', async () => {
        const encrypted = { IsEncrypted: true, Values: { [endpointKey]: 'U3ludGhldGljQ2lwaGVy', [configKey.toLowerCase()]: 'QW5vdGhlckNpcGhlcg==' } };
        await writeSettings(encrypted);
        const before = await readSettings();
        const harness = await createHarness();

        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies);

        assert.deepStrictEqual(harness.prompts, []);
        assert.deepStrictEqual(harness.azureCalls, []);
        assert.strictEqual(await readSettings(), before);
        assert.strictEqual(harness.context.telemetry.properties.connectorNamespaceSettingsEncrypted, 'true');
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
    });

    test('asks to decrypt instead of offering Configure when encrypted settings are missing', async () => {
        await writeSettings({ IsEncrypted: true, Values: { [endpointKey]: 'U3ludGhldGljQ2lwaGVy' } });
        const before = await readSettings();
        const harness = await createHarness('Debug Anyway');

        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies);

        assert.deepStrictEqual(harness.prompts[0].items, ['Debug Anyway']);
        assert.match(harness.prompts[0].message, /decrypt/i);
        assert.deepStrictEqual(harness.azureCalls, []);
        assert.strictEqual(await readSettings(), before);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupBlocked, 'encrypted');
    });

    test('treats non-string setting values as invalid and offers repair', async () => {
        for (const values of [{ [endpointKey]: 42, [configKey]: validConfig }, { [endpointKey]: validEndpoint, [configKey]: 7 }, { [endpointKey]: null, [configKey]: { name: validConfig } }]) {
            await writeSettings({ IsEncrypted: false, Values: values });
            const harness = await createHarness('Debug Anyway');

            await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies);

            assert.deepStrictEqual(harness.prompts[0].items, ['Configure', 'Debug Anyway']);
            assert.strictEqual(harness.context.telemetry.properties.connectorNamespaceSettingsValid, 'false');
            assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupResult, 'debugAnyway');
        }
    });

    test('accepts valid plaintext settings with host-style case-insensitive names', async () => {
        await writeSettings({ IsEncrypted: false, Values: { [endpointKey.toUpperCase()]: validEndpoint, [configKey]: validConfig } });
        const harness = await createHarness();

        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies);

        assert.deepStrictEqual(harness.prompts, []);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
    });

    test('cancels when a blocked setup prompt is dismissed', async () => {
        await writeSettings({ IsEncrypted: false, Values: {} });
        process.env[configKey] = '<trigger-config-name>';
        const harness = await createHarness('Debug Anyway');
        harness.context.ui.showWarningMessage = async () => { throw new Error('dismissed'); };

        await assert.rejects(validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies));
        assert.deepStrictEqual(harness.azureCalls, []);
        const cancelled = await createHarness('Not offered');
        cancelled.context.ui.showWarningMessage = async () => ({ title: 'Configure' }) as never;
        await assert.rejects(
            validateConnectorNamespacePreDebug(cancelled.context, projectPath, cancelled.dependencies),
            (error: unknown) => isUserCancelledError(error),
        );
        assert.deepStrictEqual(cancelled.azureCalls, []);
    });
});
