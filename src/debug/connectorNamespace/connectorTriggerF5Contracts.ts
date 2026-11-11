/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type CancellationToken } from 'vscode';
import { type ConnectorTriggerProjectMetadata } from '../../connectorTrigger/connectorTriggerProjectMetadata';
import { localize } from '../../localize';

export { type ConnectorTriggerProjectMetadata } from '../../connectorTrigger/connectorTriggerProjectMetadata';

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
        public readonly currentExisting: Readonly<Record<string, boolean>>,
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
    ensureNamespace(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        plan: ConnectorTriggerNamespacePlan,
    ): Promise<ConnectorTriggerNamespace>;
    listConnections(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
    ): Promise<ConnectorTriggerConnection[]>;
    ensureConnection(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        plan: ConnectorTriggerConnectionPlan,
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
     * Returns the Microsoft Entra principal that the local Functions host authenticates as when
     * polling, resolved from the selected authenticated Azure account. Never infer it from the
     * connection creator, which can be another user or service principal.
     */
    getPollingPrincipal(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
    ): Promise<ConnectorTriggerPrincipal>;
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
    ): Promise<ConnectorTriggerConfig>;
}

export interface ConnectorTriggerPrincipal {
    objectId: string;
    tenantId: string;
}

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
     * When expectedExisting is provided, throws ConnectorTriggerLocalSettingsChangedError without
     * writing if any listed setting's presence differs from the reviewed state.
     */
    write(
        context: IActionContext,
        projectPath: string,
        values: Readonly<Record<string, string>>,
        expectedExisting?: Readonly<Record<string, boolean>>,
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
}
