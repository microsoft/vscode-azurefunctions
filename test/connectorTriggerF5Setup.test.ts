/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Environment } from '@azure/ms-rest-azure-env';
import {
    AzExtFsExtra,
    TestOutputChannel,
    UserCancelledError,
    createTestActionContext,
    type IActionContext,
    type IAzureQuickPickItem,
    type PromptResult,
} from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    readConnectorTriggerProjectMetadata,
    writeConnectorTriggerProjectMetadata,
} from '../src/connectorTrigger/connectorTriggerProjectMetadata';
import { ensureConnectorTriggerPollProject } from '../src/connectorTrigger/ensureConnectorTriggerPollProject';
import { ProjectLanguage } from '../src/constants';
import { ext } from '../src/extensionVariables';
import { ProjectConnectorTriggerBindingResolver } from '../src/debug/connectorNamespace/ConnectorTriggerF5BindingResolver';
import { FileConnectorTriggerLocalSettingsWriter } from '../src/debug/connectorNamespace/ConnectorTriggerLocalSettingsWriter';
import {
    ConnectorTriggerSetupEventSwitchError,
    type ConnectorTriggerConnection,
    type ConnectorTriggerDynamicInvokeRequest,
    type ConnectorTriggerF5Dependencies,
    type ConnectorTriggerF5Runtime,
    type ConnectorTriggerGateway,
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerOperationResolver,
    type ConnectorTriggerParameterValue,
    type ConnectorTriggerParameterRequest,
    type ConnectorTriggerSetupTarget,
    type ConnectorTriggerSetupPlan,
    type ConnectorTriggerSetupRequest,
    type ConnectorTriggerSetupSession,
    type ConnectorTriggerProjectMetadata,
} from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import {
    ConnectorTriggerF5SetupError,
    createConnectorTriggerResourceNames,
    deriveConnectorPollingEndpoint,
    isValidConnectorPollingEndpoint,
    runConnectorTriggerF5Setup,
} from '../src/debug/connectorNamespace/connectorTriggerF5Setup';
import { ConnectorTriggerParameterForm } from '../src/debug/connectorNamespace/ConnectorTriggerParameterForm';
import { ConnectorTriggerSetupForm } from '../src/debug/connectorNamespace/ConnectorTriggerSetupForm';
import { SwaggerConnectorTriggerOperationResolver } from '../src/debug/connectorNamespace/SwaggerConnectorTriggerOperationResolver';
import { validateConnectorNamespacePreDebug } from '../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';
import { resolveConnectorVscodePrincipal } from '../src/debug/connectorNamespace/connectorTriggerVscodeCredential';

const projectPath = 'C:\\test\\connector-project';
const binding: ConnectorTriggerLocalBinding = {
    connectionSettingName: 'ConnectorNamespace',
    triggerConfigSettingName: 'OnNewEmailTriggerConfigName',
};
const target: ConnectorTriggerSetupTarget = {
    version: 1,
    subscription: {
        id: 'subscription-id',
        tenantId: 'tenant-id',
        environment: {
            name: 'AzureCloud',
            resourceManagerEndpointUrl: 'https://management.azure.com/',
        },
    },
    region: 'eastus',
    connectorId: 'office365',
    operationId: 'OnNewEmailV3',
};
const workspaceId = 'workspace-id';
const projectMetadata: ConnectorTriggerProjectMetadata = {
    version: 1, connectorId: target.connectorId, operationId: target.operationId,
};

