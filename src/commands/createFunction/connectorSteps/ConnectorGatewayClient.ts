/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GenericResource, type ResourceManagementClient } from '@azure/arm-resources';
import { type ServiceClient } from '@azure/core-client';
import { createHttpHeaders, createPipelineRequest } from '@azure/core-rest-pipeline';
import { createGenericClient, type AzExtPipelineResponse } from '@microsoft/vscode-azext-azureutils';
import { UserCancelledError, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { STATUS_CODES } from 'http';
import { type CancellationToken } from 'vscode';
import { ConnectorNamespaceApiVersion, ConnectorNamespaceResourceType, webProvider } from '../../../constants';
import {
    createManagedApiExportUrl,
    createManagedApiUrl,
    getResourceManagerEndpoint,
    listArmPages,
    type ArmListResult,
} from '../../../connectorTrigger/connectorTriggerArm';
import { addValuesToMask, getStatusCode, isRecord } from '../../../connectorTrigger/connectorTriggerUtils';
import { localize } from '../../../localize';
import { createResourceClient } from '../../../utils/azureClients';
import { requestUtils } from '../../../utils/requestUtils';
import {
    type ConnectorConnectionCreateOrUpdateRequest,
    type ConnectorConnectionAccessPolicyCreateOrUpdateRequest,
    type ConnectorConnectionAccessPolicyResource,
    type ConnectorConnectionResource,
    type ConnectorConsentLink,
    type ConnectorDynamicInvokeRequest,
    type ConnectorDynamicInvokeResponse,
    type ConnectorGatewayCreateRequest,
    type ConnectorGatewayProperties,
    type ConnectorGatewayResource,
    type ConnectorListConsentLinksRequest,
    type ConnectorTriggerConfigCreateOrUpdateRequest,
    type ConnectorTriggerConfigResource,
} from './ConnectorGatewayModels';

export type ConnectorGatewayClientContext = IActionContext & ISubscriptionContext;

export interface ConnectorGatewayRequestOptions {
    readonly cancellationToken?: CancellationToken;
}

export interface ConnectorGatewayWriteOptions extends ConnectorGatewayRequestOptions {
    /** Sends `If-None-Match: *` so the PUT fails with 412 instead of replacing an existing resource. */
    readonly createOnly?: boolean;
}

export interface ConnectorGatewayListNamespacesOptions extends ConnectorGatewayRequestOptions {
    readonly resourceGroupName?: string;
}

export type ConnectorGatewayResourcesClient = Pick<ResourceManagementClient['resources'], 'beginCreateOrUpdateAndWait' | 'get'>;
export type ConnectorGatewayResourcesClientFactory = (context: ConnectorGatewayClientContext) => Promise<ConnectorGatewayResourcesClient>;
export type ConnectorGatewayArmClient = Pick<ServiceClient, 'sendRequest'>;
export type ConnectorGatewayArmClientFactory = (context: ConnectorGatewayClientContext) => Promise<ConnectorGatewayArmClient>;

export interface ConnectorGatewayClient {
    listNamespaces(context: ConnectorGatewayClientContext, options?: ConnectorGatewayListNamespacesOptions): Promise<ConnectorGatewayResource[]>;
    getNamespace(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, options?: ConnectorGatewayRequestOptions): Promise<ConnectorGatewayResource | undefined>;
    createNamespace(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, request: ConnectorGatewayCreateRequest, options?: ConnectorGatewayRequestOptions): Promise<ConnectorGatewayResource>;

    listConnections(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, options?: ConnectorGatewayRequestOptions): Promise<ConnectorConnectionResource[]>;
    getConnection(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, connectionName: string, options?: ConnectorGatewayRequestOptions): Promise<ConnectorConnectionResource | undefined>;
    createOrUpdateConnection(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, connectionName: string, request: ConnectorConnectionCreateOrUpdateRequest, options?: ConnectorGatewayWriteOptions): Promise<ConnectorConnectionResource>;
    listConsentLinks(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, connectionName: string, request: ConnectorListConsentLinksRequest, options?: ConnectorGatewayRequestOptions): Promise<ConnectorConsentLink[]>;
    dynamicInvoke(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, connectionName: string, request: ConnectorDynamicInvokeRequest, options?: ConnectorGatewayRequestOptions): Promise<ConnectorDynamicInvokeResponse>;
    getConnectionAccessPolicy(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, connectionName: string, accessPolicyName: string, options?: ConnectorGatewayRequestOptions): Promise<ConnectorConnectionAccessPolicyResource | undefined>;
    createOrUpdateConnectionAccessPolicy(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, connectionName: string, accessPolicyName: string, request: ConnectorConnectionAccessPolicyCreateOrUpdateRequest, options?: ConnectorGatewayRequestOptions): Promise<ConnectorConnectionAccessPolicyResource>;

    getTriggerConfig(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, triggerConfigName: string, options?: ConnectorGatewayRequestOptions): Promise<ConnectorTriggerConfigResource | undefined>;
    createOrUpdateTriggerConfig(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, triggerConfigName: string, request: ConnectorTriggerConfigCreateOrUpdateRequest, options?: ConnectorGatewayWriteOptions): Promise<ConnectorTriggerConfigResource>;

    /** Gets a regional managed API, including its connection parameters, or undefined when Azure returns 404. */
    getManagedApi(context: ConnectorGatewayClientContext, location: string, connectorId: string, options?: ConnectorGatewayRequestOptions): Promise<unknown>;
    /** Exports a regional managed API's Swagger definition, or returns undefined when Azure returns 404. */
    getManagedApiDefinition(context: ConnectorGatewayClientContext, location: string, connectorId: string, options?: ConnectorGatewayRequestOptions): Promise<unknown>;
    /** Exports a managed API's Swagger definition from a Connector Namespace, or returns undefined when Azure returns 404. */
    getNamespaceManagedApiDefinition(context: ConnectorGatewayClientContext, resourceGroupName: string, namespaceName: string, connectorId: string, options?: ConnectorGatewayRequestOptions): Promise<unknown>;
}

interface ConsentLinkListResult extends ConnectorConsentLink {
    value?: ConnectorConsentLink[];
}

type ConnectorGatewayHttpMethod = 'GET' | 'POST' | 'PUT';

type ConnectorGatewayOperation =
    | 'listNamespaces'
    | 'getNamespace'
    | 'createNamespace'
    | 'listConnections'
    | 'getConnection'
    | 'createOrUpdateConnection'
    | 'listConsentLinks'
    | 'dynamicInvoke'
    | 'getConnectionAccessPolicy'
    | 'createOrUpdateConnectionAccessPolicy'
    | 'getTriggerConfig'
    | 'createOrUpdateTriggerConfig'
    | 'getManagedApi'
    | 'getManagedApiDefinition';

export class AzureConnectorGatewayClient implements ConnectorGatewayClient {
    public constructor(
        private readonly resourcesClientFactory: ConnectorGatewayResourcesClientFactory = async context => (await createResourceClient(context)).resources,
        private readonly armClientFactory: ConnectorGatewayArmClientFactory = createArmClient,
    ) { }

    public async listNamespaces(context: ConnectorGatewayClientContext, options: ConnectorGatewayListNamespacesOptions = {}): Promise<ConnectorGatewayResource[]> {
        addValuesToMask(context, context.subscriptionId, options.resourceGroupName);
        const path = options.resourceGroupName ?
            `/subscriptions/${encodeURIComponent(context.subscriptionId)}/resourceGroups/${encodeURIComponent(options.resourceGroupName)}/providers/${webProvider}/${ConnectorNamespaceResourceType}` :
            `/subscriptions/${encodeURIComponent(context.subscriptionId)}/providers/${webProvider}/${ConnectorNamespaceResourceType}`;
        return await this.listAll(context, createArmUrl(context, path), 'listNamespaces', options);
    }

    public async getNamespace(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<ConnectorGatewayResource | undefined> {
        return await this.getNamespaceResource(context, resourceGroupName, namespaceName, 'getNamespace', options);
    }

    public async createNamespace(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        request: ConnectorGatewayCreateRequest,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<ConnectorGatewayResource> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName);
        try {
            const client = await this.resourcesClientFactory(context);
            const resource = await runWithCancellation(options.cancellationToken, async abortSignal =>
                await client.beginCreateOrUpdateAndWait(
                    resourceGroupName,
                    webProvider,
                    '',
                    ConnectorNamespaceResourceType,
                    namespaceName,
                    ConnectorNamespaceApiVersion,
                    toGenericResourceCreateRequest(request),
                    {
                        requestOptions: {
                            customHeaders: {
                                'If-None-Match': '*',
                            },
                        },
                        updateIntervalInMs: 3000,
                        ...(abortSignal ? { abortSignal } : {}),
                    },
                ));
            return toConnectorGatewayResource(resource);
        } catch (error) {
            throw translateRequestError(error, 'createNamespace', options.cancellationToken);
        }
    }

    public async listConnections(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<ConnectorConnectionResource[]> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName);
        return await this.listAll(
            context,
            createArmUrl(context, `${getNamespacePath(context, resourceGroupName, namespaceName)}/connections`),
            'listConnections',
            options,
        );
    }

    public async getConnection(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        connectionName: string,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<ConnectorConnectionResource | undefined> {
        return await this.getConnectionResource(context, resourceGroupName, namespaceName, connectionName, 'getConnection', options);
    }

    public async createOrUpdateConnection(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        connectionName: string,
        request: ConnectorConnectionCreateOrUpdateRequest,
        options: ConnectorGatewayWriteOptions = {},
    ): Promise<ConnectorConnectionResource> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName, connectionName);
        return await this.sendJson(
            context,
            'PUT',
            createArmUrl(context, getConnectionPath(context, resourceGroupName, namespaceName, connectionName)),
            'createOrUpdateConnection',
            [200, 201],
            options,
            request,
        ) as ConnectorConnectionResource;
    }

    public async listConsentLinks(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        connectionName: string,
        request: ConnectorListConsentLinksRequest,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<ConnectorConsentLink[]> {
        addValuesToMask(
            context,
            context.subscriptionId,
            resourceGroupName,
            namespaceName,
            connectionName,
            ...request.parameters?.flatMap(parameter => [
                parameter.objectId,
                parameter.redirectUrl,
                parameter.tenantId,
            ]) ?? [],
        );
        const result = await this.sendJson(
            context,
            'POST',
            createArmUrl(context, `${getConnectionPath(context, resourceGroupName, namespaceName, connectionName)}/listConsentLinks`),
            'listConsentLinks',
            [200],
            options,
            request,
        ) as ConsentLinkListResult;
        const links = Array.isArray(result.value) ?
            result.value :
            result.link || result.firstPartyLoginUri || result.displayName || result.status ?
                [result] :
                [];
        for (const link of links) {
            addValuesToMask(context, link.link, link.firstPartyLoginUri);
        }
        return links;
    }

    public async dynamicInvoke(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        connectionName: string,
        request: ConnectorDynamicInvokeRequest,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<ConnectorDynamicInvokeResponse> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName, connectionName);
        const result = await this.sendJson(
            context,
            'POST',
            createArmUrl(context, `${getConnectionPath(context, resourceGroupName, namespaceName, connectionName)}/dynamicInvoke`),
            'dynamicInvoke',
            [200],
            options,
            request,
        ) as ConnectorDynamicInvokeResponse;
        throwIfDynamicInvokeFailed(result);
        return result;
    }

    public async getConnectionAccessPolicy(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        connectionName: string,
        accessPolicyName: string,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<ConnectorConnectionAccessPolicyResource | undefined> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName, connectionName, accessPolicyName);
        return await this.sendJson(
            context,
            'GET',
            createArmUrl(context, getConnectionAccessPolicyPath(context, resourceGroupName, namespaceName, connectionName, accessPolicyName)),
            'getConnectionAccessPolicy',
            [200],
            options,
            undefined,
            true,
        ) as ConnectorConnectionAccessPolicyResource | undefined;
    }

    public async createOrUpdateConnectionAccessPolicy(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        connectionName: string,
        accessPolicyName: string,
        request: ConnectorConnectionAccessPolicyCreateOrUpdateRequest,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<ConnectorConnectionAccessPolicyResource> {
        addValuesToMask(
            context,
            context.subscriptionId,
            resourceGroupName,
            namespaceName,
            connectionName,
            accessPolicyName,
            request.properties.principal.identity.objectId,
            request.properties.principal.identity.tenantId,
        );
        return await this.sendJson(
            context,
            'PUT',
            createArmUrl(context, getConnectionAccessPolicyPath(context, resourceGroupName, namespaceName, connectionName, accessPolicyName)),
            'createOrUpdateConnectionAccessPolicy',
            [200, 201],
            options,
            request,
        ) as ConnectorConnectionAccessPolicyResource;
    }

    public async getTriggerConfig(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        triggerConfigName: string,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<ConnectorTriggerConfigResource | undefined> {
        const triggerConfig = await this.getTriggerConfigResource(context, resourceGroupName, namespaceName, triggerConfigName, 'getTriggerConfig', options);
        maskPollingEndpoints(context, triggerConfig ? [triggerConfig] : []);
        return triggerConfig;
    }

    public async createOrUpdateTriggerConfig(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        triggerConfigName: string,
        request: ConnectorTriggerConfigCreateOrUpdateRequest,
        options: ConnectorGatewayWriteOptions = {},
    ): Promise<ConnectorTriggerConfigResource> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName, triggerConfigName);
        const triggerConfig = await this.sendJson(
            context,
            'PUT',
            createArmUrl(context, getTriggerConfigPath(context, resourceGroupName, namespaceName, triggerConfigName)),
            'createOrUpdateTriggerConfig',
            [200, 201],
            options,
            request,
        ) as ConnectorTriggerConfigResource;
        maskPollingEndpoints(context, [triggerConfig]);
        return triggerConfig;
    }

    public async getManagedApi(
        context: ConnectorGatewayClientContext,
        location: string,
        connectorId: string,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<unknown> {
        addValuesToMask(context, context.subscriptionId, location, connectorId);
        return await this.sendJson(
            context,
            'GET',
            createManagedApiUrl(context, location, connectorId),
            'getManagedApi',
            [200],
            options,
            undefined,
            true,
        );
    }

    public async getManagedApiDefinition(
        context: ConnectorGatewayClientContext,
        location: string,
        connectorId: string,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<unknown> {
        addValuesToMask(context, context.subscriptionId, location, connectorId);
        return await this.sendJson(
            context,
            'GET',
            createManagedApiExportUrl(context, location, connectorId),
            'getManagedApiDefinition',
            [200],
            options,
            undefined,
            true,
        );
    }

    public async getNamespaceManagedApiDefinition(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        connectorId: string,
        options: ConnectorGatewayRequestOptions = {},
    ): Promise<unknown> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName, connectorId);
        return await this.sendJson(
            context,
            'GET',
            createArmUrl(
                context,
                `${getNamespacePath(context, resourceGroupName, namespaceName)}/managedApis/${encodeURIComponent(connectorId)}`,
                { export: 'true' },
            ),
            'getManagedApiDefinition',
            [200],
            options,
            undefined,
            true,
        );
    }

    private async getNamespaceResource(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        operation: 'getNamespace',
        options: ConnectorGatewayRequestOptions,
    ): Promise<ConnectorGatewayResource | undefined> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName);
        try {
            const client = await this.resourcesClientFactory(context);
            const resource = await runWithCancellation(options.cancellationToken, async abortSignal =>
                abortSignal ?
                    await client.get(
                        resourceGroupName,
                        webProvider,
                        '',
                        ConnectorNamespaceResourceType,
                        namespaceName,
                        ConnectorNamespaceApiVersion,
                        { abortSignal },
                    ) :
                    await client.get(
                        resourceGroupName,
                        webProvider,
                        '',
                        ConnectorNamespaceResourceType,
                        namespaceName,
                        ConnectorNamespaceApiVersion,
                    ));
            return toConnectorGatewayResource(resource);
        } catch (error) {
            if (getStatusCode(error) === 404) {
                return undefined;
            }

            throw translateRequestError(error, operation, options.cancellationToken);
        }
    }

    private async getConnectionResource(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        connectionName: string,
        operation: 'getConnection',
        options: ConnectorGatewayRequestOptions,
    ): Promise<ConnectorConnectionResource | undefined> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName, connectionName);
        return await this.sendJson(
            context,
            'GET',
            createArmUrl(context, getConnectionPath(context, resourceGroupName, namespaceName, connectionName)),
            operation,
            [200],
            options,
            undefined,
            true,
        ) as ConnectorConnectionResource | undefined;
    }

    private async getTriggerConfigResource(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        namespaceName: string,
        triggerConfigName: string,
        operation: 'getTriggerConfig',
        options: ConnectorGatewayRequestOptions,
    ): Promise<ConnectorTriggerConfigResource | undefined> {
        addValuesToMask(context, context.subscriptionId, resourceGroupName, namespaceName, triggerConfigName);
        return await this.sendJson(
            context,
            'GET',
            createArmUrl(context, getTriggerConfigPath(context, resourceGroupName, namespaceName, triggerConfigName)),
            operation,
            [200],
            options,
            undefined,
            true,
        ) as ConnectorTriggerConfigResource | undefined;
    }

    private async listAll<T>(
        context: ConnectorGatewayClientContext,
        initialUrl: string,
        operation: ConnectorGatewayOperation,
        options: ConnectorGatewayRequestOptions,
    ): Promise<T[]> {
        const client = await this.getArmClient(context, operation, options.cancellationToken);
        return await listArmPages<T>(
            initialUrl,
            async url => {
                const response = await this.sendJsonWithClient<ArmListResult<T>>(client, 'GET', url, operation, [200], options);
                if (!response || response.value !== undefined && !Array.isArray(response.value)) {
                    throw createInvalidResponseError(operation);
                }
                return response;
            },
            {
                pagingLoop: () => new Error(localize(
                    'connectorGatewayPagingLoop',
                    'Azure returned an invalid paging link while attempting to {0}.',
                    getOperationLabel(operation),
                )),
                invalidNextLink: () => createInvalidResponseError(operation),
                invalidOrigin: () => new Error(localize(
                    'connectorGatewayInvalidPagingOrigin',
                    'Azure returned an invalid paging host while attempting to {0}.',
                    getOperationLabel(operation),
                )),
            },
        );
    }

    private async sendJson(
        context: ConnectorGatewayClientContext,
        method: ConnectorGatewayHttpMethod,
        url: string,
        operation: ConnectorGatewayOperation,
        expectedStatuses: readonly number[],
        options: ConnectorGatewayWriteOptions,
        body?: unknown,
        allowNotFound = false,
    ): Promise<unknown> {
        const client = await this.getArmClient(context, operation, options.cancellationToken);
        return await this.sendJsonWithClient(client, method, url, operation, expectedStatuses, options, body, allowNotFound);
    }

    private async sendJsonWithClient<T>(
        client: ConnectorGatewayArmClient,
        method: ConnectorGatewayHttpMethod,
        url: string,
        operation: ConnectorGatewayOperation,
        expectedStatuses: readonly number[],
        options: ConnectorGatewayWriteOptions,
        body?: unknown,
        allowNotFound = false,
    ): Promise<T | undefined> {
        try {
            const response = await runWithCancellation(options.cancellationToken, async abortSignal => {
                const requestOptions: Parameters<typeof createPipelineRequest>[0] = {
                    method,
                    url,
                    ...(abortSignal ? { abortSignal } : {}),
                    ...(body === undefined ? {} : {
                        body: JSON.stringify(body),
                        headers: createHttpHeaders({
                            'Content-Type': 'application/json',
                            ...(options.createOnly ? { 'If-None-Match': '*' } : {}),
                        }),
                    }),
                };
                return await client.sendRequest(createPipelineRequest(requestOptions)) as AzExtPipelineResponse;
            });
            if (allowNotFound && response.status === 404) {
                return undefined;
            }
            if (!expectedStatuses.includes(response.status)) {
                throw createResponseError(operation, response);
            }
            return response.parsedBody as T;
        } catch (error) {
            if (allowNotFound && getStatusCode(error) === 404) {
                return undefined;
            }

            throw translateRequestError(error, operation, options.cancellationToken);
        }
    }

    private async getArmClient(
        context: ConnectorGatewayClientContext,
        operation: ConnectorGatewayOperation,
        cancellationToken: CancellationToken | undefined,
    ): Promise<ConnectorGatewayArmClient> {
        throwIfCancelled(cancellationToken);
        try {
            return await this.armClientFactory(context);
        } catch (error) {
            throw translateRequestError(error, operation, cancellationToken);
        }
    }
}

