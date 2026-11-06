/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceManagementClient } from '@azure/arm-resources';
import { type ServiceClient } from '@azure/core-client';
import { createPipelineRequest } from '@azure/core-rest-pipeline';
import {
    createGenericClient,
    parseAzureResourceId,
    VerifyProvidersStep,
    type AzExtPipelineResponse,
} from '@microsoft/vscode-azext-azureutils';
import {
    createSubscriptionContext,
    type IActionContext,
    type ISubscriptionContext,
} from '@microsoft/vscode-azext-utils';
import { ConnectorNamespaceApiVersion, webProvider } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { createResourceClient } from '../../utils/azureClients';
import { requestUtils } from '../../utils/requestUtils';
import {
    AzureConnectorGatewayClient,
    type ConnectorGatewayClient,
    type ConnectorGatewayClientContext,
} from '../../commands/createFunction/connectorSteps/ConnectorGatewayClient';
import {
    type ConnectorConnectionResource,
    type ConnectorGatewayResource,
    type ConnectorTriggerConfigResource,
} from '../../commands/createFunction/connectorSteps/ConnectorGatewayModels';
import {
    type ConnectorTriggerConfig,
    type ConnectorTriggerConfigRequest,
    type ConnectorTriggerConnection,
    type ConnectorTriggerConnectionAccessPolicy,
    type ConnectorTriggerConnectionPlan,
    type ConnectorTriggerDynamicInvokeRequest,
    type ConnectorTriggerGateway,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerNamespacePlan,
    type ConnectorTriggerOperationResolutionRequest,
    type ConnectorTriggerSetupTarget,
    type ConnectorTriggerSwaggerProvider,
} from './connectorTriggerF5Contracts';

const managedApiSwaggerApiVersion = '2022-09-01-preview';

export type LiveConnectorSubscriptionProvider = () => Promise<ISubscriptionContext[]>;
export type ConnectorResourceGroupsClient = Pick<
    ResourceManagementClient['resourceGroups'],
    'createOrUpdate' | 'get'
>;
export type ConnectorResourceGroupsClientFactory =
    (context: ConnectorGatewayClientContext) => Promise<ConnectorResourceGroupsClient>;
export type ConnectorSwaggerArmClient = Pick<ServiceClient, 'sendRequest'>;
export type ConnectorSwaggerArmClientFactory =
    (context: ConnectorGatewayClientContext) => Promise<ConnectorSwaggerArmClient>;
export type ConnectorProviderVerifier =
    (context: ConnectorGatewayClientContext) => Promise<void>;

export class LiveConnectorSubscriptionResolver {
    public constructor(
        private readonly subscriptionsProvider: LiveConnectorSubscriptionProvider = getLiveSubscriptions,
    ) { }

    public async resolve(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
    ): Promise<ConnectorGatewayClientContext> {
        maskValues(
            context,
            target.subscription.id,
            target.subscription.tenantId,
            target.subscription.environment.name,
            target.subscription.environment.resourceManagerEndpointUrl,
        );
        const subscription = (await this.subscriptionsProvider())
            .find(candidate => candidate.subscriptionId === target.subscription.id);
        if (subscription) {
            maskValues(
                context,
                subscription.subscriptionId,
                subscription.tenantId,
                subscription.environment.name,
                subscription.environment.resourceManagerEndpointUrl,
            );
        }
        const liveCloud = subscription ? normalizeCloud(subscription.environment.name) : undefined;
        const selectedCloud = normalizeCloud(target.subscription.environment.name);
        const liveEndpoint = subscription ?
            normalizeEndpoint(subscription.environment.resourceManagerEndpointUrl) :
            undefined;
        const selectedEndpoint =
            normalizeEndpoint(target.subscription.environment.resourceManagerEndpointUrl);
        if (!subscription ||
            !equalsIgnoreCase(subscription.tenantId, target.subscription.tenantId) ||
            !liveCloud ||
            !selectedCloud ||
            liveCloud !== selectedCloud ||
            !liveEndpoint ||
            !selectedEndpoint ||
            liveEndpoint !== selectedEndpoint) {
            throw new Error(localize(
                'connectorTriggerSubscriptionMismatch',
                'The selected Connector Trigger subscription is not available in the current Azure sign-in.',
            ));
        }

        return Object.assign({}, context, subscription);
    }
}