suite('Connector Trigger F5 setup', () => {
    test('predebug VS Code mode verifies identity before provisioning and writes only the local credential selection', async () => {
        const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-vscode-settings-'));
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            [],
            [/Open Sign-in Page/],
        );
        const state = createGatewayState();
        const gateway = createGateway(state);
        const getPrincipal = gateway.getPollingPrincipal;
        let principalChecks = 0;
        gateway.getPollingPrincipal = async (...args) => {
            if (principalChecks++ === 0) {
                assert.strictEqual(state.namespaceCreateCount, 0);
                assert.strictEqual(state.connectionCreateCount, 0);
            }
            assert.strictEqual(args[2].useVisualStudioCodeCredential, true);
            return await getPrincipal(...args);
        };
        const writes: Readonly<Record<string, string>>[] = [];
        const dependencies = createDependencies(gateway, {
            resolveOperation: async () => ({ inputs: [] }),
            resolveDynamicInput: async () => ({}),
            serializeParameters: () => [],
        }, { markComplete: async () => undefined, write: async (_context, _path, values) => { writes.push(values); } });
        const removedOverride = `AzureWebJobs${binding.connectionSettingName}__credential`;
        dependencies.hostLaunch = {
            kind: 'task', execution: 'process', standardFunctionsTask: true,
            environment: {
                ['AzureWebJobsOtherConnection__credential']: 'managedidentity',
                ['ConnectionStrings__OtherConnection']: 'unrelated-connection',
            },
            environmentLayers: [{ [removedOverride]: 'managedidentity' }, { [removedOverride]: null }],
        };
        dependencies.useVscodeCredential = true;
        try {
            await AzExtFsExtra.writeJSON(path.join(tempProject, 'local.settings.json'), {
                IsEncrypted: false, Values: { Unrelated: 'unchanged' },
            });

            await runConnectorTriggerF5Setup(await createContext(ui), tempProject, projectMetadata, binding, dependencies);

            assert.strictEqual(principalChecks, 2);
            assert.strictEqual(writes.length, 1);
            assert.deepStrictEqual(writes[0], {
                AZURE_TOKEN_CREDENTIALS: 'VisualStudioCodeCredential',
                [`${binding.connectionSettingName}__tenantId`]: target.subscription.tenantId,
                [`${binding.connectionSettingName}__pollingEndpoint`]: 'https://example.logic.azure.com/api/connectorGateways/gateway-id',
                [binding.triggerConfigSettingName]: state.triggerConfigName,
            });
            assert.strictEqual((await AzExtFsExtra.readJSON<{ Values: { Unrelated: string } }>(
                path.join(tempProject, 'local.settings.json'))).Values.Unrelated, 'unchanged');
            ui.assertConsumed();
        } finally {
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true });
        }
    });

    for (const tenantOverridden of [false, true]) {
        test(`preserves file credentials when the task selects VS Code authentication (tenant override: ${tenantOverridden})`, async () => {
            const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-credential-preservation-'));
            const settingsPath = path.join(tempProject, 'local.settings.json');
            const tenantSetting = `${binding.connectionSettingName}__tenantId`;
            const ui = new ScriptedUi(
                [/Create a new Connector Namespace/, /Create a new connector connection/], [], [/Open Sign-in Page/]);
            const state = createGatewayState();
            let reviewed: ConnectorTriggerSetupPlan | undefined;
            const dependencies = createDependencies(createGateway(state), {
                resolveOperation: async () => ({ inputs: [] }),
                resolveDynamicInput: async () => ({}),
                serializeParameters: () => [],
            }, {
                review: async (_context, plan) => { reviewed = plan; return true; },
                markComplete: async () => undefined,
                write: async () => assert.fail('Expected the file writer.'),
            });
            dependencies.localSettingsWriter = new FileConnectorTriggerLocalSettingsWriter();
            dependencies.hostLaunch = {
                kind: 'task', execution: 'process', standardFunctionsTask: true,
                environment: {
                    AZURE_TOKEN_CREDENTIALS: 'VisualStudioCodeCredential',
                    ...(tenantOverridden ? { [tenantSetting]: target.subscription.tenantId } : {}),
                },
            };
            dependencies.useVscodeCredential = true;
            try {
                await AzExtFsExtra.writeJSON(settingsPath, {
                    IsEncrypted: false,
                    Values: {
                        AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential',
                        ...(tenantOverridden ? { [tenantSetting]: 'other-tenant' } : {}),
                    },
                });

                await runConnectorTriggerF5Setup(await createContext(ui), tempProject, projectMetadata, binding, dependencies);

                const settings = await AzExtFsExtra.readJSON<{ Values: Record<string, string> }>(settingsPath);
                assert.strictEqual(settings.Values.AZURE_TOKEN_CREDENTIALS, 'AzureCliCredential');
                assert.strictEqual(settings.Values[tenantSetting], tenantOverridden ? 'other-tenant' : target.subscription.tenantId);
                assert.strictEqual(settings.Values[binding.triggerConfigSettingName], state.triggerConfigName);
                assert.ok(reviewed);
                assert.strictEqual(reviewed.localSettings.some(setting => setting.purpose === 'credential'), false);
                assert.strictEqual(reviewed.localSettings.some(setting => setting.purpose === 'tenant'), !tenantOverridden);
                ui.assertConsumed();
            } finally {
                await AzExtFsExtra.deleteResource(tempProject, { recursive: true, useTrash: false });
            }
        });
    }

    for (const conflictingName of [
        `AzureWebJobs${binding.connectionSettingName}__credential`,
        `ConnectionStrings__${binding.connectionSettingName}__clientSecret`,
        `connectionstrings:azurewebjobs${binding.connectionSettingName.toLowerCase()}:credential`,
        `CUSTOMCONNSTR_${binding.connectionSettingName}`,
    ]) {
        test(`rejects effective launch override ${conflictingName} before VS Code setup provisions or grants access`, async () => {
            const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-vscode-override-'));
            const settingsPath = path.join(tempProject, 'local.settings.json');
            const ui = new ScriptedUi(
                [/Create a new Connector Namespace/, /Create a new connector connection/], [], [/Open Sign-in Page/]);
            const account = {
                id: 'fixture-home-account', label: 'Fixture account',
                environment: { ...Environment.AzureCloud, isCustomCloud: false },
            };
            const session = {
                id: 'fixture-session', account, scopes: [],
                accessToken: `header.${Buffer.from(JSON.stringify({
                    oid: 'developer-object', tid: target.subscription.tenantId,
                })).toString('base64url')}.signature`,
            };
            let sessionReads = 0;
            const subscription = {
                account, tenantId: target.subscription.tenantId, environment: Environment.AzureCloud,
                authentication: {
                    getSession: () => { sessionReads++; return session; },
                    getSessionWithScopes: () => session,
                },
            };
            const state = createGatewayState();
            let grants = 0;
            let writes = 0;
            const gateway = createGateway(state, { onAccessPolicies: () => { grants++; } });
            gateway.getPollingPrincipal = (context, _target, credential) =>
                resolveConnectorVscodePrincipal(context, subscription, credential);
            const dependencies = createDependencies(gateway, {
                resolveOperation: async () => ({ inputs: [] }),
                resolveDynamicInput: async () => ({}),
                serializeParameters: () => [],
            }, { markComplete: async () => { writes++; }, write: async () => { writes++; } });
            dependencies.hostLaunch = {
                kind: 'task', execution: 'process', standardFunctionsTask: true,
                environment: {
                    HOME: tempProject, USERPROFILE: tempProject,
                    ['AZURE_TOKEN_CREDENTIALS']: 'VisualStudioCodeCredential',
                    [conflictingName]: 'private-launch-override',
                },
            };
            dependencies.useVscodeCredential = true;
            try {
                const record = path.join(tempProject, '.azure', 'ms-azuretools.vscode-azureresourcegroups', 'authRecord.json');
                await AzExtFsExtra.ensureDir(path.dirname(record));
                await AzExtFsExtra.writeJSON(record, {
                    homeAccountId: account.id, tenantId: subscription.tenantId, authority: 'https://login.microsoftonline.com/',
                });
                await AzExtFsExtra.writeJSON(settingsPath, { IsEncrypted: false, Values: { Unrelated: 'unchanged' } });
                const original = await fs.promises.readFile(settingsPath, 'utf8');
                const context = await createContext(ui);

                await assert.rejects(runConnectorTriggerF5Setup(
                    context, tempProject, projectMetadata, binding, dependencies), (error: unknown) =>
                    error instanceof Error && /overrides the VS Code credential/.test(error.message) &&
                    !error.message.includes('private-launch-override'));

                assert.strictEqual(sessionReads, 0);
                assert.strictEqual(state.namespaceCreateCount, 0);
                assert.strictEqual(state.connectionCreateCount, 0);
                assert.strictEqual(state.triggerConfigName, undefined);
                assert.strictEqual(grants, 0);
                assert.strictEqual(writes, 0);
                assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
                assert.ok(context.valuesToMask.includes(conflictingName));
                assert.ok(!JSON.stringify(context.telemetry).includes('private-launch-override'));
            } finally {
                await AzExtFsExtra.deleteResource(tempProject, { recursive: true, useTrash: false });
            }
        });
    }

    test('predebug opens VS Code credential setup without a local runtime compatibility gate', async () => {
        const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-vscode-runtime-'));
        const settingsPath = path.join(tempProject, 'local.settings.json');
        const state = createGatewayState();
        const fail = async (): Promise<never> => assert.fail('Setup must not perform Azure mutations or write settings before the setup session.');
        const dependencies = createDependencies(createGateway(state), {
            resolveOperation: fail,
            resolveDynamicInput: fail,
            serializeParameters: () => assert.fail('No parameter serialization is expected.'),
        }, { markComplete: fail, write: fail });
        let opened = false;
        dependencies.openSetup = async () => {
            opened = true;
            throw new UserCancelledError('connectorF5Setup');
        };
        try {
            await AzExtFsExtra.writeJSON(settingsPath, { IsEncrypted: false, Values: { Unrelated: 'unchanged' } });
            const original = await fs.promises.readFile(settingsPath, 'utf8');
            const context = await createContext(new ScriptedUi([], [], ['Configure']));
            await assert.rejects(validateConnectorNamespacePreDebug(context, tempProject, dependencies, {
                hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
            }), UserCancelledError);
            assert.strictEqual(opened, true);
            assert.strictEqual(state.namespaceCreateCount, 0);
            assert.strictEqual(state.connectionCreateCount, 0);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
        } finally {
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true });
        }
    });

    test('predebug continues for configured VS Code credential settings without a local runtime compatibility gate', async () => {
        const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-vscode-configured-'));
        const fail = async (): Promise<never> => assert.fail('Configured settings must not run setup.');
        const dependencies = createDependencies(createGateway(createGatewayState()), {
            resolveOperation: fail,
            resolveDynamicInput: fail,
            serializeParameters: () => assert.fail('No parameter serialization is expected.'),
        }, { markComplete: fail, write: fail });
        dependencies.openSetup = async () => assert.fail('Configured settings must not open setup.');
        try {
            await AzExtFsExtra.writeJSON(path.join(tempProject, 'local.settings.json'), {
                IsEncrypted: false,
                Values: {
                    [`${binding.connectionSettingName}__pollingEndpoint`]: 'https://example.logic.azure.com/api/connectorGateways/gateway-id',
                    [binding.triggerConfigSettingName]: 'fixture-trigger-config',
                    AZURE_TOKEN_CREDENTIALS: 'VisualStudioCodeCredential',
                },
            });
            const context = await createContext(new ScriptedUi([], [], []));
            await validateConnectorNamespacePreDebug(context, tempProject, dependencies, {
                hostLaunch: { kind: 'task', execution: 'process', standardFunctionsTask: true, environment: {} },
            });
            assert.strictEqual(context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
        } finally {
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true });
        }
    });

    test('an unverified task cannot grant access or change local credentials during pre-debug setup', async () => {
        const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-unverified-task-'));
        const settingsPath = path.join(tempProject, 'local.settings.json');
        let grants = 0;
        let writes = 0;
        let opened = false;
        const state = createGatewayState();
        const dependencies = createDependencies(createGateway(state, {
            onAccessPolicies: () => { grants += 1; },
        }), {
            resolveOperation: async () => ({ inputs: [] }),
            resolveDynamicInput: async () => ({}),
            serializeParameters: () => [],
        }, {
            markComplete: async () => { writes += 1; },
            write: async () => { writes += 1; },
        });
        dependencies.openSetup = async () => {
            opened = true;
            return assert.fail('Unverified task setup must stop before opening resource setup.');
        };
        try {
            await AzExtFsExtra.writeJSON(settingsPath, {
                IsEncrypted: false,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                Values: { UnrelatedSetting: 'synthetic-value', ConnectorNamespace__clientSecret: 'synthetic-secret' },
            });
            const before = await fs.promises.readFile(settingsPath, 'utf8');
            const ui = new ScriptedUi([], [], ['Configure']);
            await assert.rejects(validateConnectorNamespacePreDebug(await createContext(ui), tempProject, dependencies, {
                hostLaunch: {
                    kind: 'task',
                    execution: 'shell',
                    environment: {},
                },
            }), error => error instanceof ConnectorTriggerF5SetupError);
            assert.strictEqual(opened, false);
            assert.strictEqual(grants, 0);
            assert.strictEqual(writes, 0);
            assert.strictEqual(state.namespaceCreateCount, 0);
            assert.strictEqual(state.connectionCreateCount, 0);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), before);
        } finally {
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true });
        }
    });

    for (const choice of ['Configure', 'Debug Anyway', 'Cancel']) {
        test(`configuration choice ${choice} is handled before opening connector setup`, async () => {
            const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-choice-'));
            const settingsPath = path.join(tempProject, 'local.settings.json');
            const ui = new ScriptedUi([], [], [
                choice === 'Cancel' ? new UserCancelledError('missingConnectorTriggerSettings') : choice,
            ]);
            const context = await createContext(ui);
            const state = createGatewayState();
            let setupOpened = false;
            const fail = async (): Promise<never> => assert.fail('The configuration choice cannot perform setup side effects.');
            const dependencies = createDependencies(createGateway(state), {
                resolveOperation: fail,
                resolveDynamicInput: fail,
                serializeParameters: () => assert.fail('The configuration choice cannot serialize parameters.'),
            }, {
                markComplete: fail,
                write: fail,
            });
            dependencies.openSetup = async () => {
                assert.strictEqual(ui.warnings.length, 1, 'Confirmation must precede the configuration page.');
                setupOpened = true;
                throw new UserCancelledError('connectorF5Setup');
            };

            try {
                await AzExtFsExtra.writeJSON(settingsPath, {
                    IsEncrypted: false,
                    Values: { UnrelatedSetting: 'keep-this-value' },
                });
                const before = await fs.promises.readFile(settingsPath, 'utf8');
                const validate = () => validateConnectorNamespacePreDebug(context, tempProject, dependencies);
                if (choice === 'Debug Anyway') {
                    await validate();
                    assert.strictEqual(context.telemetry.properties.connectorF5SetupResult, 'debugAnyway');
                } else {
                    await assert.rejects(validate, error => error instanceof UserCancelledError);
                }

                assert.strictEqual(setupOpened, choice === 'Configure');
                assert.strictEqual(ui.warnings.length, 1);
                assert.deepStrictEqual(ui.warnings[0].options, {
                    modal: true,
                    stepName: 'missingConnectorTriggerSettings',
                });
                assert.deepStrictEqual(ui.warnings[0].items, ['Configure', 'Debug Anyway']);
                assert.match(ui.warnings[0].message, /connector trigger.*configur/i);
                assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), before);
                assert.strictEqual(state.namespaceCreateCount, 0);
                assert.strictEqual(state.connectionCreateCount, 0);
                assert.strictEqual(state.triggerParameters, undefined);
                ui.assertConsumed();
            } finally {
                await AzExtFsExtra.deleteResource(tempProject, { recursive: true });
            }
        });
    }

    test('creates, authenticates, resolves dynamic values, and writes only Poll settings', async () => {
        const ui = new ScriptedUi(
            [
                /Create a new Connector Namespace/,
                /Create a new connector connection/,
                ['Optional note'],
                'Inbox',
            ],
            ['required-value', 'important-value', 'optional-value'],
            [/Open Sign-in Page/],
        );
        const context = await createContext(ui);
        const state = createGatewayState();
        const writtenSettings: Record<string, string>[] = [];
        let completed = 0;
        let accessConfigured = false;
        let dynamicResolvedAfterAuthentication = false;

        const gateway = createGateway(state, {
            onAccessPolicies: policies => {
                accessConfigured = true;
                assert.strictEqual(policies.length, 2);
                assert.match(policies[0].name, /^namespace-trigger-runtime-[a-f0-9]{10}$/);
                assert.match(policies[1].name, /^local-developer-[a-f0-9]{10}$/);
                assert.deepStrictEqual(policies.map(policy => policy.principal.identity), [
                    { objectId: 'namespace-principal', tenantId: 'tenant-id' },
                    { objectId: 'developer-object', tenantId: 'tenant-id' },
                ]);
            },
        });
        const operationResolver: ConnectorTriggerOperationResolver = {
            resolveOperation: async (_context, request) => {
                assert.strictEqual(request.connection.status, 'Connected');
                assert.strictEqual(accessConfigured, true);
                return {
                    inputs: createOperationInputs(),
                };
            },
            resolveDynamicInput: async (_context, request) => {
                assert.strictEqual(request.connection.status, 'Connected');
                assert.strictEqual(accessConfigured, true);
                assert.strictEqual(request.values.requiredValue, 'required-value');
                dynamicResolvedAfterAuthentication = true;
                return {
                    options: [
                        { label: 'Inbox', value: 'inbox-id' },
                        { label: 'Archive', value: 'archive-id' },
                    ],
                };
            },
            serializeParameters: (_operation, inputs, values) => inputs.flatMap(input => {
                const value = values[input.name];
                return value === undefined ? [] : [{ name: input.name, value }];
            }),
        };
        const dependencies = createDependencies(gateway, operationResolver, {
            review: async (_context, plan) => {
                assert.strictEqual(state.namespace, undefined);
                assert.strictEqual(state.connection, undefined);
                assert.strictEqual(accessConfigured, false);
                assert.strictEqual(dynamicResolvedAfterAuthentication, false);
                assert.strictEqual(writtenSettings.length, 0);
                assert.strictEqual(plan.namespace.kind, 'create');
                assert.strictEqual(plan.connection.kind, 'create');
                assert.deepStrictEqual(plan.localSettings.map(setting => setting.name), [
                    'ConnectorNamespace__pollingEndpoint',
                    'OnNewEmailTriggerConfigName',
                ]);
                return true;
            },
            markComplete: async () => {
                completed += 1;
            },
            write: async (_context, _path, values) => {
                writtenSettings.push({ ...values });
            },
        });

        await runConnectorTriggerF5Setup(context, projectPath, target, binding, dependencies);

        assert.strictEqual(dynamicResolvedAfterAuthentication, true);
        assert.strictEqual(completed, 1);
        assert.deepStrictEqual([...nonNullValue(state.triggerParameters)].sort(compareParameters), [
            { name: 'folderPath', value: 'inbox-id' },
            { name: 'importantValue', value: 'important-value' },
            { name: 'optionalNote', value: 'optional-value' },
            { name: 'requiredValue', value: 'required-value' },
        ]);
        assert.deepStrictEqual(writtenSettings, [{
            ['ConnectorNamespace__pollingEndpoint']:
                'https://example.logic.azure.com/api/connectorGateways/gateway-id',
            OnNewEmailTriggerConfigName: state.triggerConfigName,
        }]);
        assert.ok(context.valuesToMask.includes('required-value'));
        assert.ok(context.valuesToMask.includes('inbox-id'));
        assert.doesNotMatch(
            JSON.stringify(context.telemetry.properties),
            /required-value|inbox-id|gateway-id|subscription-id|tenant-id/i,
        );
        ui.assertConsumed();
    });

    test('does not use stale identity metadata to configure a project without actual polling bindings', async () => {
        const fail = async (): Promise<never> => assert.fail('No connector work is authorized without an actual Poll binding.');
        const dependencies = createDependencies(createGateway(createGatewayState()), {
            resolveOperation: fail, resolveDynamicInput: fail, serializeParameters: () => assert.fail(),
        }, { markComplete: fail, write: fail });
        dependencies.bindingResolver.find = async () => [];
        dependencies.projectStore.read = fail;
        dependencies.openSetup = fail;
        const context = await createContext(new ScriptedUi([], [], []));
        await validateConnectorNamespacePreDebug(context, projectPath, dependencies);
        assert.strictEqual(context.telemetry.properties.connectorPollTriggerDetected, 'false');
    });

    for (const incomplete of [0, 1, 2]) {
        test(`checks every actual multi-event binding and ${incomplete ? 'diagnoses unsupported incomplete setup' : 'skips all-configured setup'} (${incomplete} incomplete)`, async () => {
            const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-boundary-'));
            const ui = new ScriptedUi([], [], incomplete ? ['Debug Anyway'] : []);
            const context = await createContext(ui);
            const fail = async (): Promise<never> => assert.fail('Declining multi-event setup must not read identity metadata, open setup or call Azure.');
            const state = createGatewayState();
            const dependencies = createDependencies(createGateway(state), {
                resolveOperation: fail, resolveDynamicInput: fail, serializeParameters: () => assert.fail(),
            }, { markComplete: fail, write: fail });
            dependencies.bindingResolver = new ProjectConnectorTriggerBindingResolver();
            dependencies.projectStore.read = fail;
            dependencies.openSetup = fail;
            try {
                await ensureConnectorTriggerPollProject(tempProject, ProjectLanguage.TypeScript, projectMetadata);
                await ensureConnectorTriggerPollProject(tempProject, ProjectLanguage.TypeScript, { connectorId: 'office365', operationId: 'OnFlaggedEmailV3' });
                const bindings = await dependencies.bindingResolver.find(context, tempProject);
                assert.strictEqual(bindings.length, 2);
                const values = Object.fromEntries(bindings.flatMap((binding, index) => [
                    [`${binding.connectionSettingName}__pollingEndpoint`, 'https://example.invalid/api/connectorGateways/fixture'],
                    [binding.triggerConfigSettingName, index < incomplete ? '' : 'configured-trigger'],
                ]));
                await AzExtFsExtra.writeJSON(path.join(tempProject, 'local.settings.json'), { IsEncrypted: false, Values: values });
                const before = await fs.promises.readFile(path.join(tempProject, 'local.settings.json'), 'utf8');
                await validateConnectorNamespacePreDebug(context, tempProject, dependencies);
                if (incomplete) {
                    assert.match(ui.warnings[0].message, new RegExp(`has 2 Connector Trigger events, and ${incomplete} need to be configured`));
                    assert.deepStrictEqual(ui.warnings[0].items, ['Configure', 'Debug Anyway']);
                    assert.strictEqual(context.telemetry.properties.connectorF5SetupResult, 'debugAnyway');
                } else {
                    assert.strictEqual(context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
                }
                assert.strictEqual(await fs.promises.readFile(path.join(tempProject, 'local.settings.json'), 'utf8'), before);
                assert.strictEqual(state.namespaceCreateCount, 0);
                assert.strictEqual(state.connectionCreateCount, 0);
                ui.assertConsumed();
            } finally {
                await AzExtFsExtra.deleteResource(tempProject, { recursive: true, useTrash: false });
            }
        });
    }

    test('multi-event setup switches events, configures the selection, and warns before debugging with unconfigured events', async () => {
        const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-multi-event-'));
        const state = createGatewayState();
        let settingsWrites = 0;
        const fail = async (): Promise<never> => assert.fail('Multi-event setup uses readEvents, not singular metadata.');
        const dependencies = createDependencies(createGateway(state), {
            resolveOperation: async () => ({ inputs: [] }),
            resolveDynamicInput: fail,
            serializeParameters: () => [],
        }, { markComplete: async () => undefined, write: async () => { settingsWrites += 1; } });
        const flagged = {
            connectionSettingName: binding.connectionSettingName,
            triggerConfigSettingName: 'OnFlaggedEmailV3TriggerConfigName',
            functionName: 'OnFlaggedEmailV3',
        };
        dependencies.bindingResolver.find = async () => [flagged, { ...binding, functionName: projectMetadata.operationId }];
        dependencies.projectStore.read = fail;
        dependencies.projectStore.readEvents = async () => [projectMetadata, { ...projectMetadata, operationId: 'OnFlaggedEmailV3' }];
        const requests: ConnectorTriggerSetupRequest[] = [];
        const openScripted = dependencies.openSetup;
        const stubSession = (error: Error): ConnectorTriggerSetupSession => ({
            cancellationToken: new vscode.CancellationTokenSource().token,
            selectResources: async () => { throw error; },
            collectParameters: async () => assert.fail('A stopped setup must not collect parameters.'),
            setStatus: () => undefined,
            dispose: () => undefined,
        });
        dependencies.openSetup = async (context, request) => {
            requests.push(request);
            switch (requests.length) {
                case 1: return stubSession(new ConnectorTriggerSetupEventSwitchError('1'));
                case 2: return await openScripted(context, request);
                default: return stubSession(new UserCancelledError('connectorF5Setup'));
            }
        };
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            [],
            ['Configure', /Open Sign-in Page/, 'Continue Configuring', 'Debug Anyway'],
        );
        const context = await createContext(ui);
        const originalOutput = ext.outputChannel;
        const output = new TestOutputChannel();
        const diagnostics: string[] = [];
        output.appendLog = value => { diagnostics.push(value); };
        ext.outputChannel = output;
        try {
            await AzExtFsExtra.writeJSON(path.join(tempProject, 'local.settings.json'), { IsEncrypted: false, Values: {} });
            await AzExtFsExtra.writeFile(path.join(tempProject, 'infra', 'incomplete.json'), '{"triggers": ["private-marker"');
            await validateConnectorNamespacePreDebug(context, tempProject, dependencies);

            const choices = (configured: boolean[]) => [
                { id: '0', label: 'OnFlaggedEmailV3', configured: configured[0] },
                { id: '1', label: projectMetadata.operationId, configured: configured[1] },
            ];
            assert.deepStrictEqual(requests.map(request => request.events), [
                { choices: choices([false, false]), selectedId: '0' },
                { choices: choices([false, false]), selectedId: '1' },
                { choices: choices([false, true]), selectedId: '0' },
                { choices: choices([false, true]), selectedId: '0' },
            ]);
            assert.deepStrictEqual(requests.map(request => request.metadata?.operationId),
                ['OnFlaggedEmailV3', projectMetadata.operationId, 'OnFlaggedEmailV3', 'OnFlaggedEmailV3']);
            assert.deepStrictEqual(requests.map(request => request.binding.triggerConfigSettingName),
                [flagged.triggerConfigSettingName, binding.triggerConfigSettingName, flagged.triggerConfigSettingName, flagged.triggerConfigSettingName]);
            assert.deepStrictEqual(requests[2].sharedConnection, {
                scope: { subscription: target.subscription, region: target.region },
                namespaceId: nonNullValue(state.namespace).id,
            });
            assert.strictEqual(settingsWrites, 1);
            assert.match(ui.warnings[0].message, /has 2 Connector Trigger events, and 2 need to be configured before they can run: OnFlaggedEmailV3, OnNewEmailV3/);
            for (const warning of ui.warnings.slice(2)) {
                assert.match(warning.message, /1 of 2 Connector Trigger events are not configured: OnFlaggedEmailV3\./);
                assert.deepStrictEqual(warning.items, ['Continue Configuring', 'Debug Anyway']);
            }
            assert.strictEqual(context.telemetry.properties.connectorF5SetupResult, 'partiallyConfigured');
            assert.strictEqual(context.telemetry.properties.connectorF5InvalidInfraJson, 'true');
            assert.strictEqual(context.telemetry.measurements.connectorEventsConfiguredCount, 1);
            assert.match(diagnostics.join('\n'), /optional Connector Trigger infrastructure metadata.*invalid JSON/);
            assert.doesNotMatch(diagnostics.join('\n'), /private-marker|incomplete\.json/);
            ui.assertConsumed();
        } finally {
            ext.outputChannel = originalOutput;
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true, useTrash: false });
        }
    });

    test('shared connection setup cannot switch its subscription, region, or namespace', async () => {
        const sharedNamespace = createNamespace('shared');
        const otherNamespace = createNamespace('other');
        const context = await createContext(new ScriptedUi([], [], []));
        const request: ConnectorTriggerSetupRequest = {
            metadata: projectMetadata,
            projectPath,
            workspaceId,
            binding,
            localSettings: [],
            sharedConnection: {
                scope: { subscription: target.subscription, region: target.region },
                namespaceId: sharedNamespace.id,
            },
        };
        const gateway = createGateway(createGatewayState());
        gateway.listNamespaces = async () => [sharedNamespace, otherNamespace];
        const form = new ConnectorTriggerSetupForm(context, request, gateway, {
            listSubscriptions: async () => [
                { id: target.subscription.id, label: 'Selected subscription', accountId: target.subscription.accountId },
                { id: 'other-subscription', label: 'Other subscription' },
            ],
            getSubscription: async () => target.subscription,
            listRegions: async () => [
                { id: target.region, label: 'Selected region' },
                { id: 'westus', label: 'Other region' },
            ],
            listConnectors: async () => [],
            listEvents: async () => [],
            signIn: async () => assert.fail('The selected subscription is available.'),
        }, () => undefined);
        try {
            await form.handleMessage({ command: 'initializeSetup' });
            assert.strictEqual(form.state.subscriptionOptions.length, 1);
            assert.strictEqual(form.state.regionOptions.length, 1);
            assert.strictEqual(form.state.namespaceOptions.length, 1);
            assert.strictEqual(form.state.namespaceIsNew, false);
            assert.match(form.state.namespaceOptions[0].label, /^shared /);

            await form.handleMessage({ command: 'selectNamespace', revision: 1, id: 'new' });
            assert.ok(form.state.error);
            assert.strictEqual(form.state.namespaceIsNew, false);
        } finally {
            form.dispose();
        }
    });

    for (const testCase of [
        {
            title: 'does not overwrite an existing shared polling endpoint with a different namespace',
            existingEndpoint: 'https://example.logic.azure.com/api/connectorGateways/existing-gateway',
            shared: true,
            conflict: true,
        },
        {
            title: 'accepts a shared polling endpoint with an equivalent trailing slash',
            existingEndpoint: 'https://example.logic.azure.com/api/connectorGateways/different-gateway/',
            shared: true,
            conflict: false,
        },
        {
            title: 'allows a single event to change its existing polling endpoint',
            existingEndpoint: 'https://example.logic.azure.com/api/connectorGateways/existing-gateway',
            shared: false,
            conflict: false,
        },
    ]) {
        test(testCase.title, async () => {
            const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-shared-endpoint-'));
            const settingsPath = path.join(tempProject, 'local.settings.json');
            let writes = 0;
            const state = createGatewayState();
            const gateway = createGateway(state);
            const createTriggerConfig = gateway.createOrUpdateTriggerConfig;
            gateway.createOrUpdateTriggerConfig = async (...args) => {
                const config = await createTriggerConfig(...args);
                return {
                    ...config,
                    pollingEndpoints: {
                        ...config.pollingEndpoints,
                        receiveUri: 'https://example.logic.azure.com/api/connectorGateways/different-gateway/triggerConfigs/other/receive',
                    },
                };
            };
            const dependencies = createDependencies(gateway, {
                resolveOperation: async () => ({ inputs: [] }),
                resolveDynamicInput: async () => ({}),
                serializeParameters: () => [],
            }, {
                markComplete: async () => undefined,
                write: async () => { writes++; },
            });
            dependencies.protectSharedPollingEndpoint = testCase.shared;
            const ui = new ScriptedUi(
                [/Create a new Connector Namespace/, /Create a new connector connection/],
                [],
                [/Open Sign-in Page/],
            );
            try {
                await AzExtFsExtra.writeJSON(settingsPath, {
                    IsEncrypted: false,
                    Values: { [`${binding.connectionSettingName}__pollingEndpoint`]: testCase.existingEndpoint },
                });
                const setup = runConnectorTriggerF5Setup(await createContext(ui), tempProject, projectMetadata, binding, dependencies);
                if (testCase.conflict) {
                    await assert.rejects(setup, error => error instanceof ConnectorTriggerF5SetupError &&
                        /already used by another Connector Trigger event/i.test(error.message));
                } else {
                    await setup;
                }
                assert.strictEqual(writes, testCase.conflict ? 0 : 1);
                ui.assertConsumed();
            } finally {
                await AzExtFsExtra.deleteResource(tempProject, { recursive: true, useTrash: false });
            }
        });
    }

    for (const testCase of [
        { name: 'reuses the existing namespace', config: 'matching', fromEnvironment: false },
        { name: 'uses the configured sibling reference from the host environment', config: 'matching', fromEnvironment: true },
        { name: 'rejects a namespace without the configured sibling', config: 'missing', fromEnvironment: false },
        { name: 'rejects a namespace with a different endpoint', config: 'different', fromEnvironment: false },
        { name: 'rejects a newly created namespace', config: 'new', fromEnvironment: false },
        { name: 'rejects settings changed while the form is open', config: 'changed', fromEnvironment: false },
        { name: 'rejects a changed sibling Trigger Config reference', config: 'changed-config', fromEnvironment: false },
    ]) {
        test(`previously configured shared event ${testCase.name} before provisioning`, async () => {
            const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-existing-event-'));
            const settingsPath = path.join(tempProject, 'local.settings.json');
            const existingEndpoint = 'https://example.logic.azure.com/api/connectorGateways/gateway-id/';
            const siblingSetting = 'ExistingEventTriggerConfigName';
            const state = createGatewayState();
            state.namespace = createNamespace('shared');
            const gateway = createGateway(state);
            const calls: string[] = [];
            const ensureNamespace = gateway.ensureNamespace;
            const ensureConnection = gateway.ensureConnection;
            gateway.ensureNamespace = async (...args) => { calls.push('ensureNamespace'); return await ensureNamespace(...args); };
            gateway.ensureConnection = async (...args) => { calls.push('ensureConnection'); return await ensureConnection(...args); };
            gateway.getTriggerConfig = async (_context, _target, namespace, configName) => {
                if (configName !== 'existing-config') {
                    return undefined;
                }
                calls.push('verifySibling');
                assert.strictEqual(namespace.id, state.namespace?.id);
                if (testCase.config === 'missing') {
                    return undefined;
                }
                const gatewayId = testCase.config === 'different' ? 'different-gateway' : 'gateway-id';
                return {
                    id: '/triggerConfigs/existing-config',
                    name: configName,
                    state: 'Enabled',
                    pollingEndpoints: {
                        receiveUri: `https://example.logic.azure.com/api/connectorGateways/${gatewayId}/triggerConfigs/existing-config/receive`,
                    },
                };
            };
            let writes = 0;
            const dependencies = createDependencies(gateway, {
                resolveOperation: async () => ({ inputs: [] }),
                resolveDynamicInput: async () => ({}),
                serializeParameters: () => [],
            }, { markComplete: async () => undefined, write: async () => { writes++; } });
            dependencies.bindingResolver.find = async () => [
                { ...binding, functionName: projectMetadata.operationId },
                { ...binding, functionName: 'ExistingEvent', triggerConfigSettingName: 'ExistingEventTriggerConfigName' },
            ];
            dependencies.projectStore.readEvents = async () => [projectMetadata];
            if (testCase.fromEnvironment) {
                dependencies.hostLaunch = { kind: 'exactEnvironment', environment: { [siblingSetting]: 'existing-config' } };
            }
            dependencies.openSetup = async (_context, request) => {
                assert.strictEqual(request.requireExistingSharedNamespace, true);
                const cancellation = new vscode.CancellationTokenSource();
                return {
                    cancellationToken: cancellation.token,
                    selectResources: async () => {
                        if (testCase.config === 'changed' || testCase.config === 'changed-config') {
                            await AzExtFsExtra.writeJSON(settingsPath, { IsEncrypted: false, Values: {
                                [`${binding.connectionSettingName}__pollingEndpoint`]: testCase.config === 'changed' ?
                                    'https://different.example.logic.azure.com' : existingEndpoint,
                                [siblingSetting]: testCase.config === 'changed-config' ? 'different-config' : 'existing-config',
                            } });
                        }
                        return {
                            target,
                            namespace: testCase.config === 'new' ?
                                { kind: 'create', resourceGroupName: 'new-group', namespaceName: 'new-namespace' } :
                                { kind: 'existing', namespace: nonNullValue(state.namespace) },
                            connection: { kind: 'create', connectionName: 'new-connection' },
                            triggerConfigName: 'new-trigger-config',
                            localSettings: request.localSettings,
                        };
                    },
                    collectParameters: async () => ({}),
                    setStatus: () => undefined,
                    dispose: () => cancellation.dispose(),
                };
            };
            const ui = new ScriptedUi([], [], testCase.config === 'matching' ? ['Configure', /Open Sign-in Page/] : ['Configure']);
            try {
                await AzExtFsExtra.writeJSON(settingsPath, {
                    IsEncrypted: false,
                    Values: {
                        [`${binding.connectionSettingName}__pollingEndpoint`]: existingEndpoint,
                        ...(testCase.fromEnvironment ? {} : { [siblingSetting]: 'existing-config' }),
                    },
                });
                const setup = validateConnectorNamespacePreDebug(await createContext(ui), tempProject, dependencies);
                if (testCase.config === 'matching') {
                    await setup;
                    assert.deepStrictEqual(calls, ['verifySibling', 'ensureNamespace', 'ensureConnection']);
                    assert.strictEqual(writes, 1);
                } else {
                    await assert.rejects(setup, error => error instanceof ConnectorTriggerF5SetupError &&
                        /No Azure resources were changed/i.test(error.message));
                    assert.ok(!calls.includes('ensureNamespace'));
                    assert.ok(!calls.includes('ensureConnection'));
                    assert.strictEqual(writes, 0);
                }
                ui.assertConsumed();
            } finally {
                await AzExtFsExtra.deleteResource(tempProject, { recursive: true, useTrash: false });
            }
        });
    }

    test('requires an existing namespace for a previously configured shared event', async () => {
        const context = await createContext(new ScriptedUi([], [], []));
        const gateway = createGateway(createGatewayState());
        gateway.listNamespaces = async () => [createNamespace('existing')];
        const form = new ConnectorTriggerSetupForm(context, {
            metadata: projectMetadata, projectPath, workspaceId, binding, localSettings: [],
            requireExistingSharedNamespace: true,
        }, gateway, {
            listSubscriptions: async () => [{ id: target.subscription.id, label: 'Selected subscription' }],
            getSubscription: async () => target.subscription,
            listRegions: async () => [{ id: target.region, label: 'Selected region' }],
            listConnectors: async () => [], listEvents: async () => [],
            signIn: async () => assert.fail('The selected subscription is available.'),
        }, () => undefined);
        try {
            await form.handleMessage({ command: 'initializeSetup' });
            await form.handleMessage({ command: 'selectSubscription', revision: 1, id: form.state.subscriptionOptions[0].id });
            await form.handleMessage({ command: 'selectRegion', revision: 2, id: form.state.regionOptions[0].id });
            assert.strictEqual(form.state.namespaceOptions.length, 1);
            assert.strictEqual(form.state.namespaceIsNew, false);
            await form.handleMessage({ command: 'selectNamespace', revision: 3, id: 'new' });
            assert.ok(form.state.error);
            assert.strictEqual(form.state.namespaceIsNew, false);
        } finally {
            form.dispose();
        }
    });

    test('does not overwrite a shared endpoint added after setup was reviewed', async () => {
        const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-shared-race-'));
        const settingsPath = path.join(tempProject, 'local.settings.json');
        const settingName = `${binding.connectionSettingName}__pollingEndpoint`;
        const externalEndpoint = 'https://example.logic.azure.com/api/connectorGateways/external-gateway';
        const gateway = createGateway(createGatewayState());
        const createTriggerConfig = gateway.createOrUpdateTriggerConfig;
        gateway.createOrUpdateTriggerConfig = async (...args) => {
            const config = await createTriggerConfig(...args);
            await AzExtFsExtra.writeJSON(settingsPath, { IsEncrypted: false, Values: { [settingName]: externalEndpoint } });
            return config;
        };
        const dependencies = createDependencies(gateway, {
            resolveOperation: async () => ({ inputs: [] }),
            resolveDynamicInput: async () => ({}),
            serializeParameters: () => [],
        }, { markComplete: async () => undefined, write: async () => assert.fail('The real writer must be used.') });
        dependencies.localSettingsWriter = new FileConnectorTriggerLocalSettingsWriter();
        dependencies.protectSharedPollingEndpoint = true;
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            [],
            [/Open Sign-in Page/],
        );
        try {
            await AzExtFsExtra.writeJSON(settingsPath, { IsEncrypted: false, Values: {} });
            await assert.rejects(
                runConnectorTriggerF5Setup(await createContext(ui), tempProject, projectMetadata, binding, dependencies),
                error => error instanceof ConnectorTriggerF5SetupError &&
                    /already used by another Connector Trigger event/i.test(error.message),
            );
            const settings = await AzExtFsExtra.readJSON(settingsPath) as { Values: Record<string, string> };
            assert.strictEqual(settings.Values[settingName], externalEndpoint);
            ui.assertConsumed();
        } finally {
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true, useTrash: false });
        }
    });

    test('binding discovery errors fail closed without exposing the underlying response', async () => {
        const fail = async (): Promise<never> => assert.fail();
        const dependencies = createDependencies(createGateway(createGatewayState()), {
            resolveOperation: fail, resolveDynamicInput: fail, serializeParameters: () => assert.fail(),
        }, { markComplete: fail, write: fail });
        dependencies.bindingResolver.find = async () => { throw new Error('private-discovery-response'); };
        await assert.rejects(
            validateConnectorNamespacePreDebug(await createContext(new ScriptedUi([], [], [])), projectPath, dependencies),
            error => error instanceof Error && !error.message.includes('private-discovery-response') &&
                'code' in error && error.code === 'connectorTriggerF5SetupFailed',
        );
    });

    test('reuses deterministic resources after cancellation without creating duplicates', async () => {
        const state = createGatewayState();
        let resolveAttempts = 0;
        let completed = 0;
        let settingsWrites = 0;
        const operationResolver: ConnectorTriggerOperationResolver = {
            resolveOperation: async () => {
                resolveAttempts += 1;
                if (resolveAttempts === 1) {
                    throw new UserCancelledError('connectorF5Parameters');
                }
                return { inputs: [] };
            },
            resolveDynamicInput: async () => assert.fail('No dynamic inputs were expected.'),
            serializeParameters: () => [],
        };
        const dependencies = createDependencies(createGateway(state), operationResolver, {
            markComplete: async () => {
                completed += 1;
            },
            write: async () => {
                settingsWrites += 1;
            },
        });
        const firstContext = await createContext(new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            [],
            [/Open Sign-in Page/],
        ));

        await assert.rejects(
            runConnectorTriggerF5Setup(firstContext, projectPath, target, binding, dependencies),
            error => error instanceof UserCancelledError,
        );
        assert.strictEqual(state.namespaceCreateCount, 1);
        assert.strictEqual(state.connectionCreateCount, 1);
        assert.strictEqual(settingsWrites, 0);
        assert.strictEqual(completed, 0);

        const secondUi = new ScriptedUi([], [], []);
        const secondContext = await createContext(secondUi);
        await runConnectorTriggerF5Setup(secondContext, projectPath, target, binding, dependencies);

        assert.strictEqual(state.namespaceCreateCount, 1);
        assert.strictEqual(state.connectionCreateCount, 1);
        assert.strictEqual(settingsWrites, 1);
        assert.strictEqual(completed, 1);
        secondUi.assertConsumed();
    });

    test('derives polling endpoint only from supported service receiveUri forms', () => {
        assert.strictEqual(
            deriveConnectorPollingEndpoint(
                'https://example.logic.azure.com/api/triggerConfigs/config-name/receive',
            ),
            'https://example.logic.azure.com',
        );
        assert.strictEqual(
            deriveConnectorPollingEndpoint(
                'https://example.logic.azure.com/api/connectorGateways/gateway-id/triggerConfigs/config-name/receive/?ignored=true',
            ),
            'https://example.logic.azure.com/api/connectorGateways/gateway-id',
        );
        assert.throws(
            () => deriveConnectorPollingEndpoint(
                'https://management.azure.com/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/connectorGateways/gateway',
            ),
            /unsupported Connector Trigger polling endpoint/i,
        );
        assert.throws(
            () => deriveConnectorPollingEndpoint(
                'http://example.logic.azure.com/api/triggerConfigs/config-name/receive',
            ),
            /unsupported Connector Trigger polling endpoint/i,
        );
        assert.strictEqual(isValidConnectorPollingEndpoint('https://example.logic.azure.com'), true);
        assert.strictEqual(
            isValidConnectorPollingEndpoint('https://example.logic.azure.com/api/connectorGateways/gateway-id/'),
            true,
        );
        assert.strictEqual(
            isValidConnectorPollingEndpoint('https://example.logic.azure.com/api/connectorGateways/gateway-id?secret=value'),
            false,
        );
        assert.strictEqual(isValidConnectorPollingEndpoint('https://example.logic.azure.com/other'), false);
    });

    test('generates stable resource names without exposing target identifiers', () => {
        const first = createConnectorTriggerResourceNames(projectPath, target, binding, workspaceId);
        const second = createConnectorTriggerResourceNames(projectPath, target, binding, workspaceId);

        assert.deepStrictEqual(first, second);
        assert.match(first.namespaceName, /^func-connectors-[a-f0-9]{10}$/);
        assert.match(first.connectionName, /^office365-[a-f0-9]{10}$/);
        assert.match(first.triggerConfigName, /^onnewemailv3-[a-f0-9]{10}$/);
        assert.doesNotMatch(JSON.stringify(first), /subscription-id|tenant-id|connector-project/i);
    });

    test('resolves the Outlook folder tree through its concrete dynamicInvoke open path', async () => {
        const state = createGatewayState();
        const namespace = createNamespace('gateway');
        const connection = createConnection('connection', 'Connected');
        state.namespace = namespace;
        state.connection = connection;
        let dynamicRequest: ConnectorTriggerDynamicInvokeRequest | undefined;
        const gateway = createGateway(state, {
            onDynamicInvoke: request => {
                dynamicRequest = request;
                return {
                    response: {
                        statusCode: 200,
                        body: {
                            value: [
                                { Id: 'inbox-id', DisplayName: 'Inbox' },
                                { Id: 'archive-id', DisplayName: 'Archive' },
                            ],
                        },
                    },
                };
            },
        });
        const resolver = new SwaggerConnectorTriggerOperationResolver(gateway, {
            getSwagger: async () => createOutlookSwagger(),
        });
        const context = await createContext(new ScriptedUi([], [], []));
        const operation = await resolver.resolveOperation(context, {
            target,
            namespace,
            connection,
        });
        const folderInput = nonNullValue(operation.inputs.find(input => input.name === 'folderPath'));

        assert.strictEqual(folderInput.dynamic?.kind, 'tree');
        const resolution = await resolver.resolveDynamicInput(context, {
            target,
            namespace,
            connection,
            operation,
            input: folderInput,
            values: {},
        });

        assert.deepStrictEqual(dynamicRequest, {
            request: {
                method: 'GET',
                path: '/OnFilePickerOpen',
                queries: {
                    operation: 'MailFolders',
                },
            },
        });
        assert.deepStrictEqual(resolution.options, [
            { label: 'Inbox', value: 'inbox-id' },
            { label: 'Archive', value: 'archive-id' },
        ]);
    });

    test('accepts the live OK status for dynamic folder results', async () => {
        const context = await createContext(new ScriptedUi([], [], []));
        const request = {
            target,
            namespace: createNamespace('gateway'),
            connection: createConnection('connection', 'Connected'),
        };
        const body = { value: [{ Id: 'inbox-id', DisplayName: 'Inbox' }] };
        for (const response of [
            { statusCode: 'OK', body },
            { response: { statusCode: 'OK', body: JSON.stringify(body) } },
        ]) {
            const resolver = createSwaggerResolver(createOutlookSwagger(), () => response);
            const operation = await resolver.resolveOperation(context, request);
            const resolution = await resolver.resolveDynamicInput(context, {
                ...request,
                operation,
                input: nonNullValue(operation.inputs.find(input => input.name === 'folderPath')),
                values: {},
            });
            assert.deepStrictEqual(resolution.options, [{ label: 'Inbox', value: 'inbox-id' }]);
        }
    });

    test('preserves Outlook built-in address suggestions as typed filters alongside the folder tree', async () => {
        const resolver = createSwaggerResolver(createOutlookSwagger(true, true));
        const context = await createContext(new ScriptedUi([], [], []));
        const operation = await resolver.resolveOperation(context, {
            target,
            namespace: createNamespace('gateway'),
            connection: createConnection('connection', 'Connected'),
        });
        const folder = nonNullValue(operation.inputs.find(input => input.name === 'folderPath'));
        assert.strictEqual(folder.dynamic?.kind, 'tree');
        const addressNames = ['to', 'cc', 'toOrCc', 'from'];
        const addressInputs = operation.inputs.filter(input => addressNames.includes(input.name));
        assert.deepStrictEqual(addressInputs.map(input => ({
            name: input.name,
            type: input.type,
            required: input.required,
            dynamic: input.dynamic,
        })), addressNames.map(name => ({
            name,
            type: 'string',
            required: false,
            dynamic: undefined,
        })));
        assert.deepStrictEqual(resolver.serializeParameters(operation, addressInputs, {
            from: 'sender@example.invalid;other@example.invalid',
        }), [{ name: 'from', value: 'sender@example.invalid;other@example.invalid' }]);
    });

    test('rejects unsupported or malformed built-in address suggestion metadata', async () => {
        const context = await createContext(new ScriptedUi([], [], []));
        const request = {
            target,
            namespace: createNamespace('gateway'),
            connection: createConnection('connection', 'Connected'),
        };
        const descriptor = {
            builtInOperation: 'AadGraph.GetUsers',
            parameters: {},
            'value-path': 'mail',
        };
        for (const metadata of [
            { ...descriptor, builtInOperation: 'Unknown.Lookup' },
            { ...descriptor, 'value-path': 'unknown' },
            { ...descriptor, parameters: { unsupported: true } },
            { ...descriptor, operationId: 'MissingOperation' },
            { ...descriptor, dynamicState: {} },
        ]) {
            const resolver = createSwaggerResolver(createDynamicValuesSwagger(metadata));
            await assert.rejects(resolver.resolveOperation(context, request), /unsupported dynamic metadata/i);
        }
        const resolver = createSwaggerResolver({
            paths: {
                '/event': {
                    get: {
                        operationId: target.operationId,
                        parameters: [{
                            name: 'from',
                            in: 'query',
                            type: 'integer',
                            'x-ms-dynamic-values': descriptor,
                        }],
                    },
                },
            },
        });
        await assert.rejects(resolver.resolveOperation(context, request), /unsupported dynamic metadata/i);
    });

    test('rejects unavailable event definitions but accepts a known parameterless event', async () => {
        const context = await createContext(new ScriptedUi([], [], []));
        const request = {
            target,
            namespace: createNamespace('gateway'),
            connection: createConnection('connection', 'Connected'),
        };
        for (const swagger of [
            {},
            { paths: {} },
            { paths: { '/event': { get: { operationId: 'AnotherEvent' } } } },
            {
                paths: {
                    '/event': {
                        get: { operationId: target.operationId, parameters: 'unavailable' },
                    },
                },
            },
            {
                paths: {
                    '/event': {
                        get: {
                            operationId: target.operationId,
                            parameters: [{ $ref: '#/parameters/Missing' }],
                        },
                    },
                },
            },
            {
                paths: {
                    '/event': {
                        get: {
                            operationId: target.operationId,
                            parameters: [{
                                name: 'body',
                                in: 'body',
                                schema: {
                                    type: 'object',
                                    properties: { folder: { $ref: '#/definitions/Missing' } },
                                },
                            }],
                        },
                    },
                },
            },
        ]) {
            const resolver = createSwaggerResolver(swagger);
            await assert.rejects(
                resolver.resolveOperation(context, request),
                /connector.*(definition|parameters)/i,
            );
        }

        const resolver = createSwaggerResolver({
            paths: { '/event': { get: { operationId: target.operationId, parameters: [] } } },
        });
        assert.deepStrictEqual((await resolver.resolveOperation(context, request)).inputs, []);
    });

    test('projects root-array dynamic values using metadata labels and typed IDs', async () => {
        const context = await createContext(new ScriptedUi([], [], []));
        const resolver = createSwaggerResolver(
            createDynamicValuesSwagger({
                operationId: 'ListFolders',
                itemValuePath: 'id',
                itemTitlePath: 'properties/displayName',
            }),
            () => ({
                response: {
                    statusCode: '200',
                    body: JSON.stringify([
                        { id: 12, properties: { displayName: 'Inbox' } },
                        { id: 34, properties: { displayName: 'Archive' } },
                    ]),
                },
            }),
        );
        const request = {
            target,
            namespace: createNamespace('gateway'),
            connection: createConnection('connection', 'Connected'),
        };
        const operation = await resolver.resolveOperation(context, request);
        const resolution = await resolver.resolveDynamicInput(context, {
            ...request,
            operation,
            input: nonNullValue(operation.inputs[0]),
            values: {},
        });
        assert.deepStrictEqual(resolution.options, [
            { label: 'Inbox', value: 12 },
            { label: 'Archive', value: 34 },
        ]);
    });

    test('rejects malformed dynamic responses instead of treating them as empty choices', async () => {
        const context = await createContext(new ScriptedUi([], [], []));
        const request = {
            target,
            namespace: createNamespace('gateway'),
            connection: createConnection('connection', 'Connected'),
        };
        for (const response of [
            { response: { statusCode: '403', body: { error: 'private-response' } } },
            { response: { statusCode: 'NotFound', body: { value: [{ id: 'inbox-id', name: 'Inbox' }] } } },
            { response: { statusCode: 'ok', body: { value: [{ id: 'inbox-id', name: 'Inbox' }] } } },
            { response: { statusCode: 'OK', body: 'private-response' } },
            { response: { statusCode: 200, body: 'private-response' } },
            { response: { statusCode: 200, body: { unexpected: [] } } },
            { response: { statusCode: 200, body: { value: [{ unexpected: 'private-response' }] } } },
            { response: { statusCode: 200, body: { value: [{ id: 'private-response' }] } } },
        ]) {
            const resolver = createSwaggerResolver(createDynamicValuesSwagger({
                operationId: 'ListFolders',
                itemsPath: 'value',
                itemValuePath: 'id',
                itemTitlePath: 'name',
            }), () => response);
            const operation = await resolver.resolveOperation(context, request);
            await assert.rejects(
                resolver.resolveDynamicInput(context, {
                    ...request,
                    operation,
                    input: nonNullValue(operation.inputs[0]),
                    values: {},
                }),
                error => error instanceof Error &&
                    /connector.*(parameter|values)/i.test(error.message) &&
                    !error.message.includes('private-response'),
            );
        }
    });

    test('does not request arbitrary text when a required dynamic list is empty', async () => {
        const state = createGatewayState();
        const gateway = createGateway(state, {
            onDynamicInvoke: () => ({ response: { statusCode: 200, body: [] } }),
        });
        const resolver = new SwaggerConnectorTriggerOperationResolver(gateway, {
            getSwagger: async () => createDynamicValuesSwagger({
                operationId: 'ListFolders',
                itemValuePath: 'id',
                itemTitlePath: 'name',
            }),
        });
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            [],
            [/Open Sign-in Page/],
        );
        const dependencies = createDependencies(gateway, resolver, {
            markComplete: async () => assert.fail('Empty required options cannot complete setup.'),
            write: async () => assert.fail('Empty required options cannot write settings.'),
        });

        await assert.rejects(
            runConnectorTriggerF5Setup(await createContext(ui), projectPath, target, binding, dependencies),
            /no.*values.*(parameter|folder)|no.*(parameter|folder).*values/i,
        );
        assert.strictEqual(state.triggerParameters, undefined);
        ui.assertConsumed();
    });

    test('configures a webhook source event with Poll delivery to the function', async () => {
        const state = createGatewayState();
        const gateway = createGateway(state);
        const createTriggerConfig = gateway.createOrUpdateTriggerConfig;
        gateway.createOrUpdateTriggerConfig = async (context, request, options) => {
            assert.strictEqual(request.target.operationId, 'WebhookEvent');
            assert.strictEqual(request.deliveryMode, 'Poll');
            return await createTriggerConfig(context, request, options);
        };
        const resolver = new SwaggerConnectorTriggerOperationResolver(gateway, {
            getSwagger: async () => ({
                paths: {
                    '/subscribe': {
                        'x-ms-notification-content': { schema: { type: 'object' } },
                        post: {
                            operationId: 'WebhookEvent',
                            parameters: [
                                { name: 'callbackUrl', in: 'query', type: 'string', required: true, 'x-ms-notification-url': true },
                                { name: 'folder', in: 'query', type: 'string', required: true },
                            ],
                        },
                    },
                },
            }),
        });
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            ['inbox'],
            [/Open Sign-in Page/],
        );
        const dependencies = createDependencies(gateway, resolver, {
            markComplete: async () => undefined,
            write: async () => undefined,
        });

        await runConnectorTriggerF5Setup(await createContext(ui), projectPath, {
            ...projectMetadata, operationId: 'WebhookEvent',
        }, binding, dependencies);

        assert.deepStrictEqual(state.triggerParameters, [{ name: 'folder', value: 'inbox' }]);
        ui.assertConsumed();
    });

    test('prompts dependencies before dynamic values and preserves static parameter types', async () => {
        const state = createGatewayState();
        let invoked = false;
        const gateway = createGateway(state, {
            onDynamicInvoke: request => {
                invoked = true;
                assert.deepStrictEqual(request.request, {
                    method: 'GET',
                    path: '/mailboxes/mailbox%2Fname/folders',
                });
                return { response: { statusCode: 200, body: [{ id: 'inbox-id', name: 'Inbox' }] } };
            },
        });
        const resolver = new SwaggerConnectorTriggerOperationResolver(gateway, {
            getSwagger: async () => createDependentValuesSwagger(),
        });
        const context = await createContext(new ScriptedUi([], [], []));
        const request = {
            target,
            namespace: createNamespace('gateway'),
            connection: createConnection('connection', 'Connected'),
        };
        const operation = await resolver.resolveOperation(context, request);
        const folder = nonNullValue(operation.inputs.find(input => input.name === 'folderPath'));
        assert.deepStrictEqual(folder.dynamic?.dependsOn, ['mailbox']);
        await assert.rejects(resolver.resolveDynamicInput(context, {
            ...request,
            operation,
            input: folder,
            values: {},
        }), /dependency.*value/i);
        assert.strictEqual(invoked, false);

        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/, [], 'false', '0.5', 'Inbox'],
            ['1000', 'mailbox/name'],
            [/Open Sign-in Page/],
        );
        const dependencies = createDependencies(gateway, resolver, {
            markComplete: async () => undefined,
            write: async () => undefined,
        });
        await runConnectorTriggerF5Setup(await createContext(ui), projectPath, target, binding, dependencies);
        assert.deepStrictEqual([...nonNullValue(state.triggerParameters)].sort(compareParameters), [
            { name: 'folderPath', value: 'inbox-id' },
            { name: 'includeAttachments', value: false },
            { name: 'mailbox', value: 'mailbox/name' },
            { name: 'maxBatch', value: 1000 },
            { name: 'minimumScore', value: 0.5 },
        ]);
        ui.assertConsumed();
    });

    test('rejects cyclic parameter dependencies before loading values or writing runtime configuration', async () => {
        const inputs = createOperationInputs();
        nonNullValue(inputs.find(input => input.name === 'requiredValue')).dynamic = {
            kind: 'values',
            dependsOn: ['folderPath'],
            metadata: {},
        };
        const state = createGatewayState();
        const dependencies = createDependencies(createGateway(state), {
            resolveOperation: async () => ({ inputs }),
            resolveDynamicInput: async () => assert.fail('Cyclic dependencies cannot load values.'),
            serializeParameters: () => assert.fail('Cyclic dependencies cannot create a Trigger Config.'),
        }, {
            markComplete: async () => assert.fail('Cyclic dependencies cannot complete setup.'),
            write: async () => assert.fail('Cyclic dependencies cannot write settings.'),
        });
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            [],
            [/Open Sign-in Page/],
        );
        await assert.rejects(
            runConnectorTriggerF5Setup(await createContext(ui), projectPath, target, binding, dependencies),
            /dependency cycle/i,
        );
        assert.strictEqual(state.triggerParameters, undefined);
        ui.assertConsumed();
    });

    test('uses body-schema tree metadata while separating browse IDs from selectable leaf values', async () => {
        const itemMetadata = {
            itemsPath: 'value',
            itemValuePath: 'Path',
            itemTitlePath: 'DisplayName',
            itemIsParent: 'IsFolder',
        };
        const swagger = {
            definitions: {
                Body: {
                    type: 'object',
                    required: ['folderPath'],
                    properties: {
                        folderPath: {
                            type: 'string',
                            'x-ms-dynamic-tree': {
                                settings: { canSelectParentNodes: false, canSelectLeafNodes: true },
                                open: { operationId: 'OpenFolders', ...itemMetadata },
                                browse: {
                                    operationId: 'BrowseFolders',
                                    ...itemMetadata,
                                    parameters: { id: { selectedItemValuePath: 'Id' } },
                                },
                            },
                        },
                    },
                },
            },
            paths: {
                '/event': {
                    get: {
                        operationId: target.operationId,
                        parameters: [{ name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/Body' } }],
                    },
                },
                '/folders': { get: { operationId: 'OpenFolders', parameters: [] } },
                '/folders/{id}': {
                    get: {
                        operationId: 'BrowseFolders',
                        parameters: [{ name: 'id', in: 'path', type: 'string', required: true }],
                    },
                },
            },
        };
        const state = createGatewayState();
        const requests: string[] = [];
        const gateway = createGateway(state, {
            onDynamicInvoke: request => {
                requests.push(request.request.path);
                return {
                    response: {
                        statusCode: 200,
                        body: {
                            value: request.request.path === '/folders' ?
                                [{ Id: 'inbox-id', Path: '/mail/Inbox', DisplayName: 'Inbox', IsFolder: true }] :
                                [{ Id: 'projects-id', Path: '/mail/Inbox/Projects', DisplayName: 'Projects', IsFolder: false }],
                        },
                    },
                };
            },
        });
        const resolver = new SwaggerConnectorTriggerOperationResolver(gateway, {
            getSwagger: async () => swagger,
        });
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/, 'Inbox', 'Projects'],
            [],
            [/Open Sign-in Page/],
        );
        const dependencies = createDependencies(gateway, resolver, {
            markComplete: async () => undefined,
            write: async () => undefined,
        });

        await runConnectorTriggerF5Setup(await createContext(ui), projectPath, target, binding, dependencies);
        assert.deepStrictEqual(requests, ['/folders', '/folders/inbox-id']);
        assert.deepStrictEqual(state.triggerParameters, [{ name: 'folderPath', value: '/mail/Inbox/Projects' }]);
        assert.strictEqual(ui.quickPickLabels.flat().some(label => /Select this folder/.test(label)), false);
        ui.assertConsumed();
    });

    test('rejects unsupported dynamic metadata and keeps a safe actionable pre-debug error', async () => {
        const state = createGatewayState();
        const resolver = createSwaggerResolver(createDynamicValuesSwagger({
            operationId: 'MissingOperation',
        }));
        const dependencies = createDependencies(createGateway(state), resolver, {
            markComplete: async () => assert.fail('Invalid metadata cannot complete setup.'),
            write: async () => assert.fail('Invalid metadata cannot write settings.'),
        });
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            [],
            ['Configure', /Open Sign-in Page/],
        );
        await assert.rejects(
            validateConnectorNamespacePreDebug(await createContext(ui), projectPath, dependencies),
            error => error instanceof Error &&
                /unsupported dynamic metadata/i.test(error.message) &&
                !error.message.includes(target.operationId) &&
                !error.message.includes(projectPath),
        );
        assert.strictEqual(state.triggerParameters, undefined);
        ui.assertConsumed();
    });

    test('can explicitly skip an optional empty dynamic list without entering arbitrary text', async () => {
        const state = createGatewayState();
        const gateway = createGateway(state, {
            onDynamicInvoke: () => ({ response: { statusCode: 200, body: { value: [] } } }),
        });
        const resolver = new SwaggerConnectorTriggerOperationResolver(gateway, {
            getSwagger: async () => createOutlookSwagger(),
        });
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/, /Skip for now/],
            [],
            [/Open Sign-in Page/],
        );
        const dependencies = createDependencies(gateway, resolver, {
            markComplete: async () => undefined,
            write: async () => undefined,
        });

        await runConnectorTriggerF5Setup(await createContext(ui), projectPath, target, binding, dependencies);
        assert.deepStrictEqual(state.triggerParameters, []);
        ui.assertConsumed();
    });

    test('reuses authentication after cancelling folder selection and supports folder Back navigation', async () => {
        const state = createGatewayState();
        let completed = 0;
        let written = 0;
        let invocations = 0;
        const gateway = createGateway(state, {
            onDynamicInvoke: request => {
                invocations += 1;
                return {
                    response: {
                        statusCode: 200,
                        body: {
                            value: request.request.path === '/OnFilePickerOpen' ? [
                                { Id: 'inbox-id', DisplayName: 'Inbox', IsFolder: true },
                                { Id: 'archive-id', DisplayName: 'Archive', IsFolder: true },
                            ] : [],
                        },
                    },
                };
            },
        });
        const resolver = new SwaggerConnectorTriggerOperationResolver(gateway, {
            getSwagger: async () => createOutlookSwagger(true),
        });
        const dependencies = createDependencies(gateway, resolver, {
            markComplete: async () => {
                completed += 1;
            },
            write: async () => {
                written += 1;
            },
        });
        const cancelledUi = new ScriptedUi(
            [
                /Create a new Connector Namespace/,
                /Create a new connector connection/,
                new UserCancelledError('connectorF5Parameter'),
            ],
            [],
            [/Open Sign-in Page/],
        );
        await assert.rejects(
            runConnectorTriggerF5Setup(await createContext(cancelledUi), projectPath, target, binding, dependencies),
            error => error instanceof UserCancelledError,
        );
        assert.strictEqual(written, 0);
        assert.strictEqual(completed, 0);
        assert.strictEqual(state.triggerParameters, undefined);
        cancelledUi.assertConsumed();

        const retryUi = new ScriptedUi(['Inbox', /Back to previous folder/, 'Archive', /Select this folder/], [], []);
        await runConnectorTriggerF5Setup(await createContext(retryUi), projectPath, target, binding, dependencies);
        assert.deepStrictEqual(state.triggerParameters, [{ name: 'folderPath', value: 'archive-id' }]);
        assert.strictEqual(invocations, 4);
        assert.strictEqual(state.namespaceCreateCount, 1);
        assert.strictEqual(state.connectionCreateCount, 1);
        assert.strictEqual(written, 1);
        assert.strictEqual(completed, 1);
        retryUi.assertConsumed();
    });

    for (const hasMetadata of [true, false]) {
    test(`configures an authenticated nested Outlook folder ${hasMetadata ? 'with v1 identity' : 'by explicitly associating a metadata-free single event'}`, async () => {
        const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-folders-'));
        let source = `app.connectorTrigger('MyCustomMailRegistration', {
    deliveryMode: 'Poll',
    connection: 'ConnectorNamespace',
    triggerConfigName: '%OnNewEmailTriggerConfigName%',
    handler: async () => undefined,
});
`;
        let sourcePath = path.join(tempProject, 'function.ts');
        let discoveredBinding = binding;
        const state = createGatewayState();
        const requests: ConnectorTriggerDynamicInvokeRequest[] = [];
        let accessConfigured = false;
        const gateway = createGateway(state, {
            onAccessPolicies: () => {
                accessConfigured = true;
            },
            onDynamicInvoke: request => {
                assert.strictEqual(state.connection?.status, 'Connected');
                assert.strictEqual(accessConfigured, true);
                requests.push(request);
                const parent = request.request.queries?.id;
                const folders = request.request.path === '/OnFilePickerOpen' ?
                    [{ Id: 'inbox-id', DisplayName: 'Inbox', IsFolder: true }] :
                    parent === 'inbox-id' ?
                        [{ Id: 'projects-id', DisplayName: 'Projects', IsFolder: true }] :
                        [];
                return { response: { statusCode: 200, body: { value: folders } } };
            },
        });
        const resolver = new SwaggerConnectorTriggerOperationResolver(gateway, {
            getSwagger: async () => createOutlookSwagger(true),
        });
        const dependencies: ConnectorTriggerF5Dependencies = {
            bindingResolver: new ProjectConnectorTriggerBindingResolver(),
            gateway,
            projectStore: {
                read: readConnectorTriggerProjectMetadata,
                markComplete: async () => undefined,
            },
            operationResolver: resolver,
            openSetup: async (context, request) => createScriptedSetupSession(context, request, gateway, resolver),
            runtime: createRuntime(),
            workspaceIdentity: { get: async () => workspaceId },
        };
        const ui = new ScriptedUi(
            [
                ...hasMetadata ? [] : ['Office 365 Outlook', 'When a new email arrives (V3)'],
                /Create a new Connector Namespace/,
                /Create a new connector connection/,
                'Inbox',
                'Projects',
                /Select this folder/,
            ],
            [],
            ['Configure', /Open Sign-in Page/],
        );
        try {
            if (hasMetadata) {
                await AzExtFsExtra.writeFile(sourcePath, source);
            } else {
                await ensureConnectorTriggerPollProject(tempProject, ProjectLanguage.TypeScript, projectMetadata);
                const sourceFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(tempProject, '**/*.ts'));
                assert.strictEqual(sourceFiles.length, 1);
                sourcePath = sourceFiles[0].fsPath;
                source = (await AzExtFsExtra.readFile(sourcePath)).toString();
                const bindings = await dependencies.bindingResolver.find(await createContext(ui), tempProject);
                assert.strictEqual(bindings.length, 1);
                discoveredBinding = bindings[0];
                assert.notStrictEqual(discoveredBinding.triggerConfigSettingName, binding.triggerConfigSettingName);
            }
            await AzExtFsExtra.writeFile(path.join(tempProject, '.gitignore'), 'local.settings.json\n');
            await AzExtFsExtra.writeJSON(path.join(tempProject, 'local.settings.json'), {
                IsEncrypted: false,
                Values: {
                    UnrelatedSetting: 'keep-this-value',
                    [`${discoveredBinding.connectionSettingName}__pollingEndpoint`]: '',
                    [discoveredBinding.triggerConfigSettingName]: '',
                },
            });
            if (hasMetadata) {
                await writeConnectorTriggerProjectMetadata(tempProject, projectMetadata);
            }
            const metadataPath = path.join(tempProject, '.vscode', 'azureFunctions.connectorTrigger.json');
            const metadataBefore = hasMetadata ? await fs.promises.readFile(metadataPath, 'utf8') : undefined;
            assert.strictEqual(await AzExtFsExtra.pathExists(path.join(tempProject, '.azurefunctions')), false);
            assert.doesNotMatch(metadataBefore ?? '', /subscription|tenant|region|environment|management\.azure/);

            await validateConnectorNamespacePreDebug(await createContext(ui), tempProject, dependencies);

            assert.deepStrictEqual(requests.map(request => request.request), [
                { method: 'GET', path: '/OnFilePickerOpen', queries: { operation: 'MailFolders' } },
                {
                    method: 'GET',
                    path: '/OnFilePickerBrowse',
                    queries: { operation: 'MailFolders', id: 'inbox-id' },
                },
                {
                    method: 'GET',
                    path: '/OnFilePickerBrowse',
                    queries: { operation: 'MailFolders', id: 'projects-id' },
                },
            ]);
            assert.deepStrictEqual(state.triggerParameters, [{ name: 'folderPath', value: 'projects-id' }]);
            assert.deepStrictEqual(await AzExtFsExtra.readJSON(path.join(tempProject, 'local.settings.json')), {
                IsEncrypted: false,
                Values: {
                    UnrelatedSetting: 'keep-this-value',
                    [`${discoveredBinding.connectionSettingName}__pollingEndpoint`]:
                        'https://example.logic.azure.com/api/connectorGateways/gateway-id',
                    [discoveredBinding.triggerConfigSettingName]: state.triggerConfigName,
                },
            });
            assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(tempProject), hasMetadata ? projectMetadata : undefined);
            assert.strictEqual((await AzExtFsExtra.readFile(sourcePath)).toString(), source);
            const repeatContext = await createContext(new ScriptedUi([], [], []));
            await validateConnectorNamespacePreDebug(repeatContext, tempProject, dependencies);
            assert.strictEqual(repeatContext.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
            assert.strictEqual(requests.length, 3);
            assert.strictEqual(state.namespaceCreateCount, 1);
            assert.strictEqual(state.connectionCreateCount, 1);
            if (hasMetadata) {
                assert.strictEqual(await fs.promises.readFile(metadataPath, 'utf8'), metadataBefore);
            } else {
                assert.strictEqual(await AzExtFsExtra.pathExists(metadataPath), false);
            }
            assert.strictEqual(await AzExtFsExtra.pathExists(path.join(tempProject, '.azurefunctions')), false);
            ui.assertConsumed();
        } finally {
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true });
        }
    });
    }

    test('skips scope selection and Azure setup for identity-only metadata with valid runtime settings', async () => {
        const tempProject = path.join(os.tmpdir(), `connector-f5-${Date.now()}`);
        await AzExtFsExtra.ensureDir(tempProject);
        await AzExtFsExtra.writeJSON(path.join(tempProject, 'local.settings.json'), {
            IsEncrypted: false,
            Values: {
                ['ConnectorNamespace__pollingEndpoint']:
                    'https://example.logic.azure.com/api/connectorGateways/gateway-id',
                OnNewEmailTriggerConfigName: 'trigger-config-name',
            },
        });
        let completed = 0;
        const fail = async (): Promise<never> => assert.fail('Azure setup must not run for valid settings.');
        const dependencies: ConnectorTriggerF5Dependencies = {
            bindingResolver: {
                find: async () => [binding],
                resolve: async () => binding,
            },
            gateway: {
                assertConnectorConnectionCreatable: fail,
                listNamespaces: fail,
                ensureNamespace: fail,
                listConnections: fail,
                ensureConnection: fail,
                getConnection: fail,
                getConsentLink: fail,
                dynamicInvoke: fail,
                ensureConnectionAccessPolicies: fail,
                createOrUpdateTriggerConfig: fail,
                getPollingPrincipal: fail,
                getTriggerConfig: fail,
            },
            projectStore: {
                read: readConnectorTriggerProjectMetadata,
                markComplete: async () => {
                    completed += 1;
                },
            },
            operationResolver: {
                resolveOperation: fail,
                resolveDynamicInput: fail,
                serializeParameters: () => assert.fail('Parameters must not be serialized.'),
            },
            openSetup: fail,
            workspaceIdentity: { get: async () => workspaceId },
        };

        try {
            await writeConnectorTriggerProjectMetadata(tempProject, projectMetadata);
            const settingsPath = path.join(tempProject, '.vscode', 'azureFunctions.connectorTrigger.json');
            const before = (await AzExtFsExtra.readFile(settingsPath)).toString();
            const context = await createContext(new ScriptedUi([], [], []));
            await validateConnectorNamespacePreDebug(context, tempProject, dependencies);

            assert.strictEqual(completed, 0);
            assert.strictEqual(context.telemetry.properties.connectorPollTriggerDetected, 'true');
            assert.strictEqual(context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
            assert.strictEqual((await AzExtFsExtra.readFile(settingsPath)).toString(), before);
            assert.strictEqual(await AzExtFsExtra.pathExists(path.join(tempProject, '.azurefunctions')), false);
        } finally {
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true });
        }
    });
});

