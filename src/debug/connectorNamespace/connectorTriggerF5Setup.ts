/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import {
    AzureWizard,
    AzureWizardExecuteStep,
    AzureWizardPromptStep,
    UserCancelledError,
    type IActionContext,
    type IAzureQuickPickItem,
} from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { FileConnectorTriggerLocalSettingsWriter } from './ConnectorTriggerLocalSettingsWriter';
import {
    type ConnectorTriggerConnection,
    type ConnectorTriggerConnectionPlan,
    type ConnectorTriggerF5Dependencies,
    type ConnectorTriggerF5Runtime,
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerInputOption,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerNamespacePlan,
    type ConnectorTriggerOperationDefinition,
    type ConnectorTriggerParameterValue,
    type ConnectorTriggerProjectHandoff,
    type ConnectorTriggerConfig,
} from './connectorTriggerF5Contracts';

const connectionPollIntervalMs = 3000;
const connectionPollTimeoutMs = 3 * 60 * 1000;

interface ConnectorTriggerResourceNames {
    resourceGroupName: string;
    namespaceName: string;
    connectionName: string;
    triggerConfigName: string;
}

interface ConnectorTriggerF5WizardContext extends IActionContext {
    projectPath: string;
    handoff: ConnectorTriggerProjectHandoff;
    binding: ConnectorTriggerLocalBinding;
    names: ConnectorTriggerResourceNames;
    namespacePlan?: ConnectorTriggerNamespacePlan;
    namespace?: ConnectorTriggerNamespace;
    connectionPlan?: ConnectorTriggerConnectionPlan;
    connection?: ConnectorTriggerConnection;
    operation?: ConnectorTriggerOperationDefinition;
    effectiveInputs: ConnectorTriggerInputDefinition[];
    selectedOptionalInputs?: Set<string>;
    parameterValues: Record<string, ConnectorTriggerParameterValue>;
    triggerConfig?: ConnectorTriggerConfig;
    localSettingsWritten?: boolean;
    handoffCompleted?: boolean;
}

export class ConnectorTriggerF5SetupError extends Error {
    public readonly code = 'connectorTriggerF5SetupFailed';

    public constructor(cause?: unknown) {
        super(
            localize(
                'connectorTriggerF5SetupFailed',
                'Connector Trigger setup could not be completed. Check your Azure access and network connection, then retry debugging.',
            ),
            { cause },
        );
    }
}

export async function runConnectorTriggerF5Setup(
    context: IActionContext,
    projectPath: string,
    handoff: ConnectorTriggerProjectHandoff,
    binding: ConnectorTriggerLocalBinding,
    dependencies: ConnectorTriggerF5Dependencies,
): Promise<void> {
    const runtime = dependencies.runtime ?? createDefaultRuntime();
    const names = createConnectorTriggerResourceNames(projectPath, handoff, binding);
    const wizardContext: ConnectorTriggerF5WizardContext = {
        ...context,
        projectPath,
        handoff,
        binding,
        names,
        effectiveInputs: [],
        parameterValues: {},
    };
    maskSetupValues(wizardContext);

    await runWizard(
        wizardContext,
        [new ConnectorNamespacePromptStep(dependencies)],
        [new ConnectorNamespaceEnsureStep(dependencies)],
    );
    await runWizard(
        wizardContext,
        [new ConnectorConnectionPromptStep(dependencies)],
        [
            new ConnectorConnectionEnsureStep(dependencies),
            new ConnectorConnectionConsentStep(dependencies, runtime),
            new ConnectorConnectionAccessStep(dependencies),
        ],
    );
    await resolveOperation(wizardContext, dependencies, runtime);
    await runWizard(
        wizardContext,
        [
            new ConnectorOptionalInputsStep(),
            new ConnectorParameterPromptStep(dependencies),
        ],
        [],
    );
    await runWizard(
        wizardContext,
        [],
        [
            new ConnectorTriggerConfigStep(dependencies),
            new ConnectorTriggerLocalSettingsStep(dependencies),
            new ConnectorTriggerHandoffCompleteStep(dependencies),
        ],
    );

    context.telemetry.properties.connectorF5SetupResult = 'completed';
}

