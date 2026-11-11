/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { randomBytes } from 'crypto';
import { type CancellationToken } from 'vscode';
import { type ConnectorTriggerProjectMetadata } from '../../connectorTrigger/connectorTriggerProjectMetadata';
import { localize } from '../../localize';

export { type ConnectorTriggerProjectMetadata } from '../../connectorTrigger/connectorTriggerProjectMetadata';

/** Attempts to find an unused hex-suffixed name before setup gives up. */
export const connectorResourceNameSuffixAttempts = 5;

/** Returns baseName with a random hex suffix, used when another owner already has baseName. */
export function createSuffixedConnectorResourceName(baseName: string): string {
    return `${baseName}-${randomBytes(3).toString('hex')}`;
}

export function isSuffixedConnectorResourceName(name: string | undefined, baseName: string): name is string {
    return typeof name === 'string' &&
        name.length === baseName.length + 7 &&
        name.toLowerCase().startsWith(`${baseName.toLowerCase()}-`) &&
        /^[0-9a-f]{6}$/i.test(name.slice(baseName.length + 1));
}

export class ConnectorTriggerF5SetupError extends Error {
    public readonly code = 'connectorTriggerF5SetupFailed';

    public constructor(
        cause?: unknown,
        message = localize(
            'connectorTriggerF5SetupFailed',
            'Connector Trigger setup could not be completed. Check your Azure access and network connection, then retry debugging.',
        ),
    ) {
        super(message, { cause });
    }
}

export class ConnectorTriggerLocalSettingsChangedError extends Error {
    public constructor(
        public readonly changedNames: readonly string[],
        /** Current value of every expected setting; undefined when the setting is absent. */
        public readonly current: Readonly<Record<string, string | undefined>>,
    ) {
        super(localize(
            'connectorSettingsChangedSinceReview',
            'local.settings.json changed after Connector Trigger setup was reviewed.',
        ));
    }
}

export type ConnectorTriggerParameterValue =
    string |
    number |
    boolean |
    null |
    ConnectorTriggerParameterValue[] |
    { [key: string]: ConnectorTriggerParameterValue };

export interface ConnectorTriggerSetupTarget extends ConnectorTriggerProjectMetadata {
    subscription: {
        id: string;
        tenantId: string;
        /**
         * Azure Resources account the subscription was selected under. The same subscription can be
         * listed under several accounts; when set, only that account's live subscription is used.
         */
        accountId?: string;
        environment: {
            name: string;
            resourceManagerEndpointUrl: string;
        };
    };
    region: string;
}

export interface ConnectorTriggerProjectMetadataStore {
    read(projectPath: string): Promise<ConnectorTriggerProjectMetadata | undefined>;
    /**
     * Records completion without removing the only recovery metadata. A no-op is valid when the
     * required local settings are the durable completion marker.
     */
    markComplete(projectPath: string): Promise<void>;
}

export interface ConnectorTriggerBindingResolver {
    find(context: IActionContext, projectPath: string): Promise<ConnectorTriggerLocalBinding[]>;
    /**
     * Resolves the actual Poll binding Connection prefix and TriggerConfigName setting reference
     * from project metadata. Implementations must not derive either key from Azure resource names.
     */
    resolve(
        context: IActionContext,
        projectPath: string,
        metadata: ConnectorTriggerProjectMetadata,
    ): Promise<ConnectorTriggerLocalBinding>;
}

export interface ConnectorTriggerLocalBinding {
    connectionSettingName: string;
    triggerConfigSettingName: string;
}

export interface ConnectorTriggerNamespace {
    id: string;
    name: string;
    resourceGroupName: string;
    location: string;
    identity?: {
        principalId?: string;
        tenantId?: string;
    };
}

export interface ConnectorTriggerConnection {
    id: string;
    name: string;
    connectorId: string;
    status?: string;
    createdBy?: {
        objectId?: string;
        tenantId?: string;
    };
    /** Workspace identity recorded when setup created the connection, read back from the resource. */
    ownerWorkspaceId?: string;
}

/** Lets a gateway stop before each Azure mutation once the user cancels setup. */
export interface ConnectorTriggerMutationOptions {
    cancellationToken?: CancellationToken;
}