suite('Connector Trigger pre-debug setup review', () => {
    test('cancelled review does not provision, authenticate, configure or write local settings', async () => {
        const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-f5-review-'));
        const settingsPath = path.join(tempProject, 'local.settings.json');
        const source = `app.connectorTrigger('OnNewEmailV3', {
    deliveryMode: 'Poll',
    connection: 'ConnectorNamespace',
    triggerConfigName: '%OnNewEmailTriggerConfigName%',
    handler: async () => undefined,
});
`;
        const state = createGatewayState();
        const fail = async (): Promise<never> => assert.fail('Cancelled review cannot perform setup side effects.');
        const gateway: ConnectorTriggerGateway = {
            ...createGateway(state),
            listConnections: async () => assert.fail('A new namespace has no existing connection to enumerate.'),
            ensureNamespace: fail,
            ensureConnection: fail,
            getConnection: fail,
            getConsentLink: fail,
            ensureConnectionAccessPolicies: fail,
            dynamicInvoke: fail,
            createOrUpdateTriggerConfig: fail,
        };
        const previousEnvironment = process.env[binding.triggerConfigSettingName];
        delete process.env[binding.triggerConfigSettingName];
        let reviewed = 0;
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            [],
            ['Configure'],
        );
        const dependencies = createDependencies(gateway, {
            resolveOperation: fail,
            resolveDynamicInput: fail,
            serializeParameters: () => assert.fail('Review cannot serialize event values.'),
        }, {
            review: async (context, plan) => {
                reviewed += 1;
                assert.deepStrictEqual(plan.target, target);
                assert.strictEqual(plan.namespace.kind, 'create');
                assert.strictEqual(plan.connection.kind, 'create');
                assert.deepStrictEqual(plan.localSettings, [
                    { name: 'ConnectorNamespace__pollingEndpoint', purpose: 'pollingEndpoint', exists: false, environmentOverride: false },
                    { name: 'OnNewEmailTriggerConfigName', purpose: 'triggerConfig', exists: true, environmentOverride: false },
                ]);
                assert.doesNotMatch(JSON.stringify(plan), /fixture-existing-secret|fixture-environment-secret|unrelated-secret/);
                assert.doesNotMatch(JSON.stringify(context.telemetry.properties), /subscription-id|tenant-id|connector-project/);
                return false;
            },
            write: fail,
            markComplete: fail,
        });
        dependencies.bindingResolver = new ProjectConnectorTriggerBindingResolver();
        dependencies.projectStore.read = readConnectorTriggerProjectMetadata;
        try {
            await AzExtFsExtra.writeFile(path.join(tempProject, 'function.ts'), source);
            await AzExtFsExtra.writeFile(path.join(tempProject, '.gitignore'), 'local.settings.json\n');
            await AzExtFsExtra.writeJSON(settingsPath, {
                IsEncrypted: false,
                Values: { OnNewEmailTriggerConfigName: 'fixture-existing-secret', Unrelated: 'unrelated-secret' },
            });
            await writeConnectorTriggerProjectMetadata(tempProject, projectMetadata);
            const before = await fs.promises.readFile(settingsPath, 'utf8');

            await assert.rejects(
                validateConnectorNamespacePreDebug(await createContext(ui), tempProject, dependencies),
                error => error instanceof UserCancelledError,
            );

            assert.strictEqual(reviewed, 1);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), before);
            assert.strictEqual(await fs.promises.readFile(path.join(tempProject, 'function.ts'), 'utf8'), source);
            assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(tempProject), projectMetadata);
            assert.strictEqual(state.namespaceCreateCount, 0);
            assert.strictEqual(state.connectionCreateCount, 0);
            assert.strictEqual(state.triggerParameters, undefined);
            ui.assertConsumed();
        } finally {
            if (previousEnvironment === undefined) {
                delete process.env[binding.triggerConfigSettingName];
            } else {
                process.env[binding.triggerConfigSettingName] = previousEnvironment;
            }
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true });
        }
    });

    test('reviews deterministic reuse before ensuring existing namespace and connection resources', async () => {
        const names = createConnectorTriggerResourceNames(projectPath, target, binding, workspaceId);
        const state = createGatewayState();
        state.namespace = { ...createNamespace(names.namespaceName), resourceGroupName: names.resourceGroupName };
        state.connection = createConnection(names.connectionName, 'Connected');
        const gateway = createGateway(state);
        let approved = false;
        const dependencies = createDependencies({
            ...gateway,
            ensureNamespace: async (...args) => {
                assert.strictEqual(approved, true);
                return await gateway.ensureNamespace(...args);
            },
            ensureConnection: async (...args) => {
                assert.strictEqual(approved, true);
                return await gateway.ensureConnection(...args);
            },
        }, {
            resolveOperation: async () => ({ inputs: [] }),
            resolveDynamicInput: async () => assert.fail('No dynamic choices are expected.'),
            serializeParameters: () => [],
        }, {
            review: async (_context, plan) => {
                assert.strictEqual(plan.namespace.kind, 'existing');
                assert.strictEqual(plan.connection.kind, 'existing');
                assert.strictEqual(plan.triggerConfigName, names.triggerConfigName);
                assert.strictEqual(state.triggerParameters, undefined);
                approved = true;
                return true;
            },
            markComplete: async () => undefined,
            write: async () => undefined,
        });
        const ui = new ScriptedUi([], [], []);
        await runConnectorTriggerF5Setup(await createContext(ui), projectPath, target, binding, dependencies);
        assert.strictEqual(approved, true);
        assert.strictEqual(state.namespaceCreateCount, 0);
        assert.strictEqual(state.connectionCreateCount, 0);
        assert.deepStrictEqual(state.triggerParameters, []);
        ui.assertConsumed();
    });

    test('closing during namespace creation stops new operations and retry reuses the created resource', async () => {
        const state = createGatewayState();
        const gateway = createGateway(state);
        let close: (() => void) | undefined;
        let closeFirstAttempt = true;
        let written = 0;
        const dependencies = createDependencies({
            ...gateway,
            ensureNamespace: async (...args) => {
                const namespace = await gateway.ensureNamespace(...args);
                if (closeFirstAttempt) {
                    closeFirstAttempt = false;
                    nonNullValue(close)();
                }
                return namespace;
            },
        }, {
            resolveOperation: async () => ({ inputs: [] }),
            resolveDynamicInput: async () => assert.fail('No dynamic choices are expected.'),
            serializeParameters: () => [],
        }, {
            markComplete: async () => undefined,
            write: async () => { written += 1; },
        });
        const open = dependencies.openSetup;
        dependencies.openSetup = async (context, request) => {
            const setup = await open(context, request);
            close = () => setup.dispose();
            return setup;
        };
        const cancelled = new ScriptedUi([/Create a new Connector Namespace/, /Create a new connector connection/], [], []);
        await assert.rejects(runConnectorTriggerF5Setup(await createContext(cancelled), projectPath, target, binding, dependencies),
            error => error instanceof UserCancelledError);
        assert.strictEqual(state.namespaceCreateCount, 1);
        assert.strictEqual(state.connectionCreateCount, 0);
        assert.strictEqual(state.triggerParameters, undefined);
        assert.strictEqual(written, 0);
        cancelled.assertConsumed();

        const retry = new ScriptedUi([/Create a new connector connection/], [], [/Open Sign-in Page/]);
        await runConnectorTriggerF5Setup(await createContext(retry), projectPath, target, binding, dependencies);
        assert.strictEqual(state.namespaceCreateCount, 1);
        assert.strictEqual(state.connectionCreateCount, 1);
        assert.strictEqual(written, 1);
        retry.assertConsumed();
    });

    test('reviews and writes the actual binding setting keys rather than resource-derived names', async () => {
        const customBinding: ConnectorTriggerLocalBinding = {
            connectionSettingName: 'CustomConnection',
            triggerConfigSettingName: 'CustomConfigReference',
        };
        const state = createGatewayState();
        let written: Readonly<Record<string, string>> | undefined;
        let approved = false;
        const dependencies = createDependencies(createGateway(state), {
            resolveOperation: async () => ({ inputs: [] }),
            resolveDynamicInput: async () => assert.fail('No dynamic choices are expected.'),
            serializeParameters: () => [],
        }, {
            review: async (_context, plan) => {
                assert.deepStrictEqual(plan.localSettings.map(setting => setting.name), [
                    'CustomConnection__pollingEndpoint', 'CustomConfigReference',
                ]);
                approved = true;
                return true;
            },
            markComplete: async () => undefined,
            write: async (_context, _path, values) => {
                assert.strictEqual(approved, true);
                written = values;
            },
        });
        const ui = new ScriptedUi(
            [/Create a new Connector Namespace/, /Create a new connector connection/],
            [],
            [/Open Sign-in Page/],
        );
        await runConnectorTriggerF5Setup(await createContext(ui), projectPath, target, customBinding, dependencies);
        assert.deepStrictEqual(written, {
            ['CustomConnection__pollingEndpoint']: 'https://example.logic.azure.com/api/connectorGateways/gateway-id',
            CustomConfigReference: state.triggerConfigName,
        });
        ui.assertConsumed();
    });
});