export function createConnectorTriggerResourceNames(
    projectPath: string,
    handoff: ConnectorTriggerProjectHandoff,
    binding: ConnectorTriggerLocalBinding,
): ConnectorTriggerResourceNames {
    const scopeHash = stableHash([
        handoff.subscription.id,
        handoff.region,
    ]);
    const projectHash = stableHash([
        projectPath,
        handoff.subscription.id,
        handoff.region,
        handoff.connectorId,
        handoff.operationId,
        binding.connectionSettingName,
        binding.triggerConfigSettingName,
    ]);
    const connectorName = normalizeResourceName(handoff.connectorId, 'connector', 36);
    const operationName = normalizeResourceName(handoff.operationId, 'trigger', 36);

    return {
        resourceGroupName: `func-connectors-${scopeHash}`,
        namespaceName: `func-connectors-${scopeHash}`,
        connectionName: `${connectorName}-${projectHash}`,
        triggerConfigName: `${operationName}-${projectHash}`,
    };
}

class ConnectorNamespacePromptStep extends AzureWizardPromptStep<ConnectorTriggerF5WizardContext> {
    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async prompt(context: ConnectorTriggerF5WizardContext): Promise<void> {
        const namespaces = (await this.dependencies.gateway.listNamespaces(context, context.handoff))
            .filter(namespace => locationsEqual(namespace.location, context.handoff.region));
        const reusable = namespaces.find(namespace =>
            equalsIgnoreCase(namespace.name, context.names.namespaceName) &&
            equalsIgnoreCase(namespace.resourceGroupName, context.names.resourceGroupName));
        if (reusable) {
            context.namespacePlan = { kind: 'existing', namespace: reusable };
            context.telemetry.properties.connectorF5NamespaceMode = 'reused';
            maskNamespace(context, reusable);
            return;
        }

        const picks: IAzureQuickPickItem<ConnectorTriggerNamespacePlan>[] = namespaces.map(namespace => ({
            label: namespace.name,
            description: namespace.resourceGroupName,
            data: { kind: 'existing', namespace },
        }));
        picks.push({
            label: localize('createNewConnectorNamespace', '$(add) Create a new Connector Namespace'),
            description: context.names.namespaceName,
            data: {
                kind: 'create',
                resourceGroupName: context.names.resourceGroupName,
                namespaceName: context.names.namespaceName,
            },
        });

        context.namespacePlan = (await context.ui.showQuickPick(picks, {
            placeHolder: localize(
                'selectConnectorNamespaceForDebug',
                'Select a Connector Namespace for this project.',
            ),
            stepName: 'connectorF5Namespace',
            suppressPersistence: true,
        })).data;
        context.telemetry.properties.connectorF5NamespaceMode = context.namespacePlan.kind;
        if (context.namespacePlan.kind === 'existing') {
            maskNamespace(context, context.namespacePlan.namespace);
        }
    }

    public shouldPrompt(context: ConnectorTriggerF5WizardContext): boolean {
        return !context.namespacePlan;
    }

    public undo(context: ConnectorTriggerF5WizardContext): void {
        context.namespacePlan = undefined;
    }
}

class ConnectorNamespaceEnsureStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 100;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        context.namespace = await this.dependencies.gateway.ensureNamespace(
            context,
            context.handoff,
            nonNullValue(context.namespacePlan),
        );
        maskNamespace(context, context.namespace);
    }

    public shouldExecute(): boolean {
        return true;
    }
}