export interface ConnectorTriggerConnectionOptions extends ConnectorTriggerMutationOptions {
    /** Recorded on connections setup creates, so retries reuse them and never adopt another's. */
    ownerWorkspaceId: string;
}

export interface ConnectorTriggerConfigWriteOptions extends ConnectorTriggerMutationOptions {
    /** Set when setup found the name unused; the write must fail rather than replace a Trigger Config created meanwhile. */
    createOnly?: boolean;
}

export interface ConnectorTriggerConfig {
    id: string;
    name: string;
    state: string;
    /**
     * Persistent identity of the workspace that created the Trigger Config, read back from the
     * resource. Undefined when the resource carries no ownership marker.
     */
    ownerWorkspaceId?: string;
    pollingEndpoints: {
        receiveUri: string;
        acknowledgeUri?: string;
        hasMessagesUri?: string;
        approximateQueueDepthUri?: string;
    };
}

export type ConnectorTriggerNamespacePlan =
    | {
        kind: 'existing';
        namespace: ConnectorTriggerNamespace;
    }
    | {
        kind: 'create';
        resourceGroupName: string;
        namespaceName: string;
    };

export type ConnectorTriggerConnectionPlan =
    | {
        kind: 'existing';
        connection: ConnectorTriggerConnection;
    }
    | {
        kind: 'create';
        connectionName: string;
    };

export interface ConnectorTriggerGateway {
    /**
     * The selected environment fields are transient identity metadata. Implementations must resolve
     * the subscription through the current authenticated Azure account and use that live context.
     */
    listNamespaces(context: IActionContext, target: ConnectorTriggerSetupTarget): Promise<ConnectorTriggerNamespace[]>;
    /**
     * Returns a provisioned namespace. A create plan reuses a namespace created concurrently only
     * when creation reported a conflict.
     */
    ensureNamespace(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        plan: ConnectorTriggerNamespacePlan,
        options?: ConnectorTriggerMutationOptions,
    ): Promise<ConnectorTriggerNamespace>;
    listConnections(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
    ): Promise<ConnectorTriggerConnection[]>;
    /**
     * For a create plan, reuses a connection with the planned name only when this workspace owns
     * it. When another connection already has that name, creates one whose name adds a random hex
     * suffix (reusing a suffixed connection this workspace already owns). Rejects connectors whose
     * required authentication settings setup cannot collect before creating anything.
     */
    ensureConnection(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        plan: ConnectorTriggerConnectionPlan,
        options: ConnectorTriggerConnectionOptions,
    ): Promise<ConnectorTriggerConnection>;
    getConnection(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
    ): Promise<ConnectorTriggerConnection>;
    /**
     * Uses the portal origin from the live resolved subscription environment as the consent
     * redirect, falling back only to the repository-standard public-cloud portal.
     */
    getConsentLink(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
    ): Promise<string>;
    dynamicInvoke(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
        request: ConnectorTriggerDynamicInvokeRequest,
    ): Promise<unknown>;
    /**
     * Returns the Microsoft Entra principal that the local Functions host authenticates as when it
     * polls this connection, or undefined when that principal cannot be determined.
     *
     * The Connector extension builds its credential with Microsoft.Extensions.Azure
     * `AzureComponentFactory.CreateTokenCredential` for the `hostCredential.connectionSettingName`
     * section and requests `https://apihub.azure.com/.default`. When
     * `hostCredential.connectionSettings` is empty, the factory falls back to the host's
     * DefaultAzureCredential: Environment, Workload Identity, Managed Identity, Visual Studio,
     * Visual Studio Code, Azure CLI, Azure PowerShell, then Azure Developer CLI, honoring
     * AZURE_TOKEN_CREDENTIALS. Implementations must evaluate that same credential in the
     * environment described by `hostCredential.launch`, with `hostCredential.environment` applied
     * for variables the launch environment does not set, and return the token's oid and tid claims.
     * A verifiedTask observation supplies those claims from a fresh probe inside the host task;
     * validate its credential kind and tenant rather than acquiring another token outside the task.
     *
     * Implementations must throw ConnectorTriggerF5SetupError, rather than return a principal, when
     * that evaluation cannot be proven to match the host: for example when the launch environment
     * is unknown or is a shell, terminal or task without a verified probe, or when
     * `hostCredential.conflictingSettingNames` or the launch environment define a section the host
     * reads instead of the `<connectionSettingName>__<key>` settings.
     *
     * Do not substitute the account selected in VS Code or the connection creator for that
     * evaluation; either can differ from the principal the chain resolves (for example, after
     * `az login` as another user in a dev container).
     */
    getPollingPrincipal(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        hostCredential: ConnectorTriggerHostCredentialConfiguration,
    ): Promise<ConnectorTriggerPrincipal | undefined>;
    /**
     * Creates or updates only the named policies. Policy names are principal-specific; an existing
     * policy with a requested name may be updated only when it grants the same principal, and other
     * policies on the connection must never be deleted or replaced.
     */
    ensureConnectionAccessPolicies(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
        policies: readonly ConnectorTriggerConnectionAccessPolicy[],
        options?: ConnectorTriggerMutationOptions,
    ): Promise<void>;
    /**
     * Returns the Trigger Config with the given name, including its ownership marker, or undefined
     * when it does not exist.
     */
    getTriggerConfig(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        triggerConfigName: string,
    ): Promise<ConnectorTriggerConfig | undefined>;
    /**
     * Creates or updates an enabled Poll Trigger Config without notificationDetails. The returned
     * model must include service-generated pollingEndpoints, using a GET fallback when PUT omits it.
     * Implementations must persist request.ownerWorkspaceId on the resource so getTriggerConfig can
     * return it as the ownership marker.
     */
    createOrUpdateTriggerConfig(
        context: IActionContext,
        request: ConnectorTriggerConfigRequest,
        options?: ConnectorTriggerConfigWriteOptions,
    ): Promise<ConnectorTriggerConfig>;
}

