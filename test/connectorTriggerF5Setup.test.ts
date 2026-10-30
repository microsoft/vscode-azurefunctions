/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    AzExtFsExtra,
    UserCancelledError,
    createTestActionContext,
    type IActionContext,
    type IAzureQuickPickItem,
    type PromptResult,
} from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
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
    type ConnectorTriggerProjectHandoff,
} from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import {
    createConnectorTriggerResourceNames,
    deriveConnectorPollingEndpoint,
    isValidConnectorPollingEndpoint,
    runConnectorTriggerF5Setup,
} from '../src/debug/connectorNamespace/connectorTriggerF5Setup';
import { SwaggerConnectorTriggerOperationResolver } from '../src/debug/connectorNamespace/SwaggerConnectorTriggerOperationResolver';
import { validateConnectorNamespacePreDebug } from '../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';

const projectPath = 'C:\\test\\connector-project';
const binding: ConnectorTriggerLocalBinding = {
    connectionSettingName: 'ConnectorNamespace',
    triggerConfigSettingName: 'OnNewEmailTriggerConfigName',
};
const handoff: ConnectorTriggerProjectHandoff = {
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
    catalog: {
        source: 'live',
    },
};

suite('Connector Trigger F5 setup', () => {
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
                assert.deepStrictEqual(policies.map(policy => policy.name), [
                    'namespace-trigger-runtime',
                    'local-developer',
                ]);
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
            markComplete: async () => {
                completed += 1;
            },
            write: async (_context, _path, values) => {
                writtenSettings.push({ ...values });
            },
        });

        await runConnectorTriggerF5Setup(context, projectPath, handoff, binding, dependencies);

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
            runConnectorTriggerF5Setup(firstContext, projectPath, handoff, binding, dependencies),
            error => error instanceof UserCancelledError,
        );
        assert.strictEqual(state.namespaceCreateCount, 1);
        assert.strictEqual(state.connectionCreateCount, 1);
        assert.strictEqual(settingsWrites, 0);
        assert.strictEqual(completed, 0);

        const secondUi = new ScriptedUi([], [], []);
        const secondContext = await createContext(secondUi);
        await runConnectorTriggerF5Setup(secondContext, projectPath, handoff, binding, dependencies);

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

    test('generates stable resource names without exposing handoff identifiers', () => {
        const first = createConnectorTriggerResourceNames(projectPath, handoff, binding);
        const second = createConnectorTriggerResourceNames(projectPath, handoff, binding);

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
            handoff,
            namespace,
            connection,
        });
        const folderInput = nonNullValue(operation.inputs.find(input => input.name === 'folderPath'));

        assert.strictEqual(folderInput.dynamic?.kind, 'tree');
        const resolution = await resolver.resolveDynamicInput(context, {
            handoff,
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

    test('treats a valid persisted handoff as authoritative without source scanning', async () => {
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
                resolve: async () => binding,
            },
            gateway: {
                listNamespaces: fail,
                ensureNamespace: fail,
                listConnections: fail,
                ensureConnection: fail,
                getConnection: fail,
                getConsentLink: fail,
                dynamicInvoke: fail,
                ensureConnectionAccessPolicies: fail,
                createOrUpdateTriggerConfig: fail,
            },
            handoffStore: {
                read: async () => handoff,
                markComplete: async () => {
                    completed += 1;
                },
            },
            operationResolver: {
                resolveOperation: fail,
                resolveDynamicInput: fail,
                serializeParameters: () => assert.fail('Parameters must not be serialized.'),
            },
        };

        try {
            const context = await createContext(new ScriptedUi([], [], []));
            await validateConnectorNamespacePreDebug(context, tempProject, dependencies);

            assert.strictEqual(completed, 1);
            assert.strictEqual(context.telemetry.properties.connectorPollTriggerDetected, 'true');
            assert.strictEqual(context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');
        } finally {
            await AzExtFsExtra.deleteResource(tempProject, { recursive: true });
        }
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
        listNamespaces: async () => state.namespace ? [state.namespace] : [],
        ensureNamespace: async (_context, requestHandoff, plan) => {
            assert.strictEqual(requestHandoff.subscription.id, handoff.subscription.id);
            if (plan.kind === 'existing') {
                return plan.namespace;
            }
            if (!state.namespace) {
                state.namespaceCreateCount += 1;
                state.namespace = {
                    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/connectorGateways/gateway',
                    name: plan.namespaceName,
                    resourceGroupName: plan.resourceGroupName,
                    location: handoff.region,
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
                    connectorId: handoff.connectorId,
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
            resolve: async () => binding,
        },
        gateway,
        handoffStore: {
            read: async () => handoff,
            markComplete: callbacks.markComplete,
        },
        localSettingsWriter: {
            write: callbacks.write,
        },
        operationResolver,
        runtime: createRuntime(),
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

function createOutlookSwagger(): unknown {
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
                                    parameters: {
                                        operation: {
                                            value: 'MailFolders',
                                        },
                                    },
                                },
                            },
                        },
                    ],
                },
            },
            '/{connectionId}/OnFilePickerOpen': {
                get: {
                    operationId: 'OnFilePickerOpen',
                    parameters: [],
                },
            },
        },
    };
}

function createNamespace(name: string): ConnectorTriggerNamespace {
    return {
        id: `/connectorGateways/${name}`,
        name,
        resourceGroupName: 'resource-group',
        location: handoff.region,
        identity: {
            principalId: 'namespace-principal',
            tenantId: handoff.subscription.tenantId,
        },
    };
}

function createConnection(name: string, status: string): ConnectorTriggerConnection {
    return {
        id: `/connections/${name}`,
        name,
        connectorId: handoff.connectorId,
        status,
        createdBy: {
            objectId: 'developer-object',
            tenantId: handoff.subscription.tenantId,
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

    public constructor(
        private readonly quickPickResponses: PickResponse[],
        private readonly inputBoxResponses: string[],
        private readonly warningResponses: (string | RegExp)[],
    ) { }

    public async showQuickPick<T>(
        picks: IAzureQuickPickItem<T>[],
        options: { canPickMany?: boolean },
    ): Promise<IAzureQuickPickItem<T> | IAzureQuickPickItem<T>[]> {
        const response = nonNullValue(this.quickPickResponses.shift());
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

    public async showInputBox(): Promise<string> {
        const value = nonNullValue(this.inputBoxResponses.shift());
        this.promptEmitter.fire({ value });
        return value;
    }

    public async showWarningMessage<T extends vscode.MessageItem>(
        _message: string,
        _options: unknown,
        ...items: T[]
    ): Promise<T> {
        const response = nonNullValue(this.warningResponses.shift());
        const selected = findPick(items.map(item => ({ label: item.title, data: item })), response).data;
        this.promptEmitter.fire({ value: selected });
        return selected;
    }

    public assertConsumed(): void {
        assert.deepStrictEqual(this.quickPickResponses, []);
        assert.deepStrictEqual(this.inputBoxResponses, []);
        assert.deepStrictEqual(this.warningResponses, []);
    }
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