class ConnectorConnectionPromptStep extends AzureWizardPromptStep<ConnectorTriggerF5WizardContext> {
    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async prompt(context: ConnectorTriggerF5WizardContext): Promise<void> {
        const namespace = nonNullValue(context.namespace);
        const connections = (await this.dependencies.gateway.listConnections(context, context.handoff, namespace))
            .filter(connection => equalsIgnoreCase(connection.connectorId, context.handoff.connectorId));
        const reusable = connections.find(connection => equalsIgnoreCase(connection.name, context.names.connectionName));
        if (reusable) {
            context.connectionPlan = { kind: 'existing', connection: reusable };
            context.telemetry.properties.connectorF5ConnectionMode = 'reused';
            maskConnection(context, reusable);
            return;
        }

        const picks: IAzureQuickPickItem<ConnectorTriggerConnectionPlan>[] = connections.map(connection => ({
            label: connection.name,
            description: connection.status ?
                localize('connectorConnectionStatus', 'Status: {0}', connection.status) :
                undefined,
            data: { kind: 'existing', connection },
        }));
        picks.push({
            label: localize('createNewConnectorConnection', '$(add) Create a new connector connection'),
            description: context.names.connectionName,
            data: {
                kind: 'create',
                connectionName: context.names.connectionName,
            },
        });

        context.connectionPlan = (await context.ui.showQuickPick(picks, {
            placeHolder: localize(
                'selectConnectorConnectionForDebug',
                'Select a connection to authenticate for this Connector Trigger.',
            ),
            stepName: 'connectorF5Connection',
            suppressPersistence: true,
        })).data;
        context.telemetry.properties.connectorF5ConnectionMode = context.connectionPlan.kind;
        if (context.connectionPlan.kind === 'existing') {
            maskConnection(context, context.connectionPlan.connection);
        }
    }

    public shouldPrompt(context: ConnectorTriggerF5WizardContext): boolean {
        return !context.connectionPlan;
    }

    public undo(context: ConnectorTriggerF5WizardContext): void {
        context.connectionPlan = undefined;
    }
}

class ConnectorConnectionEnsureStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 100;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        context.connection = await this.dependencies.gateway.ensureConnection(
            context,
            context.handoff,
            nonNullValue(context.namespace),
            nonNullValue(context.connectionPlan),
        );
        maskConnection(context, context.connection);
    }

    public shouldExecute(): boolean {
        return true;
    }
}

class ConnectorConnectionConsentStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 200;

    public constructor(
        private readonly dependencies: ConnectorTriggerF5Dependencies,
        private readonly runtime: ConnectorTriggerF5Runtime,
    ) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        const namespace = nonNullValue(context.namespace);
        let connection = nonNullValue(context.connection);
        connection = await this.dependencies.gateway.getConnection(
            context,
            context.handoff,
            namespace,
            connection,
        );
        if (isConnected(connection)) {
            context.telemetry.properties.connectorF5ConsentRequired = 'false';
            context.connection = connection;
            return;
        }

        context.telemetry.properties.connectorF5ConsentRequired = 'true';
        const consentLink = await this.dependencies.gateway.getConsentLink(
            context,
            context.handoff,
            namespace,
            connection,
        );
        maskValue(context, consentLink);
        if (!isHttpsUrl(consentLink)) {
            throw new Error(localize(
                'invalidConnectorConsentLink',
                'Azure returned an invalid connector sign-in link.',
            ));
        }

        const openSignIn: vscode.MessageItem = {
            title: localize('openConnectorConsent', 'Open Sign-in Page'),
        };
        const result = await context.ui.showWarningMessage(
            localize(
                'authorizeConnectorConnection',
                'Your browser will open so you can sign in and authorize the connector connection. Return to VS Code after consent is complete.',
            ),
            { modal: true, stepName: 'connectorF5Consent' },
            openSignIn,
        );
        if (result !== openSignIn) {
            throw new UserCancelledError('connectorF5Consent');
        }
        if (!await this.runtime.openExternal(consentLink)) {
            throw new Error(localize(
                'connectorConsentBrowserFailed',
                'The connector sign-in page could not be opened.',
            ));
        }

        context.connection = await waitForConnectedStatus(
            context,
            this.dependencies,
            this.runtime,
            namespace,
            connection,
        );
    }

    public shouldExecute(): boolean {
        return true;
    }
}

class ConnectorConnectionAccessStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 300;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        const namespace = nonNullValue(context.namespace);
        const connection = nonNullValue(context.connection);
        const namespaceObjectId = namespace.identity?.principalId;
        const namespaceTenantId = namespace.identity?.tenantId;
        const developerObjectId = connection.createdBy?.objectId;
        const developerTenantId = connection.createdBy?.tenantId;
        if (!namespaceObjectId || !namespaceTenantId || !developerObjectId || !developerTenantId) {
            throw new Error(localize(
                'missingConnectorAccessIdentities',
                'Azure did not return the identities required to authorize local Connector Trigger polling.',
            ));
        }

        await this.dependencies.gateway.ensureConnectionAccessPolicies(
            context,
            context.handoff,
            namespace,
            connection,
            [
                {
                    name: 'namespace-trigger-runtime',
                    principal: {
                        type: 'ActiveDirectory',
                        identity: {
                            objectId: namespaceObjectId,
                            tenantId: namespaceTenantId,
                        },
                    },
                },
                {
                    name: 'local-developer',
                    principal: {
                        type: 'ActiveDirectory',
                        identity: {
                            objectId: developerObjectId,
                            tenantId: developerTenantId,
                        },
                    },
                },
            ],
        );
    }

    public shouldExecute(): boolean {
        return true;
    }
}

class ConnectorOptionalInputsStep extends AzureWizardPromptStep<ConnectorTriggerF5WizardContext> {
    public async prompt(context: ConnectorTriggerF5WizardContext): Promise<void> {
        const optionalInputs = context.effectiveInputs.filter(input =>
            isVisibleInput(input) &&
            !shouldAlwaysPrompt(input) &&
            context.parameterValues[input.name] === undefined);
        if (optionalInputs.length === 0) {
            context.selectedOptionalInputs = new Set();
            return;
        }

        const picks: IAzureQuickPickItem<string>[] = optionalInputs.map(input => ({
            label: input.label,
            description: input.description,
            data: input.name,
        }));
        const selected = await context.ui.showQuickPick(picks, {
            canPickMany: true,
            placeHolder: localize(
                'selectOptionalConnectorParameters',
                'Select any optional Connector Trigger parameters to configure.',
            ),
            stepName: 'connectorF5OptionalParameters',
            suppressPersistence: true,
        });
        context.selectedOptionalInputs = new Set(selected.map(item => item.data));
    }

    public shouldPrompt(context: ConnectorTriggerF5WizardContext): boolean {
        return context.selectedOptionalInputs === undefined;
    }

    public undo(context: ConnectorTriggerF5WizardContext): void {
        context.selectedOptionalInputs = undefined;
    }
}

class ConnectorParameterPromptStep extends AzureWizardPromptStep<ConnectorTriggerF5WizardContext> {
    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async prompt(context: ConnectorTriggerF5WizardContext): Promise<void> {
        const queue = orderInputs(context.effectiveInputs);
        const knownInputs = new Set(context.effectiveInputs.map(input => input.name));
        const resolvedSchemas = new Set<string>();

        while (queue.length > 0) {
            const input = nonNullValue(queue.shift());
            if (!isVisibleInput(input) || context.parameterValues[input.name] !== undefined) {
                continue;
            }

            let options = input.options;
            if (input.dynamic) {
                const resolution = await this.dependencies.operationResolver.resolveDynamicInput(context, {
                    handoff: context.handoff,
                    namespace: nonNullValue(context.namespace),
                    connection: nonNullValue(context.connection),
                    operation: nonNullValue(context.operation),
                    input,
                    values: context.parameterValues,
                });
                options = resolution.options ?? options;

                if (input.dynamic.kind === 'schema' &&
                    !resolvedSchemas.has(input.name) &&
                    resolution.inputs?.length) {
                    resolvedSchemas.add(input.name);
                    const newInputs = resolution.inputs.filter(newInput => {
                        if (knownInputs.has(newInput.name)) {
                            return false;
                        }
                        knownInputs.add(newInput.name);
                        context.effectiveInputs.push(newInput);
                        return true;
                    });
                    queue.unshift(...orderInputs(newInputs));
                    continue;
                }
            }

            if (!shouldPromptInput(context, input)) {
                continue;
            }

            const value = await promptForInput(context, input, options);
            if (value !== undefined) {
                context.parameterValues[input.name] = value;
                maskParameterValue(context, value);
            }
        }
    }