interface GatewayState {
    namespace?: ConnectorTriggerNamespace;
    connection?: ConnectorTriggerConnection;
    namespaceCreateCount: number;
    connectionCreateCount: number;
    triggerConfigName?: string;
    triggerParameters?: { name: string; value: ConnectorTriggerParameterValue }[];
}

function createGatewayState(): GatewayState {
    return {
        namespaceCreateCount: 0,
        connectionCreateCount: 0,
    };
}

function createGateway(
    state: GatewayState,
    callbacks: {
        onAccessPolicies?: (
            policies: Parameters<ConnectorTriggerGateway['ensureConnectionAccessPolicies']>[4],
        ) => void;
        onDynamicInvoke?: (request: ConnectorTriggerDynamicInvokeRequest) => unknown;
    } = {},
): ConnectorTriggerGateway {
    let connectionReads = 0;
    return {
        assertConnectorConnectionCreatable: async () => undefined,
        listNamespaces: async () => state.namespace ? [state.namespace] : [],
        ensureNamespace: async (_context, requestHandoff, plan) => {
            assert.strictEqual(requestHandoff.subscription.id, target.subscription.id);
            if (plan.kind === 'existing') {
                return plan.namespace;
            }
            if (!state.namespace) {
                state.namespaceCreateCount += 1;
                state.namespace = {
                    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/connectorGateways/gateway',
                    name: plan.namespaceName,
                    resourceGroupName: plan.resourceGroupName,
                    location: target.region,
                    identity: {
                        principalId: 'namespace-principal',
                        tenantId: 'tenant-id',
                    },
                };
            }
            return state.namespace;
        },
        listConnections: async () => state.connection ? [state.connection] : [],
        ensureConnection: async (_context, _handoff, _namespace, plan) => {
            if (plan.kind === 'existing') {
                return plan.connection;
            }
            if (!state.connection) {
                state.connectionCreateCount += 1;
                state.connection = {
                    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/connectorGateways/gateway/connections/connection',
                    name: plan.connectionName,
                    connectorId: target.connectorId,
                    status: 'Unauthenticated',
                    createdBy: {
                        objectId: 'developer-object',
                        tenantId: 'tenant-id',
                    },
                };
            }
            return state.connection;
        },
        getConnection: async () => {
            const connection = nonNullValue(state.connection);
            connectionReads += 1;
            if (connectionReads > 1) {
                connection.status = 'Connected';
            }
            return { ...connection };
        },
        getConsentLink: async () => 'https://login.example.test/consent?secret=value',
        dynamicInvoke: async (_context, _handoff, _namespace, _connection, request) =>
            callbacks.onDynamicInvoke?.(request) ?? assert.fail('Dynamic invoke was not expected.'),
        getPollingPrincipal: async () => ({ objectId: 'developer-object', tenantId: 'tenant-id' }),
        getTriggerConfig: async () => undefined,
        ensureConnectionAccessPolicies: async (_context, _handoff, _namespace, _connection, policies) => {
            callbacks.onAccessPolicies?.(policies);
        },
        createOrUpdateTriggerConfig: async (_context, request) => {
            assert.strictEqual(request.deliveryMode, 'Poll');
            assert.strictEqual(request.state, 'Enabled');
            assert.strictEqual(request.type, 'NotSpecified');
            state.triggerConfigName = request.triggerConfigName;
            state.triggerParameters = [...request.parameters];
            return {
                id: `/triggerConfigs/${request.triggerConfigName}`,
                name: request.triggerConfigName,
                state: 'Enabled',
                pollingEndpoints: {
                    receiveUri:
                        `https://example.logic.azure.com/api/connectorGateways/gateway-id/triggerConfigs/${request.triggerConfigName}/receive?secret=value`,
                    acknowledgeUri: 'https://example.logic.azure.com/acknowledge',
                    hasMessagesUri: 'https://example.logic.azure.com/hasMessages',
                    approximateQueueDepthUri: 'https://example.logic.azure.com/depth',
                },
            };
        },
    };
}