async function createArmClient(context: ConnectorGatewayClientContext): Promise<ConnectorGatewayArmClient> {
    return await createGenericClient(context, context);
}

async function runWithCancellation<T>(
    cancellationToken: CancellationToken | undefined,
    action: (abortSignal: AbortSignal | undefined) => Promise<T>,
): Promise<T> {
    throwIfCancelled(cancellationToken);
    if (!cancellationToken) {
        return await action(undefined);
    }

    const controller = new AbortController();
    const subscription = cancellationToken.onCancellationRequested(() => controller.abort());
    try {
        return await action(controller.signal);
    } catch (error) {
        if (cancellationToken.isCancellationRequested) {
            throw new UserCancelledError('connectorGatewayRequest');
        }
        throw error;
    } finally {
        subscription.dispose();
    }
}

function throwIfCancelled(cancellationToken: CancellationToken | undefined): void {
    if (cancellationToken?.isCancellationRequested) {
        throw new UserCancelledError('connectorGatewayRequest');
    }
}

function createArmUrl(context: ISubscriptionContext, path: string, query: Record<string, string> = {}): string {
    return requestUtils.createRequestUrl(`${getResourceManagerEndpoint(context)}${path}`, {
        'api-version': ConnectorNamespaceApiVersion,
        ...query,
    });
}

