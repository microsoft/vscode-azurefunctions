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
import { type ConnectorTriggerF5Dependencies, type ConnectorTriggerHostLaunch, type ConnectorTriggerLocalBinding } from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { validateConnectorNamespacePreDebug } from '../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';

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
        projectStore: { read: async () => undefined, markComplete: record('markComplete') },
        gateway: new Proxy({}, { get: (_target, name) => record(`gateway.${String(name)}`) }),
        operationResolver: new Proxy({}, { get: (_target, name) => record(`operationResolver.${String(name)}`) }),
        openSetup: record('openSetup'),
        localSettingsWriter: { write: record('localSettingsWriter.write') },
        workspaceIdentity: { get: async () => 'synthetic-workspace-id' },
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

    test('forwards the selected host launch to setup and validates its environment', async () => {
        await writeSettings({ IsEncrypted: false, Values: {} });
        process.env[endpointKey] = validEndpoint;
        const harness = await createHarness('Configure');
        const hostLaunch: ConnectorTriggerHostLaunch = {
            kind: 'task',
            execution: 'process',
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

        assert.strictEqual(forwarded, hostLaunch);
        assert.deepStrictEqual(harness.prompts[0].items, ['Configure', 'Debug Anyway']);
        assert.deepStrictEqual(harness.azureCalls, []);
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