function createDependencies(
    gateway: ConnectorTriggerGateway,
    operationResolver: ConnectorTriggerOperationResolver,
    callbacks: {
        review?: (context: IActionContext, plan: ConnectorTriggerSetupPlan) => Promise<boolean>;
        markComplete(): Promise<void>;
        write(
            context: IActionContext,
            path: string,
            values: Readonly<Record<string, string>>,
        ): Promise<void>;
    },
): ConnectorTriggerF5Dependencies {
    return {
        bindingResolver: {
            find: async () => [binding],
            resolve: async () => binding,
        },
        gateway,
        projectStore: {
            read: async () => projectMetadata,
            markComplete: callbacks.markComplete,
        },
        localSettingsWriter: {
            write: callbacks.write,
        },
        operationResolver,
        openSetup: async (context, request) =>
            createScriptedSetupSession(context, request, gateway, operationResolver, callbacks.review),
        runtime: createRuntime(),
        workspaceIdentity: { get: async () => workspaceId },
        hostLaunch: { kind: 'exactEnvironment', environment: {} },
    };
}

function createScriptedSetupSession(
    context: IActionContext,
    request: ConnectorTriggerSetupRequest,
    gateway: ConnectorTriggerGateway,
    resolver: ConnectorTriggerOperationResolver,
    review: (context: IActionContext, plan: ConnectorTriggerSetupPlan) => Promise<boolean> = async () => true,
): ConnectorTriggerSetupSession {
    const form = new ConnectorTriggerSetupForm(context, request, gateway, {
        listSubscriptions: async () => [{ id: target.subscription.id, label: 'Selected provisioning subscription' }],
        getSubscription: async () => target.subscription,
        listRegions: async () => [{ id: target.region, label: 'Selected provisioning region' }],
        listConnectors: async () => [{ id: target.connectorId, label: 'Office 365 Outlook' }],
        listEvents: async (_context, _scope, connectorId) => {
            assert.strictEqual(connectorId, target.connectorId);
            return [{ id: target.operationId, label: 'When a new email arrives (V3)' }];
        },
        signIn: async () => assert.fail('This controlled test is already signed in.'),
    }, () => undefined);
    const cancellation = new vscode.CancellationTokenSource();
    return {
        cancellationToken: cancellation.token,
        selectResources: async () => {
            assert.ok(context.ui instanceof ScriptedUi);
            let revision = 0;
            await form.handleMessage({ command: 'initializeSetup' });
            assert.strictEqual(form.state.canApprove, false);
            assert.strictEqual(form.state.subscriptionId, '');
            assert.strictEqual(form.state.regionId, '');
            await form.handleMessage({ command: 'selectSubscription', revision: ++revision, id: form.state.subscriptionOptions[0].id });
            assert.strictEqual(form.state.canApprove, false);
            await form.handleMessage({ command: 'selectRegion', revision: ++revision, id: form.state.regionOptions[0].id });
            if (!request.metadata) {
                assert.strictEqual(form.state.canApprove, false);
                const connector = await context.ui.showQuickPick(form.state.connectorOptions.map(option => ({
                    label: option.label, data: option.id,
                })), {});
                assert.ok(!Array.isArray(connector));
                await form.handleMessage({ command: 'selectConnector', revision: ++revision, id: connector.data });
                assert.strictEqual(form.state.canApprove, false);
                const event = await context.ui.showQuickPick(form.state.eventOptions.map(option => ({
                    label: option.label, data: option.id,
                })), {});
                assert.ok(!Array.isArray(event));
                await form.handleMessage({ command: 'selectEvent', revision: ++revision, id: event.data });
            }
            assert.strictEqual(form.state.error, undefined);
            if (form.state.namespaceId === 'new') {
                const selected = await context.ui.showQuickPick(form.state.namespaceOptions.map(option => ({
                    label: option.label, data: option.id,
                })), {});
                assert.ok(!Array.isArray(selected));
                await form.handleMessage({ command: 'selectNamespace', revision: ++revision, id: selected.data });
            }
            if (form.state.connectionId === 'new') {
                const selected = await context.ui.showQuickPick(form.state.connectionOptions.map(option => ({
                    label: option.label, data: option.id,
                })), {});
                assert.ok(!Array.isArray(selected));
                await form.handleMessage({ command: 'selectConnection', revision: ++revision, id: selected.data });
            }
            assert.strictEqual(form.state.canApprove, true, JSON.stringify(form.state.errors));
            const plan = nonNullValue(await form.handleMessage({ command: 'approveSetup', revision: revision + 1 }));
            if (!await review(context, plan)) {
                throw new UserCancelledError('connectorF5Setup');
            }
            return plan;
        },
        collectParameters: async request => await collectScriptedParameters(context, request, resolver),
        setStatus: status => form.setStatus(status),
        dispose: () => {
            cancellation.cancel();
            cancellation.dispose();
            form.dispose();
        },
    };
}