    public shouldPrompt(context: ConnectorTriggerF5WizardContext): boolean {
        return context.effectiveInputs.some(input =>
            isVisibleInput(input) &&
            context.parameterValues[input.name] === undefined &&
            shouldPromptInput(context, input));
    }

    public undo(context: ConnectorTriggerF5WizardContext): void {
        context.parameterValues = {};
        context.effectiveInputs = [...nonNullValue(context.operation).inputs];
    }
}

class ConnectorTriggerConfigStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 100;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        const operation = nonNullValue(context.operation);
        const parameters = this.dependencies.operationResolver.serializeParameters(
            operation,
            context.effectiveInputs,
            context.parameterValues,
        );
        context.triggerConfig = await this.dependencies.gateway.createOrUpdateTriggerConfig(context, {
            handoff: context.handoff,
            namespace: nonNullValue(context.namespace),
            connection: nonNullValue(context.connection),
            triggerConfigName: context.names.triggerConfigName,
            deliveryMode: 'Poll',
            state: 'Enabled',
            type: 'NotSpecified',
            parameters,
        });
        maskValue(context, context.triggerConfig.id);
        maskValue(context, context.triggerConfig.name);
        maskValue(context, context.triggerConfig.pollingEndpoints.receiveUri);
        maskValue(context, context.triggerConfig.pollingEndpoints.acknowledgeUri ?? '');
        maskValue(context, context.triggerConfig.pollingEndpoints.hasMessagesUri ?? '');
        maskValue(context, context.triggerConfig.pollingEndpoints.approximateQueueDepthUri ?? '');
    }

    public shouldExecute(context: ConnectorTriggerF5WizardContext): boolean {
        return !context.triggerConfig;
    }
}

class ConnectorTriggerLocalSettingsStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 200;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        const triggerConfig = nonNullValue(context.triggerConfig);
        const pollingEndpoint = deriveConnectorPollingEndpoint(triggerConfig.pollingEndpoints.receiveUri);
        if (!equalsIgnoreCase(triggerConfig.state, 'Enabled')) {
            throw new Error(localize(
                'invalidConnectorSetupReferences',
                'Azure did not return the Connector Trigger references required for local debugging.',
            ));
        }

        const writer = this.dependencies.localSettingsWriter ?? new FileConnectorTriggerLocalSettingsWriter();
        await writer.write(context, context.projectPath, {
            [`${context.binding.connectionSettingName}__pollingEndpoint`]: pollingEndpoint,
            [context.binding.triggerConfigSettingName]: triggerConfig.name,
        });
        context.localSettingsWritten = true;
    }

    public shouldExecute(context: ConnectorTriggerF5WizardContext): boolean {
        return !context.localSettingsWritten;
    }
}

class ConnectorTriggerHandoffCompleteStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 300;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        await this.dependencies.handoffStore.markComplete(context.projectPath);
        context.handoffCompleted = true;
    }

    public shouldExecute(context: ConnectorTriggerF5WizardContext): boolean {
        return context.localSettingsWritten === true && !context.handoffCompleted;
    }
}

async function runWizard(
    context: ConnectorTriggerF5WizardContext,
    promptSteps: AzureWizardPromptStep<ConnectorTriggerF5WizardContext>[],
    executeSteps: AzureWizardExecuteStep<ConnectorTriggerF5WizardContext>[],
): Promise<void> {
    const wizard = new AzureWizard(context, {
        title: localize('configureConnectorTriggerForDebug', 'Configure Connector Trigger'),
        promptSteps,
        executeSteps,
        showLoadingPrompt: true,
    });
    if (promptSteps.length > 0) {
        await wizard.prompt();
    }
    if (executeSteps.length > 0) {
        await wizard.execute();
    }
}