export class AzureConnectorTriggerGatewayAdapter implements ConnectorTriggerGateway, ConnectorTriggerSwaggerProvider {
    public constructor(
        private readonly client: ConnectorGatewayClient = new AzureConnectorGatewayClient(),
        private readonly subscriptionResolver = new LiveConnectorSubscriptionResolver(),
        private readonly resourceGroupsClientFactory: ConnectorResourceGroupsClientFactory =
            async context => (await createResourceClient(context)).resourceGroups,
        private readonly swaggerClientFactory: ConnectorSwaggerArmClientFactory =
            async context => await createGenericClient(context, context),
        private readonly providerVerifier: ConnectorProviderVerifier = verifyConnectorProvider,
    ) { }

    public async listNamespaces(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
    ): Promise<ConnectorTriggerNamespace[]> {
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        return (await this.client.listNamespaces(liveContext))
            .map(resource => requireNamespace(resource));
    }

    public async ensureNamespace(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        plan: ConnectorTriggerNamespacePlan,
    ): Promise<ConnectorTriggerNamespace> {
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        const resourceGroupName = plan.kind === 'existing' ?
            plan.namespace.resourceGroupName :
            plan.resourceGroupName;
        const namespaceName = plan.kind === 'existing' ?
            plan.namespace.name :
            plan.namespaceName;
        const existing = await this.client.getNamespace(
            liveContext,
            resourceGroupName,
            namespaceName,
        );
        if (existing) {
            return requireNamespaceInRegion(existing, target.region);
        }
        if (plan.kind === 'existing') {
            throw new Error(localize(
                'connectorNamespaceNoLongerExists',
                'The selected Connector Namespace no longer exists.',
            ));
        }

        await this.providerVerifier(liveContext);
        await this.ensureResourceGroup(liveContext, resourceGroupName, target.region);
        try {
            return requireNamespaceInRegion(await this.client.createNamespace(
                liveContext,
                resourceGroupName,
                namespaceName,
                {
                    location: target.region,
                    identity: { type: 'SystemAssigned' },
                    properties: {},
                },
            ), target.region);
        } catch (error) {
            const concurrentlyCreated = await this.client.getNamespace(
                liveContext,
                resourceGroupName,
                namespaceName,
            );
            if (concurrentlyCreated) {
                return requireNamespaceInRegion(concurrentlyCreated, target.region);
            }
            throw error;
        }
    }

    public async listConnections(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
    ): Promise<ConnectorTriggerConnection[]> {
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        return (await this.client.listConnections(
            liveContext,
            namespace.resourceGroupName,
            namespace.name,
        )).map(resource => requireConnection(resource));
    }

    public async ensureConnection(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        plan: ConnectorTriggerConnectionPlan,
    ): Promise<ConnectorTriggerConnection> {
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        const connectionName = plan.kind === 'existing' ?
            plan.connection.name :
            plan.connectionName;
        const existing = await this.client.getConnection(
            liveContext,
            namespace.resourceGroupName,
            namespace.name,
            connectionName,
        );
        if (existing) {
            const connection = requireConnection(existing);
            if (!equalsIgnoreCase(connection.connectorId, target.connectorId)) {
                throw new Error(localize(
                    'connectorConnectionTypeMismatch',
                    'The selected connector connection belongs to a different connector.',
                ));
            }
            return connection;
        }
        if (plan.kind === 'existing') {
            throw new Error(localize(
                'connectorConnectionNoLongerExists',
                'The selected connector connection no longer exists.',
            ));
        }

        return requireConnection(await this.client.createOrUpdateConnection(
            liveContext,
            namespace.resourceGroupName,
            namespace.name,
            connectionName,
            {
                location: namespace.location,
                properties: {
                    connectorName: target.connectorId,
                    displayName: connectionName,
                },
            },
        ));
    }