function getNamespacePath(
    context: ISubscriptionContext,
    resourceGroupName: string,
    namespaceName: string,
): string {
    return `/subscriptions/${encodeURIComponent(context.subscriptionId)}` +
        `/resourceGroups/${encodeURIComponent(resourceGroupName)}` +
        `/providers/${webProvider}/${ConnectorNamespaceResourceType}/${encodeURIComponent(namespaceName)}`;
}

function getConnectionPath(
    context: ISubscriptionContext,
    resourceGroupName: string,
    namespaceName: string,
    connectionName: string,
): string {
    return `${getNamespacePath(context, resourceGroupName, namespaceName)}/connections/${encodeURIComponent(connectionName)}`;
}

function getConnectionAccessPolicyPath(
    context: ISubscriptionContext,
    resourceGroupName: string,
    namespaceName: string,
    connectionName: string,
    accessPolicyName: string,
): string {
    return `${getConnectionPath(context, resourceGroupName, namespaceName, connectionName)}` +
        `/accessPolicies/${encodeURIComponent(accessPolicyName)}`;
}

function getTriggerConfigPath(
    context: ISubscriptionContext,
    resourceGroupName: string,
    namespaceName: string,
    triggerConfigName: string,
): string {
    return `${getNamespacePath(context, resourceGroupName, namespaceName)}/triggerconfigs/${encodeURIComponent(triggerConfigName)}`;
}