async function resolveOperation(
    context: ConnectorTriggerF5WizardContext,
    dependencies: ConnectorTriggerF5Dependencies,
    runtime: ConnectorTriggerF5Runtime,
): Promise<void> {
    const operation = await runtime.withProgress(
        localize('loadingConnectorParameters', 'Loading Connector Trigger parameters...'),
        async token => {
            throwIfCancelled(token);
            const resolvedOperation = await dependencies.operationResolver.resolveOperation(context, {
                handoff: context.handoff,
                namespace: nonNullValue(context.namespace),
                connection: nonNullValue(context.connection),
            });
            throwIfCancelled(token);
            return resolvedOperation;
        },
    );
    context.operation = operation;
    context.effectiveInputs = operation.inputs.filter(isVisibleInput);
    context.telemetry.properties.connectorF5DynamicInputs = String(
        context.effectiveInputs.some(input => !!input.dynamic),
    );
}

async function waitForConnectedStatus(
    context: ConnectorTriggerF5WizardContext,
    dependencies: ConnectorTriggerF5Dependencies,
    runtime: ConnectorTriggerF5Runtime,
    namespace: ConnectorTriggerNamespace,
    connection: ConnectorTriggerConnection,
): Promise<ConnectorTriggerConnection> {
    return await runtime.withProgress(
        localize('waitingForConnectorConsent', 'Waiting for connector sign-in...'),
        async token => {
            const deadline = runtime.now() + connectionPollTimeoutMs;
            let lastError: unknown;
            while (runtime.now() < deadline) {
                throwIfCancelled(token);
                try {
                    const refreshed = await dependencies.gateway.getConnection(
                        context,
                        context.handoff,
                        namespace,
                        connection,
                    );
                    if (isConnected(refreshed)) {
                        maskConnection(context, refreshed);
                        return refreshed;
                    }
                } catch (error) {
                    lastError = error;
                }

                await runtime.delay(connectionPollIntervalMs);
            }

            throw new Error(
                localize(
                    'connectorConsentTimedOut',
                    'Connector sign-in did not finish before the setup timeout. Complete sign-in and retry debugging.',
                ),
                { cause: lastError },
            );
        },
    );
}

async function promptForInput(
    context: ConnectorTriggerF5WizardContext,
    input: ConnectorTriggerInputDefinition,
    options: readonly ConnectorTriggerInputOption[] | undefined,
): Promise<ConnectorTriggerParameterValue | undefined> {
    if (options?.length) {
        const picks: IAzureQuickPickItem<ConnectorTriggerParameterValue | undefined>[] = options.map(option => ({
            label: option.label,
            data: option.value,
        }));
        if (!input.required) {
            picks.push({
                label: localize('skipOptionalConnectorParameter', '$(clock) Skip for now'),
                data: undefined,
                suppressPersistence: true,
            });
        }

        if (input.allowMultiple) {
            const selected = await context.ui.showQuickPick(
                picks.filter((pick): pick is IAzureQuickPickItem<ConnectorTriggerParameterValue> => pick.data !== undefined),
                {
                    canPickMany: true,
                    placeHolder: input.description ?? input.label,
                    stepName: 'connectorF5Parameter',
                    suppressPersistence: true,
                },
            );
            if (selected.length === 0) {
                return undefined;
            }
            return selected.map(item => item.data);
        }

        return (await context.ui.showQuickPick(picks, {
            placeHolder: input.description ?? input.label,
            stepName: 'connectorF5Parameter',
            suppressPersistence: true,
        })).data;
    }

    if (input.type === 'boolean') {
        const picks: IAzureQuickPickItem<boolean | undefined>[] = [
            { label: localize('booleanTrue', 'True'), data: true },
            { label: localize('booleanFalse', 'False'), data: false },
        ];
        if (!input.required) {
            picks.push({
                label: localize('skipOptionalConnectorParameter', '$(clock) Skip for now'),
                data: undefined,
                suppressPersistence: true,
            });
        }
        return (await context.ui.showQuickPick(picks, {
            placeHolder: input.description ?? input.label,
            stepName: 'connectorF5Parameter',
            suppressPersistence: true,
        })).data;
    }

    const value = await context.ui.showInputBox({
        password: input.sensitive,
        prompt: input.description ?? localize(
            'enterConnectorParameter',
            'Enter a value for "{0}".',
            input.label,
        ),
        stepName: 'connectorF5Parameter',
        value: formatDefaultValue(input.defaultValue),
        validateInput: candidate => validateInput(candidate, input),
    });
    if (!value && !input.required) {
        return undefined;
    }
    return parseInputValue(value, input.type);
}