function createOperationInputs(): ConnectorTriggerInputDefinition[] {
    return [
        {
            name: 'optionalNote',
            label: 'Optional note',
            type: 'string',
            required: false,
        },
        {
            name: 'folderPath',
            label: 'Folder',
            type: 'string',
            required: false,
            dynamic: {
                kind: 'tree',
                dependsOn: ['requiredValue'],
                metadata: { source: 'exported-swagger' },
            },
        },
        {
            name: 'importantValue',
            label: 'Important value',
            type: 'string',
            required: false,
            visibility: 'important',
        },
        {
            name: 'requiredValue',
            label: 'Required value',
            type: 'string',
            required: true,
        },
    ];
}

function createSwaggerResolver(
    swagger: unknown,
    onDynamicInvoke?: (request: ConnectorTriggerDynamicInvokeRequest) => unknown,
): SwaggerConnectorTriggerOperationResolver {
    return new SwaggerConnectorTriggerOperationResolver(
        createGateway(createGatewayState(), { onDynamicInvoke }),
        { getSwagger: async () => swagger },
    );
}

function createDynamicValuesSwagger(descriptor: Record<string, unknown>): unknown {
    return {
        paths: {
            '/event': {
                get: {
                    operationId: target.operationId,
                    parameters: [{
                        name: 'folderPath',
                        in: 'query',
                        required: true,
                        type: 'string',
                        'x-ms-summary': 'Folder',
                        'x-ms-dynamic-list': descriptor,
                    }],
                },
            },
            '/folders': {
                get: { operationId: 'ListFolders', parameters: [] },
            },
        },
    };
}