function toConnectorGatewayResource(resource: GenericResource): ConnectorGatewayResource {
    return {
        id: resource.id,
        name: resource.name,
        type: resource.type,
        location: resource.location,
        tags: resource.tags,
        identity: resource.identity ? {
            type: resource.identity.type,
            principalId: resource.identity.principalId,
            tenantId: resource.identity.tenantId,
            userAssignedIdentities: resource.identity.userAssignedIdentities,
        } : undefined,
        managedBy: resource.managedBy,
        properties: parseConnectorGatewayProperties(resource.properties),
    };
}

function toGenericResourceCreateRequest(request: ConnectorGatewayCreateRequest): GenericResource {
    return {
        location: request.location,
        ...(request.tags ? { tags: { ...request.tags } } : {}),
        ...(request.identity ? {
            identity: {
                ...(request.identity.type ? { type: request.identity.type } : {}),
                ...(request.identity.userAssignedIdentities ? {
                    userAssignedIdentities: { ...request.identity.userAssignedIdentities },
                } : {}),
            },
        } : {}),
        ...(request.managedBy ? { managedBy: request.managedBy } : {}),
        properties: request.properties ? { ...request.properties } : {},
    };
}

function parseConnectorGatewayProperties(value: unknown): ConnectorGatewayProperties | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    return {
        provisioningState: getString(value.provisioningState) as ConnectorGatewayProperties['provisioningState'],
        aiGatewayId: getString(value.aiGatewayId),
        connectorGatewayId: getString(value.connectorGatewayId),
    };
}