function validateInput(value: string, input: ConnectorTriggerInputDefinition): string | undefined {
    if (input.required && !value.trim()) {
        return localize('connectorParameterRequired', 'A value is required.');
    }
    if (!value.trim()) {
        return undefined;
    }
    if (input.type === 'integer' && !Number.isInteger(Number(value))) {
        return localize('connectorParameterInteger', 'Enter a whole number.');
    }
    if (input.type === 'number' && !Number.isFinite(Number(value))) {
        return localize('connectorParameterNumber', 'Enter a number.');
    }
    if (input.type === 'array' || input.type === 'object') {
        try {
            const parsed = JSON.parse(value) as unknown;
            const isExpectedShape = input.type === 'array' ?
                Array.isArray(parsed) :
                typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
            if (!isExpectedShape) {
                return localize('connectorParameterJsonShape', 'Enter a valid JSON {0}.', input.type);
            }
        } catch {
            return localize('connectorParameterJson', 'Enter valid JSON.');
        }
    }
    return undefined;
}

function parseInputValue(value: string, type: ConnectorTriggerInputDefinition['type']): ConnectorTriggerParameterValue {
    switch (type) {
        case 'array':
        case 'object':
            return JSON.parse(value) as ConnectorTriggerParameterValue;
        case 'integer':
            return Number.parseInt(value, 10);
        case 'number':
            return Number(value);
        default:
            return value;
    }
}

function formatDefaultValue(value: ConnectorTriggerParameterValue | undefined): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function shouldPromptInput(
    context: ConnectorTriggerF5WizardContext,
    input: ConnectorTriggerInputDefinition,
): boolean {
    return shouldAlwaysPrompt(input) || context.selectedOptionalInputs?.has(input.name) === true;
}

function shouldAlwaysPrompt(input: ConnectorTriggerInputDefinition): boolean {
    return input.required || input.visibility === 'important' || !!input.dynamic;
}

function isVisibleInput(input: ConnectorTriggerInputDefinition): boolean {
    return input.visibility !== 'hidden';
}

function orderInputs(inputs: readonly ConnectorTriggerInputDefinition[]): ConnectorTriggerInputDefinition[] {
    const pending = [...inputs]
        .map((input, index) => ({ input, index }))
        .sort((left, right) => inputPriority(left.input) - inputPriority(right.input) || left.index - right.index);
    const pendingNames = new Set(pending.map(item => item.input.name));
    const emitted = new Set<string>();
    const result: ConnectorTriggerInputDefinition[] = [];

    while (pending.length > 0) {
        const readyIndex = pending.findIndex(({ input }) =>
            (input.dynamic?.dependsOn ?? []).every(dependency =>
                emitted.has(dependency) || !pendingNames.has(dependency)));
        const index = readyIndex >= 0 ? readyIndex : 0;
        const [{ input }] = pending.splice(index, 1);
        pendingNames.delete(input.name);
        emitted.add(input.name);
        result.push(input);
    }

    return result;
}

function inputPriority(input: ConnectorTriggerInputDefinition): number {
    if (input.required) {
        return 0;
    }
    if (input.visibility === 'important') {
        return 1;
    }
    if (input.dynamic) {
        return 2;
    }
    return 3;
}

function createDefaultRuntime(): ConnectorTriggerF5Runtime {
    return {
        now: () => Date.now(),
        delay: async milliseconds => await new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
        openExternal: async url => await vscode.env.openExternal(vscode.Uri.parse(url)),
        withProgress: async (title, task) => await vscode.window.withProgress(
            {
                cancellable: true,
                location: vscode.ProgressLocation.Notification,
                title,
            },
            async (_progress, token) => await task(token),
        ),
    };
}

function throwIfCancelled(token: vscode.CancellationToken): void {
    if (token.isCancellationRequested) {
        throw new UserCancelledError('connectorF5Setup');
    }
}