export interface ConnectorTriggerPrincipal {
    objectId: string;
    tenantId: string;
}

/**
 * Credential configuration the local Functions host will see for a Connector connection. Values
 * can be secrets: never log them or include them in telemetry or errors.
 */
export interface ConnectorTriggerHostCredentialConfiguration {
    connectionSettingName: string;
    /**
     * Microsoft.Extensions.Azure credential keys set as `<connectionSettingName>__<key>`, keyed by
     * `<key>` (for example credential, clientId or tenantId). Launch environment values take
     * precedence over local.settings.json Values, matching Core Tools.
     */
    connectionSettings: Readonly<Record<string, string>>;
    /**
     * Credential-related variables (AZURE_*, managed identity endpoints and the home and path
     * variables Azure CLI reads) that local.settings.json Values add to the host process
     * environment. Variables already set in the launch environment are not included.
     */
    environment: Readonly<Record<string, string>>;
    /**
     * Names of local.settings.json Values and ConnectionStrings entries that the WebJobs host reads
     * for this connection instead of, or in addition to, the `<connectionSettingName>__<key>`
     * settings, such as `AzureWebJobs<connectionSettingName>__clientId`,
     * `ConnectionStrings:<connectionSettingName>` or `<connectionSettingName>:clientId`.
     */
    conflictingSettingNames: readonly string[];
    /** How the local Functions host will be launched, or undefined when that is not known. */
    launch: ConnectorTriggerHostLaunch | undefined;
}

/**
 * How the local Functions host process will be started, which determines the environment its
 * credential reads. Values can be secrets: never log them or include them in telemetry or errors.
 */
export type ConnectorTriggerTaskCredentialKind = 'connectionSettings' | 'environmentCredential' | 'azureCli';

export type ConnectorTriggerHostLaunch =
    | {
        /**
         * A fresh credential probe ran in the same continuous task execution context as host startup,
         * using the host's credential construction. The launcher must preserve that environment and
         * block host startup until setup succeeds. A separate dependsOn/pre-launch task does not
         * qualify. Never persist or reuse this observation on a later launch.
         */
        kind: 'verifiedTask';
        /** Effective environment observed by the probe, not the extension's process environment. */
        environment: Readonly<Record<string, string>>;
        principal: ConnectorTriggerPrincipal;
        credentialKind: ConnectorTriggerTaskCredentialKind;
    }
    | {
        /**
         * The launcher starts Core Tools directly, without a shell, terminal or task, with exactly
         * this process environment. Setup evaluates the host credential in that environment.
         */
        kind: 'exactEnvironment';
        environment: Readonly<Record<string, string>>;
    }
    | {
        /**
         * The host is started by a VS Code task. Shell profiles, terminal settings and extension
         * environment contributions can change its environment, so the host credential cannot be
         * evaluated. `environment` is the task's options.env.
         */
        kind: 'task';
        execution: 'shell' | 'process' | 'custom';
        environment: Readonly<Record<string, string>>;
    };

