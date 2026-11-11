/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError, createTestActionContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    type ConnectorTriggerConfig,
    type ConnectorTriggerConfigRequest,
    type ConnectorTriggerConnection,
    type ConnectorTriggerConnectionAccessPolicy,
    type ConnectorTriggerF5Dependencies,
    type ConnectorTriggerGateway,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerPrincipal,
    type ConnectorTriggerSetupRequest,
    type ConnectorTriggerSetupTarget,
} from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { runConnectorTriggerF5Setup } from '../src/debug/connectorNamespace/connectorTriggerF5Setup';
import { parseJson } from '../src/utils/parseJson';

const binding: ConnectorTriggerLocalBinding = {
    connectionSettingName: 'SafetyFixtureConnection',
    triggerConfigSettingName: 'SafetyFixtureTriggerConfig',
};
const target: ConnectorTriggerSetupTarget = {
    version: 1,
    subscription: {
        id: 'subscription-id',
        tenantId: 'tenant-id',
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
    identity: { principalId: 'namespace-principal', tenantId: 'tenant-id' },
};
const workspaceId = 'this-workspace';

interface Harness {
    dependencies: ConnectorTriggerF5Dependencies;
    policies: ConnectorTriggerConnectionAccessPolicy[][];
    triggerConfigRequests: ConnectorTriggerConfigRequest[];
    setupRequests: ConnectorTriggerSetupRequest[];
    cancelProgress(): void;
}

interface HarnessOptions {
    connection?: ConnectorTriggerConnection;
    pollingPrincipal?: ConnectorTriggerPrincipal;
    existingTriggerConfig?: ConnectorTriggerConfig;
    getConnection?: (harness: Harness) => Promise<ConnectorTriggerConnection>;
    beforeTriggerConfig?: () => Promise<void>;
}

suite('Connector Trigger F5 setup safety', () => {
    let projectPath: string;
    let settingsPath: string;

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-safety-'));
        settingsPath = path.join(projectPath, 'local.settings.json');
        await fs.promises.writeFile(settingsPath, JSON.stringify({ IsEncrypted: false, Values: {} }));
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
    });

    test('refuses to update a Trigger Config owned by another workspace at the same path', async () => {
        const harness = createHarness({
            existingTriggerConfig: { ...createTriggerConfig(), ownerWorkspaceId: 'other-workspace' },
        });

        await assert.rejects(
            runConnectorTriggerF5Setup(await createContext(), projectPath, undefined, binding, harness.dependencies),
            /belongs to another workspace/,
        );
        assert.strictEqual(harness.triggerConfigRequests.length, 0);
        assert.strictEqual(harness.setupRequests[0].workspaceId, workspaceId);
    });

    test('updates its own Trigger Config and records the workspace owner', async () => {
        const harness = createHarness({
            existingTriggerConfig: { ...createTriggerConfig(), ownerWorkspaceId: workspaceId },
        });

        await runConnectorTriggerF5Setup(await createContext(), projectPath, undefined, binding, harness.dependencies);

        assert.strictEqual(harness.triggerConfigRequests.length, 1);
        assert.strictEqual(harness.triggerConfigRequests[0].ownerWorkspaceId, workspaceId);
    });

    test('authorizes the polling principal with principal-specific policy names', async () => {
        const runFor = async (principal: ConnectorTriggerPrincipal): Promise<ConnectorTriggerConnectionAccessPolicy> => {
            const harness = createHarness({
                connection: createConnection({ createdBy: { objectId: 'connection-creator', tenantId: 'tenant-id' } }),
                pollingPrincipal: principal,
            });
            await runConnectorTriggerF5Setup(await createContext(), projectPath, undefined, binding, harness.dependencies);
            const developerPolicy = harness.policies[0].find(policy => policy.principal.identity.objectId !== 'namespace-principal');
            return nonNull(developerPolicy);
        };

        const first = await runFor({ objectId: 'developer-a', tenantId: 'tenant-id' });
        const second = await runFor({ objectId: 'developer-b', tenantId: 'tenant-id' });

        assert.deepStrictEqual(first.principal.identity, { objectId: 'developer-a', tenantId: 'tenant-id' });
        assert.deepStrictEqual(second.principal.identity, { objectId: 'developer-b', tenantId: 'tenant-id' });
        assert.notStrictEqual(first.name, second.name);
        assert.match(first.name, /^local-developer-/);
    });

    for (const approve of [true, false]) {
        test(`asks again before overwriting a setting added after review (${approve ? 'approved' : 'declined'})`, async () => {
            const triggerConfigKey = binding.triggerConfigSettingName;
            const harness = createHarness({
                beforeTriggerConfig: async () => {
                    await fs.promises.writeFile(settingsPath, JSON.stringify({
                        IsEncrypted: false,
                        Values: { [triggerConfigKey]: 'added-by-another-process' },
                    }));
                },
            });
            const context = await createContext();
            const warnings: string[] = [];
            context.ui.showWarningMessage = async <T extends vscode.MessageItem>(message: string, ...args: unknown[]): Promise<T> => {
                warnings.push(message);
                const items = args.slice(1) as T[];
                if (/changed after you reviewed/.test(message) && !approve) {
                    throw new UserCancelledError('test');
                }
                return items[0];
            };

            const run = runConnectorTriggerF5Setup(context, projectPath, undefined, binding, harness.dependencies);
            if (approve) {
                await run;
            } else {
                await assert.rejects(run, error => error instanceof UserCancelledError);
            }

            assert.strictEqual(warnings.filter(message => message.includes(triggerConfigKey)).length, 1);
            const values = parseJson<{ Values: Record<string, string> }>(await fs.promises.readFile(settingsPath, 'utf8')).Values;
            assert.strictEqual(values[triggerConfigKey], approve ? 'trigger-config' : 'added-by-another-process');
        });
    }

    test('stops when consent progress is cancelled while a connection refresh is in flight', async () => {
        let calls = 0;
        const harness = createHarness({
            connection: createConnection({ status: 'Unauthenticated' }),
            getConnection: async current => {
                calls += 1;
                if (calls === 1) {
                    return createConnection({ status: 'Unauthenticated' });
                }
                current.cancelProgress();
                return createConnection({ status: 'Connected' });
            },
        });
        const context = await createContext();
        context.ui.showWarningMessage = async <T extends vscode.MessageItem>(_message: string, ...args: unknown[]): Promise<T> =>
            args[1] as T;

        await assert.rejects(
            runConnectorTriggerF5Setup(context, projectPath, undefined, binding, harness.dependencies),
            error => error instanceof UserCancelledError,
        );
        assert.strictEqual(calls, 2);
        assert.strictEqual(harness.policies.length, 0);
        assert.strictEqual(harness.triggerConfigRequests.length, 0);
    });
});

