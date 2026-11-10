/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import * as path from 'path';
import {
    AzureWizard,
    AzureWizardExecuteStep,
    AzureWizardPromptStep,
    UserCancelledError,
    type IActionContext,
} from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localSettingsFileName } from '../../constants';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { FileConnectorTriggerLocalSettingsWriter } from './ConnectorTriggerLocalSettingsWriter';
import { orderConnectorInputs } from './ConnectorTriggerParameterForm';
import {
    ConnectorTriggerF5SetupError,
    type ConnectorTriggerConnection,
    type ConnectorTriggerConnectionPlan,
    type ConnectorTriggerF5Dependencies,
    type ConnectorTriggerF5Runtime,
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerNamespacePlan,
    type ConnectorTriggerOperationDefinition,
    type ConnectorTriggerParameterValue,
    type ConnectorTriggerSetupTarget,
    type ConnectorTriggerProjectMetadata,
    type ConnectorTriggerConfig,
    type ConnectorTriggerResourceNames,
    type ConnectorTriggerSetupRequest,
    type ConnectorTriggerSetupSession,
} from './connectorTriggerF5Contracts';

export { ConnectorTriggerF5SetupError } from './connectorTriggerF5Contracts';

const connectionPollIntervalMs = 3000;
const connectionPollTimeoutMs = 3 * 60 * 1000;

interface ConnectorTriggerF5WizardContext extends IActionContext {
    projectPath: string;
    metadata?: ConnectorTriggerProjectMetadata;
    target?: ConnectorTriggerSetupTarget;
    binding: ConnectorTriggerLocalBinding;
    names?: ConnectorTriggerResourceNames;
    namespacePlan?: ConnectorTriggerNamespacePlan;
    namespace?: ConnectorTriggerNamespace;
    connectionPlan?: ConnectorTriggerConnectionPlan;
    connection?: ConnectorTriggerConnection;
    setupApproved?: boolean;
    setupSession?: ConnectorTriggerSetupSession;
    operation?: ConnectorTriggerOperationDefinition;
    effectiveInputs: ConnectorTriggerInputDefinition[];
    parametersCollected?: boolean;
    parameterValues: Record<string, ConnectorTriggerParameterValue>;
    triggerConfig?: ConnectorTriggerConfig;
    localSettingsWritten?: boolean;
    metadataCompleted?: boolean;
}

export async function runConnectorTriggerF5Setup(
    context: IActionContext,
    projectPath: string,
    metadata: ConnectorTriggerProjectMetadata | undefined,
    binding: ConnectorTriggerLocalBinding,
    dependencies: ConnectorTriggerF5Dependencies,
): Promise<void> {
    const runtime = dependencies.runtime ?? createDefaultRuntime();
    const wizardContext: ConnectorTriggerF5WizardContext = {
        ...context,
        projectPath,
        metadata,
        binding,
        effectiveInputs: [],
        parameterValues: {},
    };
    maskSetupValues(wizardContext);

    const setup = await dependencies.openSetup(wizardContext, await createSetupRequest(wizardContext));
    wizardContext.setupSession = setup;
    try {
        await runWizard(wizardContext, [new ConnectorResourcesPromptStep()], [], false);
        setup.setStatus('provisioning');
        await runWizard(wizardContext, [], [new ConnectorNamespaceEnsureStep(dependencies)]);
        await runWizard(wizardContext, [], [
            new ConnectorConnectionEnsureStep(dependencies),
            new ConnectorConnectionConsentStep(dependencies, runtime),
            new ConnectorConnectionAccessStep(dependencies),
        ]);
        setup.setStatus('loadingParameters');
        await resolveOperation(wizardContext, dependencies, runtime);
        await runWizard(wizardContext, [new ConnectorParameterPromptStep()], [], false);
        setup.setStatus('saving');
        await runWizard(wizardContext, [], [
            new ConnectorTriggerConfigStep(dependencies),
            new ConnectorTriggerLocalSettingsStep(dependencies),
            new ConnectorTriggerMetadataCompleteStep(dependencies),
        ]);
        context.telemetry.properties.connectorF5SetupResult = 'completed';
    } finally {
        setup.dispose();
    }
}

export function createConnectorTriggerResourceNames(
    projectPath: string,
    target: ConnectorTriggerSetupTarget,
    binding: ConnectorTriggerLocalBinding,
): ConnectorTriggerResourceNames {
    const scopeHash = stableHash([
        target.subscription.id,
        target.region,
    ]);
    const projectHash = stableHash([
        projectPath,
        target.subscription.id,
        target.region,
        target.connectorId,
        target.operationId,
        binding.connectionSettingName,
        binding.triggerConfigSettingName,
    ]);
    const connectorName = normalizeResourceName(target.connectorId, 'connector', 36);
    const operationName = normalizeResourceName(target.operationId, 'trigger', 36);

    return {
        resourceGroupName: `func-connectors-${scopeHash}`,
        namespaceName: `func-connectors-${scopeHash}`,
        connectionName: `${connectorName}-${projectHash}`,
        triggerConfigName: `${operationName}-${projectHash}`,
    };
}