function throwIfDynamicInvokeFailed(response: ConnectorDynamicInvokeResponse): void {
    const statusCode = getHttpStatusCode(response.response?.statusCode);
    if (statusCode === undefined || statusCode < 400) {
        return;
    }

    throw createSafeError('dynamicInvoke', statusCode, undefined);
}

function getHttpStatusCode(value: number | string | undefined): number | undefined {
    if (typeof value === 'number') {
        return value;
    }
    if (!value) {
        return undefined;
    }

    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
        return parsed;
    }

    const normalized = normalizeStatusName(value);
    const aliases: Readonly<Record<string, number>> = {
        requestentitytoolarge: 413,
        requesturitoolong: 414,
        requestedrangenotsatisfiable: 416,
    };
    if (aliases[normalized]) {
        return aliases[normalized];
    }
    for (const [code, label] of Object.entries(STATUS_CODES)) {
        if (label && normalizeStatusName(label) === normalized) {
            return Number(code);
        }
    }
    return undefined;
}

function normalizeStatusName(value: string): string {
    return value.replace(/[^a-z\d]/gi, '').toLowerCase();
}

function translateRequestError(
    error: unknown,
    operation: ConnectorGatewayOperation,
    cancellationToken: CancellationToken | undefined,
): Error {
    if (error instanceof UserCancelledError || cancellationToken?.isCancellationRequested) {
        return new UserCancelledError('connectorGatewayRequest');
    }
    if (isSafeConnectorGatewayError(error)) {
        return error;
    }

    return createSafeError(operation, getStatusCode(error), getServiceErrorCode(error));
}