export interface ConnectorTriggerConnectionAccessPolicy {
    name: string;
    principal: {
        type: 'ActiveDirectory';
        identity: ConnectorTriggerPrincipal;
    };
}

export interface ConnectorTriggerDynamicInvokeRequest {
    request: {
        method: 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT';
        path: string;
        queries?: Record<string, string>;
        headers?: Record<string, string>;
        body?: ConnectorTriggerParameterValue;
    };
}

export interface ConnectorTriggerConfigRequest {
    target: ConnectorTriggerSetupTarget;
    namespace: ConnectorTriggerNamespace;
    connection: ConnectorTriggerConnection;
    triggerConfigName: string;
    ownerWorkspaceId: string;
    deliveryMode: 'Poll';
    state: 'Enabled';
    type: 'NotSpecified';
    parameters: ConnectorTriggerOperationParameter[];
}

export interface ConnectorTriggerOperationParameter {
    name: string;
    value: ConnectorTriggerParameterValue;
}

export type ConnectorTriggerInputType = 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string';
export type ConnectorTriggerInputVisibility = 'advanced' | 'default' | 'hidden' | 'important';

export interface ConnectorTriggerInputOption {
    label: string;
    value: ConnectorTriggerParameterValue;
    hasChildren?: boolean;
    selectable?: boolean;
    metadata?: unknown;
}

export interface ConnectorTriggerDynamicInput {
    kind: 'schema' | 'tree' | 'values';
    dependsOn?: string[];
    metadata: unknown;
}

export interface ConnectorTriggerInputDefinition {
    name: string;
    label: string;
    description?: string;
    type: ConnectorTriggerInputType;
    required: boolean;
    visibility?: ConnectorTriggerInputVisibility;
    sensitive?: boolean;
    allowMultiple?: boolean;
    defaultValue?: ConnectorTriggerParameterValue;
    options?: ConnectorTriggerInputOption[];
    dynamic?: ConnectorTriggerDynamicInput;
    metadata?: unknown;
}

export interface ConnectorTriggerOperationDefinition {
    inputs: ConnectorTriggerInputDefinition[];
    label?: string;
    connectorLabel?: string;
    metadata?: unknown;
}

export interface ConnectorTriggerDynamicResolution {
    inputs?: ConnectorTriggerInputDefinition[];
    options?: ConnectorTriggerInputOption[];
}

export interface ConnectorTriggerOperationResolver {
    resolveOperation(
        context: IActionContext,
        request: ConnectorTriggerOperationResolutionRequest,
    ): Promise<ConnectorTriggerOperationDefinition>;
    resolveDynamicInput(
        context: IActionContext,
        request: ConnectorTriggerDynamicResolutionRequest,
    ): Promise<ConnectorTriggerDynamicResolution>;
    serializeParameters(
        operation: ConnectorTriggerOperationDefinition,
        inputs: readonly ConnectorTriggerInputDefinition[],
        values: Readonly<Record<string, ConnectorTriggerParameterValue>>,
    ): ConnectorTriggerOperationParameter[];
}

export interface ConnectorTriggerSwaggerProvider {
    getSwagger(
        context: IActionContext,
        request: ConnectorTriggerOperationResolutionRequest,
    ): Promise<unknown>;
}

export interface ConnectorTriggerOperationResolutionRequest {
    target: ConnectorTriggerSetupTarget;
    namespace: ConnectorTriggerNamespace;
    connection: ConnectorTriggerConnection;
}

export interface ConnectorTriggerDynamicResolutionRequest extends ConnectorTriggerOperationResolutionRequest {
    operation: ConnectorTriggerOperationDefinition;
    input: ConnectorTriggerInputDefinition;
    values: Readonly<Record<string, ConnectorTriggerParameterValue>>;
    parent?: ConnectorTriggerInputOption;
}

export interface ConnectorTriggerParameterRequest extends ConnectorTriggerOperationResolutionRequest {
    operation: ConnectorTriggerOperationDefinition;
}

