/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type CancellationToken } from 'vscode';

export type ConnectorTriggerParameterValue =
    string |
    number |
    boolean |
    null |
    ConnectorTriggerParameterValue[] |
    { [key: string]: ConnectorTriggerParameterValue };

export interface ConnectorTriggerProjectHandoff {
    version: 1;
    subscription: {
        id: string;
        tenantId: string;
        environment: {
            name: string;
            resourceManagerEndpointUrl: string;
        };
    };
    region: string;
    connectorId: string;
    operationId: string;
    catalog?: {
        source: 'bundled' | 'live' | 'remote';
    };
}

export interface ConnectorTriggerProjectHandoffStore {
    read(projectPath: string): Promise<ConnectorTriggerProjectHandoff | undefined>;
    /**
     * Records completion without removing the only recovery metadata. A no-op is valid when the
     * required local settings are the durable completion marker.
     */
    markComplete(projectPath: string): Promise<void>;
}

export interface ConnectorTriggerBindingResolver {
    /**
     * Resolves the actual Poll binding Connection prefix and TriggerConfigName setting reference
     * from project metadata. Implementations must not derive either key from Azure resource names.
     */
    resolve(
        context: IActionContext,
        projectPath: string,
        handoff: ConnectorTriggerProjectHandoff,
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
     * The persisted environment fields are identity metadata only. Implementations must resolve
     * the subscription through the current authenticated Azure account and use that live context.
     */
    listNamespaces(context: IActionContext, handoff: ConnectorTriggerProjectHandoff): Promise<ConnectorTriggerNamespace[]>;
    ensureNamespace(
        context: IActionContext,
        handoff: ConnectorTriggerProjectHandoff,
        plan: ConnectorTriggerNamespacePlan,
    ): Promise<ConnectorTriggerNamespace>;
    listConnections(
        context: IActionContext,
        handoff: ConnectorTriggerProjectHandoff,
        namespace: ConnectorTriggerNamespace,
    ): Promise<ConnectorTriggerConnection[]>;
    ensureConnection(
        context: IActionContext,
        handoff: ConnectorTriggerProjectHandoff,
        namespace: ConnectorTriggerNamespace,
        plan: ConnectorTriggerConnectionPlan,
    ): Promise<ConnectorTriggerConnection>;
    getConnection(
        context: IActionContext,
        handoff: ConnectorTriggerProjectHandoff,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
    ): Promise<ConnectorTriggerConnection>;
    /**
     * Uses the portal origin from the live resolved subscription environment as the consent
     * redirect, falling back only to the repository-standard public-cloud portal.
     */
    getConsentLink(
        context: IActionContext,
        handoff: ConnectorTriggerProjectHandoff,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
    ): Promise<string>;
    dynamicInvoke(
        context: IActionContext,
        handoff: ConnectorTriggerProjectHandoff,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
        request: ConnectorTriggerDynamicInvokeRequest,
    ): Promise<unknown>;
    ensureConnectionAccessPolicies(
        context: IActionContext,
        handoff: ConnectorTriggerProjectHandoff,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
        policies: readonly ConnectorTriggerConnectionAccessPolicy[],
    ): Promise<void>;
    /**
     * Creates or updates an enabled Poll Trigger Config without notificationDetails. The returned
     * model must include service-generated pollingEndpoints, using a GET fallback when PUT omits it.
     */
    createOrUpdateTriggerConfig(
        context: IActionContext,
        request: ConnectorTriggerConfigRequest,
    ): Promise<ConnectorTriggerConfig>;
}

export interface ConnectorTriggerConnectionAccessPolicy {
    name: string;
    principal: {
        type: 'ActiveDirectory';
        identity: {
            objectId: string;
            tenantId: string;
        };
    };
}

export interface ConnectorTriggerDynamicInvokeRequest {
    request: {
        method: string;
        path: string;
        queries?: Record<string, string>;
        headers?: Record<string, string>;
        body?: ConnectorTriggerParameterValue;
    };
}

export interface ConnectorTriggerConfigRequest {
    handoff: ConnectorTriggerProjectHandoff;
    namespace: ConnectorTriggerNamespace;
    connection: ConnectorTriggerConnection;
    triggerConfigName: string;
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
    handoff: ConnectorTriggerProjectHandoff;
    namespace: ConnectorTriggerNamespace;
    connection: ConnectorTriggerConnection;
}

export interface ConnectorTriggerDynamicResolutionRequest extends ConnectorTriggerOperationResolutionRequest {
    operation: ConnectorTriggerOperationDefinition;
    input: ConnectorTriggerInputDefinition;
    values: Readonly<Record<string, ConnectorTriggerParameterValue>>;
}

export interface ConnectorTriggerLocalSettingsWriter {
    write(
        context: IActionContext,
        projectPath: string,
        values: Readonly<Record<string, string>>,
    ): Promise<void>;
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
    handoffStore: ConnectorTriggerProjectHandoffStore;
    operationResolver: ConnectorTriggerOperationResolver;
    localSettingsWriter?: ConnectorTriggerLocalSettingsWriter;
    runtime?: ConnectorTriggerF5Runtime;
}