function createResponseError(operation: ConnectorGatewayOperation, response: AzExtPipelineResponse): Error {
    return createSafeError(operation, response.status, getServiceErrorCode(response.parsedBody));
}

function createSafeError(
    operation: ConnectorGatewayOperation,
    statusCode: number | undefined,
    serviceCode: string | undefined,
): Error {
    if (statusCode !== undefined) {
        const error = new Error(localize(
            'connectorGatewayRequestFailedWithStatus',
            'Unable to {0}. Azure returned HTTP {1}{2}.',
            getOperationLabel(operation),
            statusCode,
            serviceCode ? ` (${serviceCode})` : '',
        ));
        // Lets callers distinguish expected failures, such as a create conflict, from other errors.
        Object.defineProperty(error, 'statusCode', { value: statusCode });
        return markSafeConnectorGatewayError(error);
    }

    return markSafeConnectorGatewayError(new Error(localize(
        'connectorGatewayRequestFailed',
        'Unable to {0}. Verify your Azure sign-in and network connection, then try again.',
        getOperationLabel(operation),
    )));
}

function createInvalidResponseError(operation: ConnectorGatewayOperation): Error {
    return markSafeConnectorGatewayError(new Error(localize(
        'connectorGatewayInvalidResponse',
        'Azure returned an invalid response while attempting to {0}.',
        getOperationLabel(operation),
    )));
}