class ConnectorResourcesPromptStep extends AzureWizardPromptStep<ConnectorTriggerF5WizardContext> {
    public async prompt(context: ConnectorTriggerF5WizardContext): Promise<void> {
        const plan = await nonNullValue(context.setupSession).selectResources();
        context.target = plan.target;
        context.names = {
            resourceGroupName: plan.namespace.kind === 'existing' ? plan.namespace.namespace.resourceGroupName : plan.namespace.resourceGroupName,
            namespaceName: plan.namespace.kind === 'existing' ? plan.namespace.namespace.name : plan.namespace.namespaceName,
            connectionName: plan.connection.kind === 'existing' ? plan.connection.connection.name : plan.connection.connectionName,
            triggerConfigName: plan.triggerConfigName,
        };
        maskSetupValues(context);
        context.namespacePlan = plan.namespace;
        context.connectionPlan = plan.connection;
        context.telemetry.properties.connectorF5NamespaceMode = plan.namespace.kind;
        context.telemetry.properties.connectorF5ConnectionMode = plan.connection.kind;
        if (context.namespacePlan.kind === 'existing') {
            maskNamespace(context, context.namespacePlan.namespace);
        }
        if (context.connectionPlan.kind === 'existing') {
            maskConnection(context, context.connectionPlan.connection);
        } else {
            maskValue(context, context.connectionPlan.connectionName);
        }
        if (context.namespacePlan.kind === 'create') {
            maskValue(context, context.namespacePlan.namespaceName);
            maskValue(context, context.namespacePlan.resourceGroupName);
        }
        context.setupApproved = true;
        context.telemetry.properties.connectorF5SetupReviewed = 'true';
    }

    public shouldPrompt(context: ConnectorTriggerF5WizardContext): boolean {
        return !context.setupApproved;
    }

    public undo(context: ConnectorTriggerF5WizardContext): void {
        context.namespacePlan = undefined;
        context.connectionPlan = undefined;
        context.target = undefined;
        context.names = undefined;
        context.setupApproved = false;
    }
}

class ConnectorNamespaceEnsureStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 100;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        assertSetupActive(context);
        context.namespace = await this.dependencies.gateway.ensureNamespace(
            context,
            nonNullValue(context.target),
            nonNullValue(context.namespacePlan),
        );
        maskNamespace(context, context.namespace);
    }

    public shouldExecute(): boolean {
        return true;
    }
}

class ConnectorConnectionEnsureStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 100;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        assertSetupActive(context);
        context.connection = await this.dependencies.gateway.ensureConnection(
            context,
            nonNullValue(context.target),
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
        assertSetupActive(context);
        nonNullValue(context.setupSession).setStatus('authenticating');
        const namespace = nonNullValue(context.namespace);
        let connection = nonNullValue(context.connection);
        connection = await this.dependencies.gateway.getConnection(
            context,
            nonNullValue(context.target),
            namespace,
            connection,
        );
        assertSetupActive(context);
        if (isConnected(connection)) {
            context.telemetry.properties.connectorF5ConsentRequired = 'false';
            context.connection = connection;
            return;
        }

        context.telemetry.properties.connectorF5ConsentRequired = 'true';
        const consentLink = await this.dependencies.gateway.getConsentLink(
            context,
            nonNullValue(context.target),
            namespace,
            connection,
        );
        assertSetupActive(context);
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
        assertSetupActive(context);
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
        assertSetupActive(context);
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
            nonNullValue(context.target),
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

class ConnectorParameterPromptStep extends AzureWizardPromptStep<ConnectorTriggerF5WizardContext> {
    public async prompt(context: ConnectorTriggerF5WizardContext): Promise<void> {
        assertSetupActive(context);
        context.parameterValues = await nonNullValue(context.setupSession).collectParameters({
            target: nonNullValue(context.target),
            namespace: nonNullValue(context.namespace),
            connection: nonNullValue(context.connection),
            operation: {
                ...nonNullValue(context.operation),
                inputs: context.effectiveInputs,
            },
        });
        for (const value of Object.values(context.parameterValues)) {
            maskParameterValue(context, value);
        }
        context.parametersCollected = true;
    }

    public shouldPrompt(context: ConnectorTriggerF5WizardContext): boolean {
        return context.effectiveInputs.length > 0 && !context.parametersCollected;
    }

    public undo(context: ConnectorTriggerF5WizardContext): void {
        context.parameterValues = {};
        context.parametersCollected = false;
    }
}

class ConnectorTriggerConfigStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 100;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        assertSetupActive(context);
        const operation = nonNullValue(context.operation);
        const parameters = this.dependencies.operationResolver.serializeParameters(
            operation,
            context.effectiveInputs,
            context.parameterValues,
        );
        context.triggerConfig = await this.dependencies.gateway.createOrUpdateTriggerConfig(context, {
            target: nonNullValue(context.target),
            namespace: nonNullValue(context.namespace),
            connection: nonNullValue(context.connection),
            triggerConfigName: nonNullValue(context.names).triggerConfigName,
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
        assertSetupActive(context);
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

class ConnectorTriggerMetadataCompleteStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 300;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        assertSetupActive(context);
        await this.dependencies.projectStore.markComplete(context.projectPath);
        context.metadataCompleted = true;
    }

    public shouldExecute(context: ConnectorTriggerF5WizardContext): boolean {
        return context.localSettingsWritten === true && !context.metadataCompleted;
    }
}

async function runWizard(
    context: ConnectorTriggerF5WizardContext,
    promptSteps: AzureWizardPromptStep<ConnectorTriggerF5WizardContext>[],
    executeSteps: AzureWizardExecuteStep<ConnectorTriggerF5WizardContext>[],
    showLoadingPrompt = true,
): Promise<void> {
    const wizard = new AzureWizard(context, {
        title: localize('configureConnectorTriggerForDebug', 'Configure Connector Trigger'),
        promptSteps,
        executeSteps,
        showLoadingPrompt,
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
            assertSetupActive(context);
            const resolvedOperation = await dependencies.operationResolver.resolveOperation(context, {
                target: nonNullValue(context.target),
                namespace: nonNullValue(context.namespace),
                connection: nonNullValue(context.connection),
            });
            throwIfCancelled(token);
            assertSetupActive(context);
            return resolvedOperation;
        },
    );
    context.operation = operation;
    context.effectiveInputs = orderConnectorInputs(operation.inputs);
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
                assertSetupActive(context);
                try {
                    const refreshed = await dependencies.gateway.getConnection(
                        context,
                        nonNullValue(context.target),
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

function assertSetupActive(context: ConnectorTriggerF5WizardContext): void {
    if (!context.setupApproved) {
        throw new Error(localize('connectorSetupNotApproved', 'Approve Connector Trigger resource setup before continuing.'));
    }
    throwIfCancelled(nonNullValue(context.setupSession).cancellationToken);
}

async function createSetupRequest(context: ConnectorTriggerF5WizardContext): Promise<ConnectorTriggerSetupRequest> {
    const settings = await getLocalSettingsJson(context, path.join(context.projectPath, localSettingsFileName));
    if (settings.IsEncrypted) {
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorSetupEncryptedSettings',
            'Decrypt local.settings.json using the Azure Functions extension, then retry F5. Encrypted settings were not changed.',
        ));
    }
    const keys = [
        { name: `${context.binding.connectionSettingName}__pollingEndpoint`, purpose: 'pollingEndpoint' },
        { name: context.binding.triggerConfigSettingName, purpose: 'triggerConfig' },
    ] as const;
    return {
        metadata: context.metadata,
        projectPath: context.projectPath,
        binding: context.binding,
        localSettings: keys.map(({ name, purpose }) => {
            const previousValue = settings.Values?.[name];
            if (typeof previousValue === 'string') {
                maskValue(context, previousValue);
            }
            maskValue(context, process.env[name] ?? '');
            return {
                name,
                purpose,
                exists: Object.hasOwn(settings.Values ?? {}, name),
                environmentOverride: process.env[name] !== undefined,
            };
        }),
    };
}

function maskSetupValues(context: ConnectorTriggerF5WizardContext): void {
    for (const value of [
        context.projectPath,
        context.target?.subscription.id ?? '',
        context.target?.subscription.tenantId ?? '',
        context.target?.subscription.environment.name ?? '',
        context.target?.subscription.environment.resourceManagerEndpointUrl ?? '',
        context.target?.region ?? '',
        context.metadata?.connectorId ?? '',
        context.metadata?.operationId ?? '',
        context.target?.connectorId ?? '',
        context.target?.operationId ?? '',
        context.binding.connectionSettingName,
        context.binding.triggerConfigSettingName,
        context.names?.resourceGroupName ?? '',
        context.names?.namespaceName ?? '',
        context.names?.connectionName ?? '',
        context.names?.triggerConfigName ?? '',
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