function maskSetupValues(context: ConnectorTriggerF5WizardContext): void {
    for (const value of [
        context.projectPath,
        context.handoff.subscription.id,
        context.handoff.subscription.tenantId,
        context.handoff.subscription.environment.name,
        context.handoff.subscription.environment.resourceManagerEndpointUrl,
        context.handoff.region,
        context.handoff.connectorId,
        context.handoff.operationId,
        context.binding.connectionSettingName,
        context.binding.triggerConfigSettingName,
        context.names.resourceGroupName,
        context.names.namespaceName,
        context.names.connectionName,
        context.names.triggerConfigName,
    ]) {
        maskValue(context, value);
    }
}

function maskNamespace(context: IActionContext, namespace: ConnectorTriggerNamespace): void {
    maskValue(context, namespace.id);
    maskValue(context, namespace.name);
    maskValue(context, namespace.resourceGroupName);
    maskValue(context, namespace.location);
    maskValue(context, namespace.identity?.principalId ?? '');
    maskValue(context, namespace.identity?.tenantId ?? '');
}

function maskConnection(context: IActionContext, connection: ConnectorTriggerConnection): void {
    maskValue(context, connection.id);
    maskValue(context, connection.name);
    maskValue(context, connection.connectorId);
    maskValue(context, connection.createdBy?.objectId ?? '');
    maskValue(context, connection.createdBy?.tenantId ?? '');
}

function maskParameterValue(context: IActionContext, value: ConnectorTriggerParameterValue): void {
    if (typeof value === 'string') {
        maskValue(context, value);
        return;
    }
    if (typeof value === 'object' && value !== null) {
        maskValue(context, JSON.stringify(value));
    }
}

function maskValue(context: IActionContext, value: string): void {
    if (value && !context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}

function isConnected(connection: ConnectorTriggerConnection): boolean {
    return equalsIgnoreCase(connection.status, 'Connected');
}

function locationsEqual(left: string, right: string): boolean {
    return normalizeLocation(left) === normalizeLocation(right);
}

function normalizeLocation(value: string): string {
    return value.replace(/\s+/g, '').toLowerCase();
}

function isHttpsUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !!url.hostname;
    } catch {
        return false;
    }
}

function equalsIgnoreCase(left: string | undefined, right: string): boolean {
    return typeof left === 'string' && left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function normalizeResourceName(value: string, fallback: string, maxLength: number): string {
    const normalized = value
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maxLength)
        .replace(/-+$/g, '');
    return normalized || fallback;
}

function stableHash(values: readonly string[]): string {
    return createHash('sha256')
        .update(values.join('\0'))
        .digest('hex')
        .slice(0, 10);
}

function nonNullValue<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) {
        throw new Error(localize(
            'missingConnectorSetupState',
            'Connector Trigger setup is missing required state.',
        ));
    }
    return value;
}

export function deriveConnectorPollingEndpoint(receiveUri: string): string {
    try {
        const url = new URL(receiveUri);
        const match = url.pathname.match(
            /^(?<base>\/api(?:\/connectorGateways\/[^/]+)?)\/triggerConfigs\/[^/]+\/receive\/?$/i,
        );
        if (url.protocol !== 'https:' || !url.hostname || !match?.groups?.base) {
            throw new Error();
        }

        url.pathname = equalsIgnoreCase(match.groups.base, '/api') ? '/' : match.groups.base;
        url.search = '';
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch {
        throw new Error(localize(
            'invalidConnectorPollingEndpoint',
            'Azure returned an unsupported Connector Trigger polling endpoint.',
        ));
    }
}

export function isValidConnectorPollingEndpoint(value: string | undefined): boolean {
    if (!value || value.includes('<') || value.includes('>')) {
        return false;
    }
    try {
        const url = new URL(value);
        return url.protocol === 'https:' &&
            !!url.hostname &&
            !url.search &&
            !url.hash &&
            (
                url.pathname === '/' ||
                /^\/api\/connectorGateways\/[^/]+\/?$/i.test(url.pathname)
            );
    } catch {
        return false;
    }
}
