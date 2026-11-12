/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID } from 'crypto';
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
import { addValuesToMask, equalsIgnoreCase, getEnvironmentValue } from '../../connectorTrigger/connectorTriggerUtils';
import { ext } from '../../extensionVariables';
import { getLocalSettingsJson, type ILocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { FileConnectorTriggerLocalSettingsWriter, getConnectorTriggerSettingValue } from './ConnectorTriggerLocalSettingsWriter';
import { orderConnectorInputs } from './ConnectorTriggerParameterForm';
import {
    isConnectorHostConflictingSettingName,
    isConnectorHostEnvironmentVariable,
    planConnectorHostCredential,
} from './connectorTriggerHostCredential';
import {
    ConnectorTriggerF5SetupError,
    ConnectorTriggerLocalSettingsChangedError,
    connectorResourceNameSuffixAttempts,
    createSuffixedConnectorResourceName,
    isSuffixedConnectorResourceName,
    type ConnectorTriggerConnection,
    type ConnectorTriggerConnectionAccessPolicy,
    type ConnectorTriggerHostCredentialConfiguration,
    type ConnectorTriggerHostLaunch,
    type ConnectorTriggerPrincipal,
    type ConnectorTriggerWorkspaceIdentityStore,
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
const workspaceIdsStateKey = 'connectorTriggerF5.workspaceIds';
// Connection-section keys read by Microsoft.Extensions.Azure CreateTokenCredential.
const hostCredentialConnectionKeys = [
    'credential',
    'clientId',
    'tenantId',
    'managedIdentityClientId',
    'managedIdentityResourceId',
    'managedIdentityObjectId',
    'clientSecret',
    'clientCertificate',
    'clientCertificateStoreName',
    'clientCertificateStoreLocation',
    'additionallyAllowedTenants',
    'tokenFilePath',
    'azureCloud',
    'serviceConnectionId',
    'systemAccessToken',
] as const;
// Environment variables that change which principal DefaultAzureCredential authenticates as.
const hostCredentialEnvironmentVariables = [
    'AZURE_TOKEN_CREDENTIALS',
    'AZURE_TENANT_ID',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_CLIENT_CERTIFICATE_PATH',
    'AZURE_CLIENT_CERTIFICATE_PASSWORD',
    'AZURE_CLIENT_SEND_CERTIFICATE_CHAIN',
    'AZURE_USERNAME',
    'AZURE_PASSWORD',
    'AZURE_FEDERATED_TOKEN_FILE',
    'AZURE_AUTHORITY_HOST',
    'AZURE_ADDITIONALLY_ALLOWED_TENANTS',
    'IDENTITY_ENDPOINT',
    'IDENTITY_HEADER',
    'IDENTITY_SERVER_THUMBPRINT',
    'IMDS_ENDPOINT',
    'MSI_ENDPOINT',
    'MSI_SECRET',
] as const;

interface ConnectorTriggerF5WizardContext extends IActionContext {
    projectPath: string;
    setupRequest?: ConnectorTriggerSetupRequest;
    /** Reviewed local.settings.json values, including host credential settings; undefined when absent. */
    reviewedSettings?: Record<string, string | undefined>;
    hostCredentialSettingNames?: ReadonlySet<string>;
    hostCredential?: ConnectorTriggerHostCredentialConfiguration;
    hostLaunch?: ConnectorTriggerHostLaunch;
    pinAzureCliCredential?: boolean;
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

    const workspaceIdentity = dependencies.workspaceIdentity ?? new WorkspaceStateConnectorTriggerWorkspaceIdentityStore();
    const workspaceId = await workspaceIdentity.get(projectPath);
    addValuesToMask(wizardContext, workspaceId);
    wizardContext.hostLaunch = dependencies.hostLaunch;
    wizardContext.setupRequest = await createSetupRequest(wizardContext, workspaceId);
    const setup = await dependencies.openSetup(wizardContext, wizardContext.setupRequest);
    wizardContext.setupSession = setup;
    try {
        await runWizard(wizardContext, [new ConnectorResourcesPromptStep()], [], false);
        setup.setStatus('provisioning');
        await runWizard(wizardContext, [], [
            new ConnectorConnectionPreflightStep(dependencies),
            new ConnectorNamespaceEnsureStep(dependencies),
        ]);
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
    workspaceId: string,
): ConnectorTriggerResourceNames {
    const scopeHash = stableHash([
        target.subscription.id,
        target.region,
    ]);
    const projectHash = stableHash([
        workspaceId,
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
            addValuesToMask(context, context.connectionPlan.connectionName);
        }
        if (context.namespacePlan.kind === 'create') {
            addValuesToMask(context, context.namespacePlan.namespaceName, context.namespacePlan.resourceGroupName);
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

/**
 * Rejects a connector whose authentication setup cannot collect before any resource group,
 * namespace or connection is created. Existing connections are already authorized and skip it.
 */
class ConnectorConnectionPreflightStep extends AzureWizardExecuteStep<ConnectorTriggerF5WizardContext> {
    public priority = 90;

    public constructor(private readonly dependencies: ConnectorTriggerF5Dependencies) {
        super();
    }

    public async execute(context: ConnectorTriggerF5WizardContext): Promise<void> {
        assertSetupActive(context);
        await this.dependencies.gateway.assertConnectorConnectionCreatable(
            context,
            nonNullValue(context.target),
            { cancellationToken: nonNullValue(context.setupSession).cancellationToken },
        );
        assertSetupActive(context);
    }

    public shouldExecute(context: ConnectorTriggerF5WizardContext): boolean {
        return context.connectionPlan?.kind === 'create';
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
            { cancellationToken: nonNullValue(context.setupSession).cancellationToken },
        );
        assertSetupActive(context);
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
        const plan = nonNullValue(context.connectionPlan);
        context.connection = await this.dependencies.gateway.ensureConnection(
            context,
            nonNullValue(context.target),
            nonNullValue(context.namespace),
            plan,
            {
                ownerWorkspaceId: nonNullValue(context.setupRequest).workspaceId,
                cancellationToken: nonNullValue(context.setupSession).cancellationToken,
            },
        );
        assertSetupActive(context);
        maskConnection(context, context.connection);
        if (plan.kind === 'create') {
            // The gateway may add a hex suffix when another connection has the planned name; use
            // the resolved connection for every later step.
            context.telemetry.properties.connectorF5ConnectionNameSuffixed =
                String(context.connection.name !== plan.connectionName);
            nonNullValue(context.names).connectionName = context.connection.name;
            context.connectionPlan = { kind: 'existing', connection: context.connection };
        }
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
        addValuesToMask(context, consentLink);
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
        const target = nonNullValue(context.target);
        const hostCredential = nonNullValue(context.hostCredential);
        context.telemetry.properties.connectorF5HostCredentialSource =
            Object.keys(hostCredential.connectionSettings).length > 0 ? 'connectionSettings' : 'defaultAzureCredential';
        context.telemetry.properties.connectorF5HostCredentialEnvironmentFromSettings =
            String(Object.keys(hostCredential.environment).length > 0);
        const pollingPrincipal = await this.dependencies.gateway.getPollingPrincipal(context, target, hostCredential);
        assertSetupActive(context);
        addValuesToMask(context, pollingPrincipal?.objectId, pollingPrincipal?.tenantId);
        if (!pollingPrincipal?.objectId || !pollingPrincipal.tenantId) {
            context.telemetry.properties.connectorF5PollingIdentityUnresolved = 'true';
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorPollingIdentityUnresolved',
                'Could not determine the identity the local Functions host uses to poll Connector Triggers. Sign in with a developer tool the host uses, such as Azure CLI (az login), or configure an explicit credential for connection "{0}" in local.settings.json, then retry F5. No connection access was granted.',
                hostCredential.connectionSettingName,
            ));
        }
        if (!namespaceObjectId || !namespaceTenantId) {
            throw new Error(localize(
                'missingConnectorAccessIdentities',
                'Azure did not return the identities required to authorize local Connector Trigger polling.',
            ));
        }
        await assertHostCredentialUnchanged(context);
        assertSetupActive(context);

        await this.dependencies.gateway.ensureConnectionAccessPolicies(
            context,
            target,
            namespace,
            connection,
            [
                createAccessPolicy('namespace-trigger-runtime', { objectId: namespaceObjectId, tenantId: namespaceTenantId }),
                createAccessPolicy('local-developer', pollingPrincipal),
            ],
            { cancellationToken: nonNullValue(context.setupSession).cancellationToken },
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
        const target = nonNullValue(context.target);
        const namespace = nonNullValue(context.namespace);
        const workspaceId = nonNullValue(context.setupRequest).workspaceId;
        const { name: triggerConfigName, createOnly } = await resolveTriggerConfigName(context, this.dependencies, target, namespace, workspaceId);
        assertSetupActive(context);
        const parameters = this.dependencies.operationResolver.serializeParameters(
            operation,
            context.effectiveInputs,
            context.parameterValues,
        );
        context.triggerConfig = await this.dependencies.gateway.createOrUpdateTriggerConfig(context, {
            target,
            namespace,
            connection: nonNullValue(context.connection),
            triggerConfigName,
            ownerWorkspaceId: workspaceId,
            deliveryMode: 'Poll',
            state: 'Enabled',
            type: 'NotSpecified',
            parameters,
        }, { cancellationToken: nonNullValue(context.setupSession).cancellationToken, createOnly });
        addValuesToMask(
            context,
            context.triggerConfig.id,
            context.triggerConfig.name,
            context.triggerConfig.pollingEndpoints.receiveUri,
            context.triggerConfig.pollingEndpoints.acknowledgeUri,
            context.triggerConfig.pollingEndpoints.hasMessagesUri,
            context.triggerConfig.pollingEndpoints.approximateQueueDepthUri,
        );
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
        const values = {
            ...(context.pinAzureCliCredential ? { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' } : {}),
            [`${context.binding.connectionSettingName}__pollingEndpoint`]: pollingEndpoint,
            [context.binding.triggerConfigSettingName]: triggerConfig.name,
        };
        let expected: Readonly<Record<string, string | undefined>> = nonNullValue(context.reviewedSettings);
        const hostCredentialSettingNames = nonNullValue(context.hostCredentialSettingNames);
        for (; ;) {
            assertSetupActive(context);
            await assertHostCredentialUnchanged(context);
            try {
                await writer.write(context, context.projectPath, values, expected);
                break;
            } catch (error) {
                if (!(error instanceof ConnectorTriggerLocalSettingsChangedError)) {
                    throw error;
                }
                assertSetupActive(context);
                if (error.changedNames.some(name => hostCredentialSettingNames.has(name))) {
                    context.telemetry.properties.connectorF5HostCredentialChangedSinceReview = 'true';
                    throw new ConnectorTriggerF5SetupError(undefined, localize(
                        'connectorHostCredentialChanged',
                        'Azure credential settings in local.settings.json changed during Connector Trigger setup, so connection access may not match the identity the local Functions host will use. Retry F5 to authorize the current identity. Connector Trigger settings were not saved.',
                    ));
                }
                await confirmChangedLocalSettings(context, error.changedNames);
                expected = { ...expected, ...Object.fromEntries(error.changedNames.map(name => [name, error.current[name]])) };
            }
        }
        if (context.hostLaunch?.kind === 'task') {
            ext.outputChannel.appendLine(localize(
                'connectorTaskCredentialPin',
                'Connector Trigger setup pins the fallback credential with AZURE_TOKEN_CREDENTIALS=AzureCliCredential; connection-section credentials take precedence. A task shell profile can still change the Azure CLI login or AZURE_CONFIG_DIR after setup; keep these consistent with the task environment used during setup.',
            ));
        }
        context.localSettingsWritten = true;
    }

    public shouldExecute(context: ConnectorTriggerF5WizardContext): boolean {
        return !context.localSettingsWritten;
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
                let refreshed: ConnectorTriggerConnection | undefined;
                try {
                    refreshed = await dependencies.gateway.getConnection(
                        context,
                        nonNullValue(context.target),
                        namespace,
                        connection,
                    );
                } catch (error) {
                    if (error instanceof UserCancelledError) {
                        throw error;
                    }
                    lastError = error;
                }
                throwIfCancelled(token);
                assertSetupActive(context);
                if (refreshed && isConnected(refreshed)) {
                    maskConnection(context, refreshed);
                    return refreshed;
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

/**
 * Returns the planned Trigger Config name when it is unused or this workspace owns it. Otherwise
 * returns a hex-suffixed name, preferring the suffixed name an earlier setup for this workspace
 * saved so retries keep updating the same Trigger Config.
 */
async function resolveTriggerConfigName(
    context: ConnectorTriggerF5WizardContext,
    dependencies: ConnectorTriggerF5Dependencies,
    target: ConnectorTriggerSetupTarget,
    namespace: ConnectorTriggerNamespace,
    workspaceId: string,
): Promise<{ name: string; createOnly: boolean }> {
    const names = nonNullValue(context.names);
    const baseName = names.triggerConfigName;
    const tryUse = async (name: string): Promise<{ name: string; createOnly: boolean } | undefined> => {
        const existing = await dependencies.gateway.getTriggerConfig(context, target, namespace, name);
        assertSetupActive(context);
        if (!existing) {
            return { name, createOnly: true };
        }
        return existing.ownerWorkspaceId === workspaceId ? { name, createOnly: false } : undefined;
    };
    const planned = await tryUse(baseName);
    if (planned) {
        return planned;
    }

    context.telemetry.properties.connectorF5TriggerConfigNameSuffixed = 'true';
    const saved = context.reviewedSettings?.[context.binding.triggerConfigSettingName];
    const candidates = function* (): Generator<string> {
        if (isSuffixedConnectorResourceName(saved, baseName)) {
            yield saved;
        }
        for (let attempt = 0; attempt < connectorResourceNameSuffixAttempts; attempt++) {
            yield createSuffixedConnectorResourceName(baseName);
        }
    };
    for (const candidate of candidates()) {
        addValuesToMask(context, candidate);
        const usable = await tryUse(candidate);
        if (usable) {
            names.triggerConfigName = candidate;
            return usable;
        }
    }
    throw new ConnectorTriggerF5SetupError(undefined, localize(
        'connectorTriggerConfigNameUnavailable',
        'Could not find an unused Trigger Config name. Retry F5. No Trigger Config was changed.',
    ));
}

async function createSetupRequest(context: ConnectorTriggerF5WizardContext, workspaceId: string): Promise<ConnectorTriggerSetupRequest> {
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
    const values = settings.Values ?? {};
    const reviewedSettings: Record<string, string | undefined> = {};
    const reviewSetting = (name: string): string | undefined => {
        const value = getConnectorTriggerSettingValue(values, name);
        addValuesToMask(context, value, process.env[name]);
        reviewedSettings[name] = value;
        return value;
    };
    const localSettings = keys.map(({ name, purpose }) => ({
        name,
        purpose,
        exists: reviewSetting(name) !== undefined,
        environmentOverride: process.env[name] !== undefined,
    }));

    const review = reviewHostCredential(context, settings, context.binding.connectionSettingName, context.hostLaunch);
    if (context.hostLaunch?.kind === 'task') {
        context.pinAzureCliCredential =
            getEnvironmentValue(review.hostCredential.environment, 'AZURE_TOKEN_CREDENTIALS') === undefined &&
            getEnvironmentValue(context.hostLaunch.environment, 'AZURE_TOKEN_CREDENTIALS') === undefined;
    }
    context.reviewedSettings = { ...reviewedSettings, ...review.reviewedSettings };
    context.hostCredentialSettingNames = review.settingNames;
    context.hostCredential = review.hostCredential;
    return {
        metadata: context.metadata,
        projectPath: context.projectPath,
        workspaceId,
        binding: context.binding,
        localSettings,
    };
}

interface HostCredentialReview {
    hostCredential: ConnectorTriggerHostCredentialConfiguration;
    reviewedSettings: Record<string, string | undefined>;
    settingNames: Set<string>;
}

function reviewHostCredential(
    context: IActionContext,
    settings: ILocalSettingsJson,
    connectionSettingName: string,
    launch: ConnectorTriggerHostLaunch | undefined,
): HostCredentialReview {
    const values: Readonly<Record<string, unknown>> = settings.Values ?? {};
    // Core Tools adds Values only for variables the host's launch environment does not define.
    const launchEnvironment: Readonly<Record<string, string | undefined>> =
        launch ? launch.environment : process.env;
    const reviewedSettings: Record<string, string | undefined> = {};
    const settingNames = new Set<string>();
    const review = (name: string): string | undefined => {
        const value = getConnectorTriggerSettingValue(values, name);
        addValuesToMask(context, value);
        settingNames.add(name);
        reviewedSettings[name] = value;
        return value;
    };

    const connectionSettings: Record<string, string> = {};
    for (const key of hostCredentialConnectionKeys) {
        const name = `${connectionSettingName}__${key}`;
        const fileValue = review(name);
        // Configuration keys are case-insensitive on every platform.
        const value = getEnvironmentValue(launchEnvironment, name, true) ?? fileValue;
        if (value !== undefined) {
            addValuesToMask(context, value);
            connectionSettings[key] = value;
        }
    }
    const environment: Record<string, string> = {};
    // Core Tools exports Values with their original casing, and the host reads environment variables
    // case-sensitively outside Windows, so resolve them by the platform rule rather than by config rules.
    const fileEnvironment: Record<string, string | undefined> = Object.fromEntries(
        Object.keys(values).map(key => [key, getConnectorTriggerSettingValue(values, key)]),
    );
    for (const name of [...hostCredentialEnvironmentVariables, ...Object.keys(values).filter(isConnectorHostEnvironmentVariable)]) {
        review(name);
        const value = getEnvironmentValue(fileEnvironment, name);
        if (value !== undefined && getEnvironmentValue(launchEnvironment, name) === undefined) {
            environment[name] = value;
        }
    }
    const conflictingSettingNames = [
        ...Object.keys(values).filter(name => isConnectorHostConflictingSettingName(name, connectionSettingName)),
        ...Object.keys(settings.ConnectionStrings ?? {})
            .map(name => `ConnectionStrings:${name}`)
            .filter(name => isConnectorHostConflictingSettingName(name, connectionSettingName)),
    ];
    addValuesToMask(context, ...conflictingSettingNames);
    const hostCredential: ConnectorTriggerHostCredentialConfiguration = {
        connectionSettingName,
        connectionSettings,
        environment,
        conflictingSettingNames,
        launch,
    };
    if (launch?.kind === 'task') {
        const plan = planConnectorHostCredential(hostCredential);
        const pins = Object.entries(values).filter(([name]) => name.toUpperCase() === 'AZURE_TOKEN_CREDENTIALS');
        if (pins.some(([, value]) => typeof value !== 'string' || value.trim().toLowerCase() !== 'azureclicredential') ||
            plan.kind === 'unsupported' && plan.reason === 'taskCredentialConflict') {
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorSetupTaskCredentialConflict',
                'Connector Trigger task setup requires AZURE_TOKEN_CREDENTIALS=AzureCliCredential. Remove conflicting values from local.settings.json, the process environment, terminal.integrated.env and task options.env, then retry F5. Connector Trigger settings were not saved.',
            ));
        }
    }
    return {
        hostCredential,
        reviewedSettings,
        settingNames,
    };
}

/**
 * Re-reads local.settings.json and throws, before access is granted or settings are written, when
 * the host credential configuration differs from the one setup authorized. This covers settings
 * that are not known in advance, such as new AzureWebJobs<connection> or ConnectionStrings entries.
 */
async function assertHostCredentialUnchanged(context: ConnectorTriggerF5WizardContext): Promise<void> {
    const reviewed = nonNullValue(context.hostCredential);
    const settings = await getLocalSettingsJson(context, path.join(context.projectPath, localSettingsFileName));
    const current = settings.IsEncrypted ?
        undefined :
        reviewHostCredential(context, settings, reviewed.connectionSettingName, reviewed.launch).hostCredential;
    if (!current || getHostCredentialFingerprint(current) !== getHostCredentialFingerprint(reviewed)) {
        context.telemetry.properties.connectorF5HostCredentialChangedSinceReview = 'true';
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorHostCredentialChanged',
            'Azure credential settings in local.settings.json changed during Connector Trigger setup, so connection access may not match the identity the local Functions host will use. Retry F5 to authorize the current identity. Connector Trigger settings were not saved.',
        ));
    }
}

function getHostCredentialFingerprint(hostCredential: ConnectorTriggerHostCredentialConfiguration): string {
    const sortedEntries = (record: Readonly<Record<string, string>>): [string, string][] =>
        Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify([
        sortedEntries(hostCredential.connectionSettings),
        sortedEntries(hostCredential.environment),
        [...hostCredential.conflictingSettingNames].sort(),
    ]);
}

class WorkspaceStateConnectorTriggerWorkspaceIdentityStore implements ConnectorTriggerWorkspaceIdentityStore {
    public async get(projectPath: string): Promise<string> {
        const state = ext.context.workspaceState;
        const key = path.resolve(projectPath);
        const ids = state.get<Record<string, string>>(workspaceIdsStateKey) ?? {};
        const existing = ids[key];
        if (existing) {
            return existing;
        }
        const id = randomUUID();
        await state.update(workspaceIdsStateKey, { ...ids, [key]: id });
        return id;
    }
}

function createAccessPolicy(prefix: string, principal: ConnectorTriggerPrincipal): ConnectorTriggerConnectionAccessPolicy {
    return {
        name: `${prefix}-${stableHash([principal.tenantId.toLowerCase(), principal.objectId.toLowerCase()])}`,
        principal: {
            type: 'ActiveDirectory',
            identity: {
                objectId: principal.objectId,
                tenantId: principal.tenantId,
            },
        },
    };
}

async function confirmChangedLocalSettings(context: IActionContext, changedNames: readonly string[]): Promise<void> {
    context.telemetry.properties.connectorF5LocalSettingsChangedSinceReview = 'true';
    const overwrite: vscode.MessageItem = { title: localize('overwriteConnectorSettings', 'Overwrite') };
    const result = await context.ui.showWarningMessage(
        localize(
            'connectorSettingsChangedReapprove',
            'local.settings.json changed after you reviewed Connector Trigger setup. Overwrite these settings: {0}?',
            changedNames.join(', '),
        ),
        { modal: true, stepName: 'connectorF5LocalSettingsChanged' },
        overwrite,
    );
    if (result !== overwrite) {
        throw new UserCancelledError('connectorF5LocalSettingsChanged');
    }
}

function maskSetupValues(context: ConnectorTriggerF5WizardContext): void {
    addValuesToMask(
        context,
        context.projectPath,
        context.target?.subscription.id,
        context.target?.subscription.tenantId,
        context.target?.subscription.environment.name,
        context.target?.subscription.environment.resourceManagerEndpointUrl,
        context.target?.region,
        context.metadata?.connectorId,
        context.metadata?.operationId,
        context.target?.connectorId,
        context.target?.operationId,
        context.binding.connectionSettingName,
        context.binding.triggerConfigSettingName,
        context.names?.resourceGroupName,
        context.names?.namespaceName,
        context.names?.connectionName,
        context.names?.triggerConfigName,
    );
}

function maskNamespace(context: IActionContext, namespace: ConnectorTriggerNamespace): void {
    addValuesToMask(
        context,
        namespace.id,
        namespace.name,
        namespace.resourceGroupName,
        namespace.location,
        namespace.identity?.principalId,
        namespace.identity?.tenantId,
    );
}

function maskConnection(context: IActionContext, connection: ConnectorTriggerConnection): void {
    addValuesToMask(
        context,
        connection.id,
        connection.name,
        connection.connectorId,
        connection.createdBy?.objectId,
        connection.createdBy?.tenantId,
    );
}

function maskParameterValue(context: IActionContext, value: ConnectorTriggerParameterValue): void {
    if (typeof value === 'string') {
        addValuesToMask(context, value);
        return;
    }
    if (typeof value === 'object' && value !== null) {
        addValuesToMask(context, JSON.stringify(value));
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
