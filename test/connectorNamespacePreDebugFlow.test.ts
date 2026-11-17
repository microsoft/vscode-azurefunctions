/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Position, Uri, WorkspaceEdit, workspace } from 'vscode';
import type * as vscode from 'vscode';
import { ConnectorTriggerProjectMetadataError } from '../src/connectorTrigger/connectorTriggerProjectMetadata';
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
        azdAuth: { prepare: async () => true, getAccount: () => undefined, updateIdentity: async () => undefined, authorize: async () => undefined, dispose: () => undefined },
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
            getAccount: () => undefined,
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

    test('does not replace an explicitly selected Azure Developer CLI credential', async () => {
        await writeSettings({ IsEncrypted: false, Values: {
            [endpointKey]: validEndpoint,
            [configKey]: validConfig,
            AZURE_TOKEN_CREDENTIALS: 'AzureDeveloperCliCredential',
        } });
        const harness = await createHarness();
        assert.ok(harness.dependencies.azdAuth);
        harness.dependencies.azdAuth.prepare = async () => assert.fail('Explicit credentials must not be replaced.');
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        });
        assert.strictEqual(harness.context.telemetry.properties.connectorAzdAuth, 'false');
    });

    test('authorizes configured events when debugging an incomplete multi-event project', async () => {
        const incomplete = { connectionSettingName: 'IncompleteConnection', triggerConfigSettingName: 'IncompleteConfig' };
        await writeSettings({ IsEncrypted: false, Values: {
            [endpointKey]: validEndpoint,
            [configKey]: validConfig,
            [`${binding.connectionSettingName}__tenantId`]: 'Configured-Tenant',
            [`${incomplete.connectionSettingName}__tenantId`]: 'Incomplete-Tenant',
        } });
        const harness = await createHarness('Debug Anyway');
        harness.dependencies.bindingResolver.find = async () => [binding, incomplete];
        assert.ok(harness.dependencies.azdAuth);
        const authorized: (string | undefined)[][] = [];
        harness.dependencies.azdAuth.authorize = async (_context, _project, tenants) => { authorized.push(tenants); };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
        });
        assert.deepStrictEqual(authorized, [['configured-tenant']]);
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
            getAccount: () => undefined,
            updateIdentity: async () => assert.fail('Already configured'),
            authorize: async (_context, project, tenants) => {
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
                assert.deepStrictEqual(options.tenantIds, ['fixture-tenant']);
                calls.push('prepare');
                return true;
            },
            getAccount: () => undefined,
            updateIdentity: async () => assert.fail('Already configured'),
            authorize: async (_context, _project, tenants) => {
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
            assert.deepStrictEqual(options.tenantIds, ['fixture-tenant']);
            calls.push('prepare');
            return true;
        };
        harness.dependencies.azdAuth.authorize = async (_context, _project, tenants) => {
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
        harness.dependencies.azdAuth.authorize = async (_context, _project, tenants) => {
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
        harness.dependencies.azdAuth.authorize = async (_context, _project, tenants) => {
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
        harness.dependencies.azdAuth.authorize = async (_context, _project, tenants) => {
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
            assert.deepStrictEqual(options.tenantIds, ['first-tenant', 'second-tenant']);
            return true;
        };
        harness.dependencies.azdAuth.authorize = async (_context, _project, tenants) => {
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
        harness.dependencies.azdAuth.authorize = async (_context, _project, tenants) => {
            assert.deepStrictEqual(tenants, ['connection-tenant']);
        };
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {
                AZURE_TENANT_ID: 'environment-tenant',
            } },
        });
    });

    test('skips Poll triggers for functions disabled in local settings or the host environment', async () => {
        const enabled = { ...binding, functionName: 'EnabledPoll' };
        const disabledInFile = { connectionSettingName: 'OtherConnection', functionName: 'DisabledInFile', triggerConfigSettingName: 'DisabledInFileConfig' };
        const disabledInEnvironment = { connectionSettingName: 'OtherConnection', functionName: 'DisabledInEnvironment', triggerConfigSettingName: 'DisabledInEnvironmentConfig' };
        await writeSettings({
            IsEncrypted: false,
            Values: {
                [endpointKey]: validEndpoint,
                [configKey]: validConfig,
                'AzureWebJobs.DisabledInFile.Disabled': 'false',
                'azurewebjobs_disabledinfile_disabled': 'true',
            },
        });
        const harness = await createHarness();
        harness.dependencies.bindingResolver.find = async () => [enabled, disabledInFile, disabledInEnvironment];

        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            environment: { 'AzureWebJobs.DisabledInEnvironment.Disabled': 'false', 'azurewebjobs_disabledinenvironment_disabled': '1' },
        });

        assert.deepStrictEqual(harness.prompts, []);
        assert.deepStrictEqual(harness.azureCalls, []);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
        assert.strictEqual(harness.context.telemetry.measurements.connectorDisabledPollTriggerCount, 2);
    });

    test('matches disable environment names case-insensitively across platforms', async () => {
        const scenarios = [
            { functionName: 'DottedPoll', name: 'AzureWebJobs.DottedPoll.Disabled', variant: 'azurewebjobs.dottedpoll.disabled', value: 'TrUe', local: 'false', disabled: true, explicitUndefined: false },
            { functionName: 'UnderscorePoll', name: 'AzureWebJobs_UnderscorePoll_Disabled', variant: 'aZuReWeBjObS_uNdErScOrEpOlL_dIsAbLeD', value: '1', local: undefined, disabled: true, explicitUndefined: true },
            { functionName: 'EnabledPoll', name: 'AzureWebJobs.EnabledPoll.Disabled', variant: 'azurewebjobs.enabledpoll.disabled', value: 'false', local: 'true', disabled: false, explicitUndefined: true },
        ];
        for (const scenario of scenarios) {
            await writeSettings({ IsEncrypted: false, Values: { [scenario.name]: scenario.local } });
            const harness = await createHarness('Debug Anyway');
            harness.dependencies.bindingResolver.find = async () => [{ ...binding, functionName: scenario.functionName }];
            const environment: Record<string, string | undefined> = {};
            if (scenario.explicitUndefined) {
                environment[scenario.name] = undefined;
            }
            environment[scenario.variant] = scenario.value;

            await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, { environment });

            assert.strictEqual(harness.context.telemetry.measurements.connectorDisabledPollTriggerCount, scenario.disabled ? 1 : 0);
            assert.strictEqual(harness.prompts.length, scenario.disabled ? 0 : 1);
            assert.deepStrictEqual(harness.azureCalls, []);
        }
    });

    test('offers Connector Namespace guidance and Debug for webhook triggers before polling setup', async () => {
        await fs.promises.writeFile(path.join(projectPath, 'Webhook.cs'),
            '[Function("Webhook")] public void Run([ConnectorTrigger] string payload) {}');

        const cancelled = await createHarness();
        cancelled.dependencies.bindingResolver.find = async () => assert.fail('Cancel must stop before polling setup');
        cancelled.context.ui.showWarningMessage = async () => { throw new UserCancelledError(); };
        await assert.rejects(validateConnectorNamespacePreDebug(
            cancelled.context, projectPath, cancelled.dependencies), isUserCancelledError);

        const debug = await createHarness('Debug');
        let options: unknown;
        const show = debug.context.ui.showWarningMessage;
        debug.context.ui.showWarningMessage = async (message, ...args) => {
            options = args[0];
            return await show(message, ...args as [vscode.MessageOptions, ...vscode.MessageItem[]]) as never;
        };
        let pollingChecked = false;
        debug.dependencies.bindingResolver.find = async () => {
            pollingChecked = true;
            return [];
        };
        await validateConnectorNamespacePreDebug(debug.context, projectPath, debug.dependencies);
        assert.deepStrictEqual(debug.prompts[0].items, ['Debug']);
        assert.deepStrictEqual(options, { modal: true, stepName: 'connectorWebhookNamespaceSetup', learnMoreLink: 'https://aka.ms/connector-webhook-localdev' });
        assert.ok(pollingChecked, 'Debug continues the remaining pre-debug checks');
        assert.deepStrictEqual(debug.azureCalls, []);
    });

    test('checks the delivery mode recorded for each event before inspecting code', async () => {
        const writeDeliveryModes = async (...modes: unknown[]) => {
            await fs.promises.mkdir(path.join(projectPath, '.vscode'), { recursive: true });
            await fs.promises.writeFile(path.join(projectPath, '.vscode', 'settings.json'), JSON.stringify({
                'azureFunctions.connectorTriggerEvents': modes.map((deliveryMode, index) =>
                    ({ connectorId: 'custom', operationId: `Event${index}`, ...(deliveryMode === undefined ? {} : { deliveryMode }) })),
            }));
        };
        const run = async () => {
            let prompted = false;
            const harness = await createHarness('Debug');
            harness.dependencies.bindingResolver.find = async () => [];
            const show = harness.context.ui.showWarningMessage;
            harness.context.ui.showWarningMessage = async (message, ...args) => {
                prompted = true;
                return await show(message, ...args as [vscode.MessageOptions, ...vscode.MessageItem[]]) as never;
            };
            await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies);
            return { prompted, source: harness.context.telemetry.properties.connectorDeliveryModeSource };
        };

        // A webhook event mixed with Poll events prompts even when its trigger code can't be recognized.
        await fs.promises.writeFile(path.join(projectPath, 'function_app.py'), 'app = make_app()\n');
        await writeDeliveryModes('poll', 'webhook');
        assert.deepStrictEqual(await run(), { prompted: true, source: 'setting' });

        // Poll events do not prompt on their own.
        await writeDeliveryModes('poll', 'poll');
        assert.deepStrictEqual(await run(), { prompted: false, source: 'code' });

        // Code is still inspected for webhook functions added alongside recorded Poll events.
        await fs.promises.writeFile(path.join(projectPath, 'Webhook.cs'),
            '[Function("Webhook")] public void Run([ConnectorTrigger] string payload) {}');
        assert.deepStrictEqual(await run(), { prompted: true, source: 'code' });

        // An unreadable record is ignored rather than blocking F5, so code inspection still applies.
        await writeDeliveryModes('push');
        assert.deepStrictEqual(await run(), { prompted: true, source: 'code' });
        await writeDeliveryModes(undefined);
        assert.deepStrictEqual(await run(), { prompted: true, source: 'code' });
    });

    test('ignores unsaved event settings instead of blocking F5', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
        const webhook = { connectorId: 'custom', operationId: 'Event0', deliveryMode: 'webhook' };
        await fs.promises.writeFile(path.join(projectPath, 'function_app.py'), 'app = make_app()\n');
        await fs.promises.writeFile(settingsPath, JSON.stringify({
            'azureFunctions.connectorTriggerEvents': [webhook],
        }));
        const harness = await createHarness('Debug');
        harness.dependencies.bindingResolver.find = async () => [];

        const document = await workspace.openTextDocument(Uri.file(settingsPath));
        const edit = new WorkspaceEdit();
        edit.insert(document.uri, new Position(0, 0), '// Unsaved change.\n');
        assert.strictEqual(await workspace.applyEdit(edit), true);
        try {
            await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies);
        } finally {
            await document.save();
        }
        assert.deepStrictEqual(harness.prompts, []);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5MetadataIgnored, 'SettingsNotSaved');
    });

    test('ignores an invalid event entry instead of blocking F5', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
        const webhook = { connectorId: 'custom', operationId: 'Event0', deliveryMode: 'webhook' };
        await fs.promises.writeFile(path.join(projectPath, 'function_app.py'), 'app = make_app()\n');
        await fs.promises.writeFile(settingsPath, JSON.stringify({
            'azureFunctions.connectorTriggerEvents': [webhook, { ...webhook, operationId: 'Event1', deliveryMode: 'push' }],
        }));
        const harness = await createHarness('Debug');
        harness.dependencies.bindingResolver.find = async () => [];
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies);
        assert.deepStrictEqual(harness.prompts, []);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5MetadataIgnored, 'InvalidSchema');
    });

    test('uses the matching recorded event when another Poll trigger is disabled', async () => {
        const active = { ...binding, functionName: 'ActivePoll' };
        const disabled = { connectionSettingName: 'OtherConnection', functionName: 'DisabledPoll', triggerConfigSettingName: 'DisabledConfig' };
        const activeEvent = { connectorId: 'custom', operationId: 'ActiveEvent', functionName: 'ActivePoll' };
        await writeSettings({ IsEncrypted: false, Values: { 'AzureWebJobs.DisabledPoll.Disabled': 'true' } });
        const harness = await createHarness('Configure');
        harness.dependencies.bindingResolver.find = async () => [active, disabled];
        harness.dependencies.projectStore = {
            read: async () => { throw new ConnectorTriggerProjectMetadataError('InvalidSchema', 'Expected one event.'); },
            readEvents: async () => [{ connectorId: 'custom', operationId: 'DisabledEvent', functionName: 'DisabledPoll' }, activeEvent],
        };
        let metadata: unknown;
        harness.dependencies.openSetup = async setupContext => {
            metadata = (setupContext as unknown as { metadata?: unknown }).metadata;
            throw new UserCancelledError('test');
        };

        await assert.rejects(validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, { environment: {} }),
            isUserCancelledError);
        assert.deepStrictEqual(metadata, activeEvent);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5MetadataIgnored, undefined);
    });

    test('still prompts when a disable setting contains surrounding whitespace', async () => {
        await writeSettings({ IsEncrypted: false, Values: { 'AzureWebJobs.Whitespace.Disabled': ' true ' } });
        const harness = await createHarness('Debug Anyway');
        harness.dependencies.bindingResolver.find = async () => [{ ...binding, functionName: 'Whitespace' }];

        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, { environment: {} });

        assert.deepStrictEqual(harness.prompts[0].items, ['Configure', 'Debug Anyway']);
        assert.deepStrictEqual(harness.azureCalls, []);
        assert.strictEqual(harness.context.telemetry.measurements.connectorDisabledPollTriggerCount, 0);
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