    public async getConnection(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
    ): Promise<ConnectorTriggerConnection> {
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        const resource = await this.client.getConnection(
            liveContext,
            namespace.resourceGroupName,
            namespace.name,
            connection.name,
        );
        if (!resource) {
            throw new Error(localize(
                'connectorConnectionNoLongerExists',
                'The selected connector connection no longer exists.',
            ));
        }
        return requireConnection(resource);
    }

    public async getConsentLink(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
    ): Promise<string> {
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        const redirectUrl = getConsentRedirectUrl(liveContext);
        const links = await this.client.listConsentLinks(
            liveContext,
            namespace.resourceGroupName,
            namespace.name,
            connection.name,
            {
                parameters: [{
                    parameterName: 'token',
                    redirectUrl,
                    objectId: connection.createdBy?.objectId,
                    tenantId: connection.createdBy?.tenantId,
                }],
            },
        );
        const link = links.map(item => item.link).find(value => isHttpsUrl(value));
        if (!link) {
            throw new Error(localize(
                'connectorConsentLinkUnavailable',
                'Azure did not return a valid connector sign-in link.',
            ));
        }
        return link;
    }

    public async dynamicInvoke(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
        request: ConnectorTriggerDynamicInvokeRequest,
    ): Promise<unknown> {
        maskValues(
            context,
            request.request.path,
            ...Object.values(request.request.queries ?? {}),
            ...Object.values(request.request.headers ?? {}),
        );
        maskJsonValue(context, request.request.body);
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        return await this.client.dynamicInvoke(
            liveContext,
            namespace.resourceGroupName,
            namespace.name,
            connection.name,
            request,
        );
    }

    public async ensureConnectionAccessPolicies(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        connection: ConnectorTriggerConnection,
        policies: readonly ConnectorTriggerConnectionAccessPolicy[],
    ): Promise<void> {
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        for (const policy of policies) {
            const existing = await this.client.getConnectionAccessPolicy(
                liveContext,
                namespace.resourceGroupName,
                namespace.name,
                connection.name,
                policy.name,
            );
            if (accessPoliciesEqual(existing, policy)) {
                continue;
            }
            await this.client.createOrUpdateConnectionAccessPolicy(
                liveContext,
                namespace.resourceGroupName,
                namespace.name,
                connection.name,
                policy.name,
                {
                    location: namespace.location,
                    properties: {
                        principal: policy.principal,
                    },
                },
            );
        }
    }

    public async createOrUpdateTriggerConfig(
        context: IActionContext,
        request: ConnectorTriggerConfigRequest,
    ): Promise<ConnectorTriggerConfig> {
        for (const parameter of request.parameters) {
            maskJsonValue(context, parameter.value);
        }
        const liveContext = await this.subscriptionResolver.resolve(context, request.target);
        let resource = await this.client.createOrUpdateTriggerConfig(
            liveContext,
            request.namespace.resourceGroupName,
            request.namespace.name,
            request.triggerConfigName,
            {
                location: request.namespace.location,
                properties: {
                    state: request.state,
                    deliveryMode: request.deliveryMode,
                    type: request.type,
                    connectionDetails: {
                        connectorName: request.target.connectorId,
                        connectionName: request.connection.name,
                    },
                    operationName: request.target.operationId,
                    parameters: request.parameters,
                },
            },
        );
        if (!resource.properties?.pollingEndpoints?.receiveUri) {
            resource = await this.client.getTriggerConfig(
                liveContext,
                request.namespace.resourceGroupName,
                request.namespace.name,
                request.triggerConfigName,
            ) ?? resource;
        }
        return requireTriggerConfig(resource);
    }