function getOperationLabel(operation: ConnectorGatewayOperation): string {
    switch (operation) {
        case 'listNamespaces':
            return localize('connectorGatewayListNamespacesOperation', 'list Connector Namespaces');
        case 'getNamespace':
            return localize('connectorGatewayGetNamespaceOperation', 'get the Connector Namespace');
        case 'createNamespace':
            return localize('connectorGatewayCreateNamespaceOperation', 'create the Connector Namespace');
        case 'listConnections':
            return localize('connectorGatewayListConnectionsOperation', 'list connector connections');
        case 'getConnection':
            return localize('connectorGatewayGetConnectionOperation', 'get the connector connection');
        case 'createOrUpdateConnection':
            return localize('connectorGatewayCreateConnectionOperation', 'create or update the connector connection');
        case 'listConsentLinks':
            return localize('connectorGatewayListConsentLinksOperation', 'get the connector consent link');
        case 'dynamicInvoke':
            return localize('connectorGatewayDynamicInvokeOperation', 'invoke the connector');
        case 'getConnectionAccessPolicy':
            return localize('connectorGatewayGetConnectionAccessPolicyOperation', 'get the connector connection access policy');
        case 'createOrUpdateConnectionAccessPolicy':
            return localize('connectorGatewayCreateConnectionAccessPolicyOperation', 'create or update the connector connection access policy');
        case 'getTriggerConfig':
            return localize('connectorGatewayGetTriggerConfigOperation', 'get the Trigger Config');
        case 'createOrUpdateTriggerConfig':
            return localize('connectorGatewayCreateTriggerConfigOperation', 'create or update the Trigger Config');
        case 'getManagedApi':
            return localize('connectorGatewayGetManagedApiOperation', 'get the connector metadata');
        case 'getManagedApiDefinition':
            return localize('connectorGatewayGetManagedApiDefinitionOperation', 'get the connector definition');
        default:
            return operation;
    }
}