export interface ConnectorTriggerSetupPlan {
    target: ConnectorTriggerSetupTarget;
    namespace: ConnectorTriggerNamespacePlan;
    connection: ConnectorTriggerConnectionPlan;
    triggerConfigName: string;
    localSettings: {
        name: string;
        exists: boolean;
        environmentOverride: boolean;
        purpose: 'pollingEndpoint' | 'triggerConfig';
    }[];
}

export interface ConnectorTriggerResourceNames {
    resourceGroupName: string;
    namespaceName: string;
    connectionName: string;
    triggerConfigName: string;
}

export interface ConnectorTriggerSetupRequest {
    metadata?: ConnectorTriggerProjectMetadata;
    projectPath: string;
    /** Persistent identity of this workspace instance; distinguishes clones at the same path. */
    workspaceId: string;
    binding: ConnectorTriggerLocalBinding;
    localSettings: ConnectorTriggerSetupPlan['localSettings'];
}

export interface ConnectorTriggerSetupScopes {
    listSubscriptions(context: IActionContext, showAll: boolean): Promise<{ id: string; label: string }[]>;
    getSubscription(context: IActionContext, id: string): Promise<ConnectorTriggerSetupTarget['subscription']>;
    listRegions(context: IActionContext, subscriptionId: string): Promise<{ id: string; label: string; regionCategory?: string }[]>;
    listConnectors(context: IActionContext, scope: ConnectorTriggerSetupScope): Promise<{ id: string; label: string }[]>;
    listEvents(context: IActionContext, scope: ConnectorTriggerSetupScope, connectorId: string): Promise<{ id: string; label: string }[]>;
    signIn(context: IActionContext): Promise<void>;
}

export type ConnectorTriggerSetupScope = Pick<ConnectorTriggerSetupTarget, 'subscription' | 'region'>;

export type ConnectorTriggerSetupStatus = 'provisioning' | 'authenticating' | 'loadingParameters' | 'parameters' | 'saving';

export interface ConnectorTriggerSetupSession {
    readonly cancellationToken: CancellationToken;
    selectResources(): Promise<ConnectorTriggerSetupPlan>;
    collectParameters(request: ConnectorTriggerParameterRequest): Promise<Record<string, ConnectorTriggerParameterValue>>;
    setStatus(status: ConnectorTriggerSetupStatus): void;
    dispose(): void;
}

export interface ConnectorTriggerLocalSettingsWriter {
    /**
     * When expected is provided, throws ConnectorTriggerLocalSettingsChangedError without writing if
     * any listed setting's current value differs from the reviewed value. An undefined expected
     * value means the setting was reviewed as absent. Names match case-insensitively, like the host.
     */
    write(
        context: IActionContext,
        projectPath: string,
        values: Readonly<Record<string, string>>,
        expected?: Readonly<Record<string, string | undefined>>,
    ): Promise<void>;
}

export interface ConnectorTriggerWorkspaceIdentityStore {
    /** Returns a persistent identity for this workspace instance, creating it on first use. */
    get(projectPath: string): Promise<string>;
}

export interface ConnectorTriggerF5Runtime {
    now(): number;
    delay(milliseconds: number): Promise<void>;
    openExternal(url: string): Promise<boolean>;
    withProgress<T>(
        title: string,
        task: (token: CancellationToken) => Promise<T>,
    ): Promise<T>;
}

export interface ConnectorTriggerF5Dependencies {
    bindingResolver: ConnectorTriggerBindingResolver;
    gateway: ConnectorTriggerGateway;
    projectStore: ConnectorTriggerProjectMetadataStore;
    operationResolver: ConnectorTriggerOperationResolver;
    openSetup(context: IActionContext, request: ConnectorTriggerSetupRequest): Promise<ConnectorTriggerSetupSession>;
    localSettingsWriter?: ConnectorTriggerLocalSettingsWriter;
    workspaceIdentity?: ConnectorTriggerWorkspaceIdentityStore;
    runtime?: ConnectorTriggerF5Runtime;
    /**
     * How the caller will start the local Functions host after setup. When omitted, setup cannot
     * verify the host's polling identity and grants no connection access.
     */
    hostLaunch?: ConnectorTriggerHostLaunch;
}