    public async getSwagger(
        context: IActionContext,
        request: ConnectorTriggerOperationResolutionRequest,
    ): Promise<unknown> {
        const liveContext = await this.subscriptionResolver.resolve(context, request.target);
        const client = await this.swaggerClientFactory(liveContext);
        const endpoint = liveContext.environment.resourceManagerEndpointUrl.replace(/\/+$/, '');
        const namespacePath =
            `/subscriptions/${encodeURIComponent(liveContext.subscriptionId)}` +
            `/resourceGroups/${encodeURIComponent(request.namespace.resourceGroupName)}` +
            `/providers/Microsoft.Web/connectorGateways/${encodeURIComponent(request.namespace.name)}` +
            `/managedApis/${encodeURIComponent(request.target.connectorId)}`;
        const namespaceUrl = requestUtils.createRequestUrl(
            `${endpoint}${namespacePath}`,
            {
                'api-version': ConnectorNamespaceApiVersion,
                export: 'true',
            },
        );
        const namespaceSwagger = await tryGetSwagger(context, client, namespaceUrl);
        if (namespaceSwagger) {
            return namespaceSwagger;
        }

        const location = normalizeLocation(request.target.region);
        const locationUrl = requestUtils.createRequestUrl(
            `${endpoint}/subscriptions/${encodeURIComponent(liveContext.subscriptionId)}` +
            `/providers/Microsoft.Web/locations/${encodeURIComponent(location)}` +
            `/managedApis/${encodeURIComponent(request.target.connectorId)}`,
            {
                'api-version': managedApiSwaggerApiVersion,
                export: 'true',
            },
        );
        const locationSwagger = await tryGetSwagger(context, client, locationUrl);
        if (!locationSwagger) {
            throw new Error(localize(
                'connectorSwaggerUnavailable',
                'The selected connector event definition could not be loaded from Azure.',
            ));
        }
        return locationSwagger;
    }

    private async ensureResourceGroup(
        context: ConnectorGatewayClientContext,
        resourceGroupName: string,
        location: string,
    ): Promise<void> {
        const client = await this.resourceGroupsClientFactory(context);
        try {
            await client.get(resourceGroupName);
        } catch (error) {
            if (getStatusCode(error) !== 404) {
                throw error;
            }
            await client.createOrUpdate(resourceGroupName, { location });
        }
    }
}

async function getLiveSubscriptions(): Promise<ISubscriptionContext[]> {
    return (await ext.rgApi.getSubscriptions(false)).map(subscription =>
        createSubscriptionContext(subscription));
}

async function verifyConnectorProvider(context: ConnectorGatewayClientContext): Promise<void> {
    const step = new VerifyProvidersStep<ConnectorGatewayClientContext>([webProvider]);
    if (step.shouldExecute(context)) {
        await step.execute(context, { report: () => undefined });
    }
}

async function tryGetSwagger(
    context: IActionContext,
    client: ConnectorSwaggerArmClient,
    url: string,
): Promise<unknown | undefined> {
    maskValues(context, url);
    try {
        const response = await client.sendRequest(createPipelineRequest({
            method: 'GET',
            url,
        })) as AzExtPipelineResponse;
        return response.status === 200 ? response.parsedBody : undefined;
    } catch {
        return undefined;
    }
}

function requireNamespaceInRegion(resource: ConnectorGatewayResource, region: string): ConnectorTriggerNamespace {
    const namespace = requireNamespace(resource);
    if (normalizeLocation(namespace.location) !== normalizeLocation(region)) {
        throw new Error(localize(
            'connectorNamespaceRegionMismatch',
            'The Connector Namespace is not in the selected region. Restart debugging and choose a namespace in that region or a different new name.',
        ));
    }
    return namespace;
}

function requireNamespace(resource: ConnectorGatewayResource): ConnectorTriggerNamespace {
    if (!resource.id || !resource.name || !resource.location) {
        throw new Error(localize(
            'invalidConnectorNamespaceResponse',
            'Azure returned an invalid Connector Namespace.',
        ));
    }
    return {
        id: resource.id,
        name: resource.name,
        resourceGroupName: parseAzureResourceId(resource.id).resourceGroup,
        location: resource.location,
        identity: resource.identity ? {
            principalId: resource.identity.principalId,
            tenantId: resource.identity.tenantId,
        } : undefined,
    };
}

function requireConnection(resource: ConnectorConnectionResource): ConnectorTriggerConnection {
    if (!resource.id || !resource.name || !resource.properties?.connectorName) {
        throw new Error(localize(
            'invalidConnectorConnectionResponse',
            'Azure returned an invalid connector connection.',
        ));
    }
    return {
        id: resource.id,
        name: resource.name,
        connectorId: resource.properties.connectorName,
        status: resource.properties.overallStatus ?? resource.properties.statuses?.[0]?.status,
        createdBy: resource.properties.createdBy ? {
            objectId: resource.properties.createdBy.objectId,
            tenantId: resource.properties.createdBy.tenantId,
        } : undefined,
    };
}