function getServiceErrorCode(value: unknown): string | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const code = getString(value.code) ??
        (isRecord(value.error) ? getString(value.error.code) : undefined) ??
        (isRecord(value.response) ? getServiceErrorCode(value.response.parsedBody) : undefined);
    return code && /^[a-z\d_.-]{1,100}$/i.test(code) ? code : undefined;
}

function getString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function maskPollingEndpoints(context: IActionContext, triggerConfigs: readonly ConnectorTriggerConfigResource[]): void {
    for (const triggerConfig of triggerConfigs) {
        const endpoints = triggerConfig.properties?.pollingEndpoints;
        addValuesToMask(
            context,
            endpoints?.receiveUri,
            endpoints?.acknowledgeUri,
            endpoints?.hasMessagesUri,
            endpoints?.approximateQueueDepthUri,
        );
    }
}

const safeConnectorGatewayError = Symbol('safeConnectorGatewayError');

type SafeConnectorGatewayError = Error & {
    [safeConnectorGatewayError]: true;
};

function markSafeConnectorGatewayError(error: Error): SafeConnectorGatewayError {
    Object.defineProperty(error, safeConnectorGatewayError, { value: true });
    return error as SafeConnectorGatewayError;
}

function isSafeConnectorGatewayError(error: unknown): error is SafeConnectorGatewayError {
    return error instanceof Error && safeConnectorGatewayError in error;
}