function createDependentValuesSwagger(): unknown {
    return {
        parameters: {
            Mailbox: { name: 'mailbox', in: 'query', type: 'string', required: false },
        },
        paths: {
            '/event': {
                get: {
                    operationId: target.operationId,
                    parameters: [
                        {
                            name: 'folderPath',
                            in: 'query',
                            required: true,
                            type: 'string',
                            'x-ms-dynamic-values': {
                                operationId: 'ListFolders',
                                parameters: { mailbox: { parameter: 'mailbox' } },
                                'value-path': 'id',
                                'value-title': 'name',
                            },
                        },
                        { $ref: '#/parameters/Mailbox' },
                        { name: 'includeAttachments', in: 'query', type: 'boolean', required: true, enum: [true, false] },
                        { name: 'maxBatch', in: 'query', type: 'integer', required: true },
                        { name: 'minimumScore', in: 'query', type: 'number', required: true, enum: [0.5, 1.5] },
                        { name: 'note', in: 'query', type: 'string' },
                    ],
                },
            },
            '/{connectionId}/mailboxes/{mailbox}/folders': {
                get: {
                    operationId: 'ListFolders',
                    parameters: [{ name: 'mailbox', in: 'path', type: 'string', required: true }],
                },
            },
        },
    };
}

function createOutlookSwagger(includeBrowse = false, includeBuiltInSuggestions = false): unknown {
    return {
        paths: {
            '/{connectionId}/v3/Mail/OnNewEmail': {
                get: {
                    operationId: 'OnNewEmailV3',
                    parameters: [
                        {
                            name: 'connectionId',
                            in: 'path',
                            required: true,
                            type: 'string',
                            ['x-ms-visibility']: 'internal',
                        },
                        {
                            name: 'folderPath',
                            in: 'query',
                            required: false,
                            type: 'string',
                            default: 'Inbox',
                            ['x-ms-summary']: 'Folder',
                            ['x-ms-dynamic-tree']: {
                                settings: {
                                    canSelectParentNodes: true,
                                    canSelectLeafNodes: false,
                                },
                                open: {
                                    operationId: 'OnFilePickerOpen',
                                    itemsPath: 'value',
                                    itemValuePath: 'Id',
                                    itemTitlePath: 'DisplayName',
                                    ...(includeBrowse ? { itemIsParent: '(IsFolder eq true)' } : {}),
                                    parameters: {
                                        operation: {
                                            value: 'MailFolders',
                                        },
                                    },
                                },
                                ...(includeBrowse ? {
                                    browse: {
                                        operationId: 'OnFilePickerBrowse',
                                        itemsPath: 'value',
                                        itemValuePath: 'Id',
                                        itemTitlePath: 'DisplayName',
                                        itemIsParent: '(IsFolder eq true)',
                                        parameters: {
                                            operation: { value: 'MailFolders' },
                                            id: { selectedItemValuePath: 'Id' },
                                        },
                                    },
                                } : {}),
                            },
                        },
                        ...(includeBuiltInSuggestions ? ['to', 'cc', 'toOrCc', 'from'].map(name => ({
                            name,
                            in: 'query',
                            required: false,
                            type: 'string',
                            'x-ms-dynamic-values': {
                                builtInOperation: 'AadGraph.GetUsers',
                                parameters: {},
                                'value-path': 'mail',
                            },
                        })) : []),
                    ],
                },
            },
            '/{connectionId}/OnFilePickerOpen': {
                get: {
                    operationId: 'OnFilePickerOpen',
                    parameters: [],
                },
            },
            ...(includeBrowse ? {
                '/{connectionId}/OnFilePickerBrowse': {
                    get: {
                        operationId: 'OnFilePickerBrowse',
                        parameters: [
                            { name: 'operation', in: 'query', type: 'string', required: true },
                            { name: 'id', in: 'query', type: 'string', required: true },
                        ],
                    },
                },
            } : {}),
        },
    };
}