function requireTriggerConfig(resource: ConnectorTriggerConfigResource): ConnectorTriggerConfig {
    const receiveUri = resource.properties?.pollingEndpoints?.receiveUri;
    if (!resource.id ||
        !resource.name ||
        !resource.properties?.state ||
        !receiveUri) {
        throw new Error(localize(
            'invalidConnectorTriggerConfigResponse',
            'Azure returned an invalid Connector Trigger configuration.',
        ));
    }
    return {
        id: resource.id,
        name: resource.name,
        state: resource.properties.state,
        pollingEndpoints: {
            receiveUri,
            acknowledgeUri: resource.properties.pollingEndpoints?.acknowledgeUri,
            hasMessagesUri: resource.properties.pollingEndpoints?.hasMessagesUri,
            approximateQueueDepthUri:
                resource.properties.pollingEndpoints?.approximateQueueDepthUri,
        },
    };
}

function accessPoliciesEqual(
    resource: Awaited<ReturnType<ConnectorGatewayClient['getConnectionAccessPolicy']>>,
    policy: ConnectorTriggerConnectionAccessPolicy,
): boolean {
    const identity = resource?.properties?.principal?.identity;
    return resource?.properties?.principal?.type === policy.principal.type &&
        equalsIgnoreCase(identity?.objectId, policy.principal.identity.objectId) &&
        equalsIgnoreCase(identity?.tenantId, policy.principal.identity.tenantId);
}

function getConsentRedirectUrl(context: ISubscriptionContext): string {
    const portalUrl = (context.environment as { portalUrl?: string }).portalUrl;
    if (portalUrl) {
        try {
            const url = new URL(portalUrl);
            if (url.protocol === 'https:' && url.hostname) {
                return url.origin;
            }
        } catch {
            // Use the known public-cloud fallback below when applicable.
        }
    }
    if (!context.isCustomCloud || normalizeCloud(context.environment.name) === 'azurecloud') {
        return 'https://portal.azure.com';
    }
    throw new Error(localize(
        'connectorConsentPortalUnavailable',
        'The Azure portal endpoint for this cloud is unavailable.',
    ));
}

function normalizeCloud(value: string | undefined): string | undefined {
    const normalized = value?.replace(/[^a-z\d]/gi, '').toLowerCase();
    switch (normalized) {
        case 'azurepubliccloud':
        case 'public':
            return 'azurecloud';
        case 'azureusgovernmentcloud':
        case 'usgov':
            return 'azureusgovernment';
        case 'azurechina':
            return 'azurechinacloud';
        case 'azuregermany':
            return 'azuregermancloud';
        default:
            return normalized;
    }
}

function normalizeEndpoint(value: string): string | undefined {
    try {
        const url = new URL(value);
        return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}` +
            url.pathname.replace(/\/+$/, '').toLowerCase();
    } catch {
        return undefined;
    }
}

function normalizeLocation(value: string): string {
    return value.replace(/\s+/g, '').toLowerCase();
}

function isHttpsUrl(value: string | undefined): value is string {
    if (!value) {
        return false;
    }
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !!url.hostname;
    } catch {
        return false;
    }
}

function getStatusCode(error: unknown): number | undefined {
    if (!isRecord(error)) {
        return undefined;
    }
    return typeof error.statusCode === 'number' ?
        error.statusCode :
        isRecord(error.response) && typeof error.response.status === 'number' ?
            error.response.status :
            undefined;
}

function equalsIgnoreCase(left: string | undefined, right: string): boolean {
    return typeof left === 'string' &&
        left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function maskJsonValue(
    context: IActionContext,
    value: ConnectorTriggerDynamicInvokeRequest['request']['body'] | undefined,
): void {
    if (value !== undefined) {
        maskValues(context, typeof value === 'string' ? value : JSON.stringify(value));
    }
}

function maskValues(context: IActionContext, ...values: (string | undefined)[]): void {
    for (const value of values) {
        if (value && !context.valuesToMask.includes(value)) {
            context.valuesToMask.push(value);
        }
    }
}