async function createContext(): Promise<IActionContext> {
    return await createTestActionContext();
}

function createHarness(options: HarnessOptions): Harness {
    const progressCancellation = new vscode.CancellationTokenSource();
    const setupCancellation = new vscode.CancellationTokenSource();
    const connection = options.connection ?? createConnection({});
    let now = 0;
    const harness: Harness = {
        policies: [],
        triggerConfigRequests: [],
        setupRequests: [],
        cancelProgress: () => progressCancellation.cancel(),
        dependencies: undefined as unknown as ConnectorTriggerF5Dependencies,
    };
    const gateway: Partial<ConnectorTriggerGateway> = {
        ensureNamespace: async () => namespace,
        ensureConnection: async () => connection,
        getConnection: async () => options.getConnection ? await options.getConnection(harness) : connection,
        getConsentLink: async () => 'https://consent.example.invalid/',
        getPollingPrincipal: async () => options.pollingPrincipal ?? { objectId: 'developer', tenantId: 'tenant-id' },
        ensureConnectionAccessPolicies: async (_context, _target, _namespace, _connection, policies) => {
            harness.policies.push([...policies]);
        },
        getTriggerConfig: async () => options.existingTriggerConfig,
        createOrUpdateTriggerConfig: async (_context, request) => {
            harness.triggerConfigRequests.push(request);
            return { ...createTriggerConfig(), ownerWorkspaceId: request.ownerWorkspaceId };
        },
    };
    harness.dependencies = {
        bindingResolver: { find: async () => [binding], resolve: async () => binding },
        gateway: gateway as ConnectorTriggerGateway,
        projectStore: { read: async () => undefined, markComplete: async () => undefined },
        operationResolver: {
            resolveOperation: async () => {
                await options.beforeTriggerConfig?.();
                return { inputs: [] };
            },
            resolveDynamicInput: async () => ({}),
            serializeParameters: () => [],
        },
        workspaceIdentity: { get: async () => workspaceId },
        openSetup: async (_context, request) => {
            harness.setupRequests.push(request);
            return {
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
            };
        },
        runtime: {
            now: () => now++,
            delay: async () => undefined,
            openExternal: async () => true,
            withProgress: async (_title, task) => await task(progressCancellation.token),
        },
    };
    return harness;
}

function createConnection(overrides: Partial<ConnectorTriggerConnection>): ConnectorTriggerConnection {
    return {
        id: 'connection-id',
        name: 'connection',
        connectorId: target.connectorId,
        status: 'Connected',
        createdBy: { objectId: 'connection-creator', tenantId: 'tenant-id' },
        ...overrides,
    };
}

function createTriggerConfig(): ConnectorTriggerConfig {
    return {
        id: 'trigger-config-id',
        name: 'trigger-config',
        state: 'Enabled',
        pollingEndpoints: {
            receiveUri: 'https://poll.example.invalid/api/connectorGateways/gateway/triggerConfigs/trigger-config/receive',
        },
    };
}

function nonNull<T>(value: T | undefined): T {
    assert.ok(value);
    return value;
}