function createNamespace(name: string): ConnectorTriggerNamespace {
    return {
        id: `/connectorGateways/${name}`,
        name,
        resourceGroupName: 'resource-group',
        location: target.region,
        identity: {
            principalId: 'namespace-principal',
            tenantId: target.subscription.tenantId,
        },
    };
}

function createConnection(name: string, status: string): ConnectorTriggerConnection {
    return {
        id: `/connections/${name}`,
        name,
        connectorId: target.connectorId,
        status,
        createdBy: {
            objectId: 'developer-object',
            tenantId: target.subscription.tenantId,
        },
    };
}

function createRuntime(): ConnectorTriggerF5Runtime {
    let now = 0;
    return {
        now: () => now,
        delay: async milliseconds => {
            now += milliseconds;
        },
        openExternal: async () => true,
        withProgress: async (_title, task) => {
            const source = new vscode.CancellationTokenSource();
            try {
                return await task(source.token);
            } finally {
                source.dispose();
            }
        },
    };
}

async function createContext(ui: ScriptedUi): Promise<IActionContext> {
    const context = await createTestActionContext() as IActionContext;
    context.ui = ui as unknown as IActionContext['ui'];
    return context;
}

type PickResponse = string | RegExp | (string | RegExp)[];

class ScriptedUi {
    private readonly promptEmitter = new vscode.EventEmitter<PromptResult>();
    public readonly onDidFinishPrompt = this.promptEmitter.event;
    public readonly isPrompting = false;
    public readonly isTesting = true;
    public readonly quickPickLabels: string[][] = [];
    public readonly warnings: { message: string; options: unknown; items: string[] }[] = [];

    public constructor(
        private readonly quickPickResponses: (PickResponse | Error)[],
        private readonly inputBoxResponses: string[],
        private readonly warningResponses: (string | RegExp | Error)[],
    ) { }

    public async showQuickPick<T>(
        picks: IAzureQuickPickItem<T>[],
        options: { canPickMany?: boolean },
    ): Promise<IAzureQuickPickItem<T> | IAzureQuickPickItem<T>[]> {
        this.quickPickLabels.push(picks.map(pick => pick.label));
        const response = nonNullValue(this.quickPickResponses.shift());
        if (response instanceof Error) {
            throw response;
        }
        if (options.canPickMany) {
            assert.ok(Array.isArray(response), 'Expected a multi-select response.');
            const selected = response.map(expected => findPick(picks, expected));
            this.promptEmitter.fire({ value: selected });
            return selected;
        }
        assert.ok(!Array.isArray(response), 'Expected a single-select response.');
        const selected = findPick(picks, response);
        this.promptEmitter.fire({ value: selected });
        return selected;
    }

    public async showInputBox(options: { validateInput?: (value: string) => string | undefined }): Promise<string> {
        const value = nonNullValue(this.inputBoxResponses.shift());
        assert.strictEqual(options.validateInput?.(value), undefined);
        this.promptEmitter.fire({ value });
        return value;
    }

    public async showWarningMessage<T extends vscode.MessageItem>(
        message: string,
        options: unknown,
        ...items: T[]
    ): Promise<T> {
        this.warnings.push({ message, options, items: items.map(item => item.title) });
        const response = nonNullValue(this.warningResponses.shift());
        if (response instanceof Error) {
            throw response;
        }
        const selected = findPick(items.map(item => ({ label: item.title, data: item })), response).data;
        this.promptEmitter.fire({ value: selected });
        return selected;
    }

    public async collectParameters(
        context: IActionContext,
        request: ConnectorTriggerParameterRequest,
        resolver: ConnectorTriggerOperationResolver,
    ): Promise<Record<string, ConnectorTriggerParameterValue>> {
        const form = new ConnectorTriggerParameterForm(context, request, resolver, () => undefined);
        let revision = 0;
        try {
            await form.handleMessage({ command: 'initialize' });
            const optionalFields = form.state.fields.filter(field => field.advanced);
            const optional = optionalFields.length ? await this.showQuickPick(optionalFields.map(field => ({
                label: field.label,
                data: field.name,
            })), { canPickMany: true }) : [];
            assert.ok(Array.isArray(optional));
            const optionalNames = new Set(optional.map(pick => pick.data));
            for (const initial of form.state.fields) {
                if (initial.advanced && !optionalNames.has(initial.name)) {
                    continue;
                }
                let field = nonNullValue(form.state.fields.find(field => field.name === initial.name));
                if (field.error) {
                    throw new Error(field.error);
                }
                if (field.kind === 'text') {
                    const text = await this.showInputBox({});
                    await form.handleMessage({ command: 'edit', revision: ++revision, name: field.name, text });
                } else {
                    while (true) {
                        field = nonNullValue(form.state.fields.find(field => field.name === initial.name));
                        if (field.error) {
                            throw new Error(field.error);
                        }
                        type Selection = { command: 'browse' | 'select'; id: string } | { command: 'back' | 'skip' };
                        const picks: IAzureQuickPickItem<Selection>[] = field.options.map(option => ({
                            label: option.label,
                            data: { command: option.hasChildren ? 'browse' : 'select', id: option.id },
                        }));
                        if (field.parent?.selectable) {
                            picks.unshift({ label: 'Select this folder', data: { command: 'select', id: field.parent.id } });
                        }
                        if (field.canGoBack) {
                            picks.push({ label: 'Back to previous folder', data: { command: 'back' } });
                        }
                        if (!field.required) {
                            picks.push({ label: 'Skip for now', data: { command: 'skip' } });
                        }
                        const selection = await this.showQuickPick(picks, {});
                        assert.ok(!Array.isArray(selection));
                        if (selection.data.command === 'skip') {
                            break;
                        }
                        const command = selection.data.command;
                        await form.handleMessage({
                            command,
                            revision: ++revision,
                            name: field.name,
                            ...(command === 'select' && 'id' in selection.data ? { optionIds: [selection.data.id] } : {}),
                            ...(command === 'browse' && 'id' in selection.data ? { optionId: selection.data.id } : {}),
                        });
                        if (command === 'select') {
                            break;
                        }
                    }
                }
                const updated = nonNullValue(form.state.fields.find(field => field.name === initial.name));
                assert.strictEqual(updated.error, undefined);
            }
            return nonNullValue(await form.handleMessage({ command: 'submit', revision: ++revision }));
        } finally {
            form.dispose();
        }
    }

    public assertConsumed(): void {
        assert.deepStrictEqual(this.quickPickResponses, []);
        assert.deepStrictEqual(this.inputBoxResponses, []);
        assert.deepStrictEqual(this.warningResponses, []);
    }
}

async function collectScriptedParameters(
    context: IActionContext,
    request: ConnectorTriggerParameterRequest,
    resolver: ConnectorTriggerOperationResolver,
): Promise<Record<string, ConnectorTriggerParameterValue>> {
    assert.ok(context.ui instanceof ScriptedUi);
    return await context.ui.collectParameters(context, request, resolver);
}

function findPick<T>(
    picks: readonly IAzureQuickPickItem<T>[],
    expected: string | RegExp,
): IAzureQuickPickItem<T> {
    const pick = picks.find(item =>
        typeof expected === 'string' ?
            item.label === expected :
            expected.test(item.label));
    return nonNullValue(pick);
}

function nonNullValue<T>(value: T | undefined): T {
    assert.notStrictEqual(value, undefined);
    return value as T;
}

function compareParameters(
    left: { name: string },
    right: { name: string },
): number {
    return left.name.localeCompare(right.name);
}
