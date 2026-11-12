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
    UserCancelledError,
    type IActionContext,
    type ISubscriptionContext,
} from '@microsoft/vscode-azext-utils';
import { type CancellationToken } from 'vscode';
import { ConnectorNamespaceApiVersion, webProvider } from '../../constants';
import { addValuesToMask, equalsIgnoreCase, getStatusCode, isRecord } from '../../connectorTrigger/connectorTriggerUtils';
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
    ConnectorTriggerF5SetupError,
    connectorResourceNameSuffixAttempts,
    createSuffixedConnectorResourceName,
    isSuffixedConnectorResourceName,
    type ConnectorTriggerConfig,
    type ConnectorTriggerConfigRequest,
    type ConnectorTriggerConfigWriteOptions,
    type ConnectorTriggerConnection,
    type ConnectorTriggerConnectionAccessPolicy,
    type ConnectorTriggerConnectionOptions,
    type ConnectorTriggerConnectionPlan,
    type ConnectorTriggerDynamicInvokeRequest,
    type ConnectorTriggerGateway,
    type ConnectorTriggerHostCredentialConfiguration,
    type ConnectorTriggerMutationOptions,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerNamespacePlan,
    type ConnectorTriggerOperationResolutionRequest,
    type ConnectorTriggerPrincipal,
    type ConnectorTriggerSetupTarget,
    type ConnectorTriggerSwaggerProvider,
} from './connectorTriggerF5Contracts';
import {
    defaultConnectorPollingTokenProvider,
    resolveConnectorPollingPrincipal,
    type ConnectorPollingTokenProvider,
} from './connectorTriggerHostCredential';

const managedApiSwaggerApiVersion = '2022-09-01-preview';
const managedApiMetadataApiVersion = '2016-06-01';
export const connectorTriggerOwnerTagKey = 'vscode-azurefunctions-workspace-id';

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
        addValuesToMask(
            context,
            target.subscription.id,
            target.subscription.tenantId,
            target.subscription.accountId,
            target.subscription.environment.name,
            target.subscription.environment.resourceManagerEndpointUrl,
        );
        const selectedCloud = normalizeCloud(target.subscription.environment.name);
        const selectedEndpoint =
            normalizeEndpoint(target.subscription.environment.resourceManagerEndpointUrl);
        const selectedAccountId = target.subscription.accountId;
        // The same subscription ID can be listed under several accounts, tenants or clouds, so match
        // the full selected identity rather than the first subscription with the same ID.
        const matches = !selectedCloud || !selectedEndpoint ? [] : (await this.subscriptionsProvider())
            .filter(candidate =>
                candidate.subscriptionId === target.subscription.id &&
                equalsIgnoreCase(candidate.tenantId, target.subscription.tenantId) &&
                normalizeCloud(candidate.environment.name) === selectedCloud &&
                normalizeEndpoint(candidate.environment.resourceManagerEndpointUrl) === selectedEndpoint &&
                (selectedAccountId === undefined || getAccountId(candidate) === selectedAccountId));
        const subscription = matches[0];
        if (!subscription) {
            throw new Error(localize(
                'connectorTriggerSubscriptionMismatch',
                'The selected Connector Trigger subscription is not available in the current Azure sign-in.',
            ));
        }
        addValuesToMask(context, ...matches.map(getAccountId));
        if (new Set(matches.map(getAccountId)).size > 1) {
            context.telemetry.properties.connectorF5SubscriptionAmbiguous = 'true';
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorTriggerSubscriptionAmbiguous',
                'The selected Connector Trigger subscription is available from more than one signed-in Azure account. Select the subscription again so setup knows which account to use, then retry F5. No Azure resources were changed.',
            ));
        }
        addValuesToMask(
            context,
            subscription.subscriptionId,
            subscription.tenantId,
            subscription.environment.name,
            subscription.environment.resourceManagerEndpointUrl,
        );

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
        private readonly pollingTokenProvider: ConnectorPollingTokenProvider = defaultConnectorPollingTokenProvider,
        private readonly createSuffixedName: (baseName: string) => string = createSuffixedConnectorResourceName,
    ) { }

    public async getPollingPrincipal(
        context: IActionContext,
        _target: ConnectorTriggerSetupTarget,
        hostCredential: ConnectorTriggerHostCredentialConfiguration,
    ): Promise<ConnectorTriggerPrincipal | undefined> {
        return await resolveConnectorPollingPrincipal(context, hostCredential, this.pollingTokenProvider);
    }

    public async getTriggerConfig(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        namespace: ConnectorTriggerNamespace,
        triggerConfigName: string,
    ): Promise<ConnectorTriggerConfig | undefined> {
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        const resource = await this.client.getTriggerConfig(
            liveContext,
            namespace.resourceGroupName,
            namespace.name,
            triggerConfigName,
        );
        return resource ? requireTriggerConfig(resource) : undefined;
    }

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
        options: ConnectorTriggerMutationOptions = {},
    ): Promise<ConnectorTriggerNamespace> {
        const { cancellationToken } = options;
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        throwIfSetupCancelled(cancellationToken);
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
            { cancellationToken },
        );
        if (existing) {
            return requireReadyNamespace(existing, target.region);
        }
        if (plan.kind === 'existing') {
            throw new Error(localize(
                'connectorNamespaceNoLongerExists',
                'The selected Connector Namespace no longer exists.',
            ));
        }

        throwIfSetupCancelled(cancellationToken);
        await this.providerVerifier(liveContext);
        await this.ensureResourceGroup(liveContext, resourceGroupName, target.region, cancellationToken);
        throwIfSetupCancelled(cancellationToken);
        let created: ConnectorGatewayResource;
        try {
            created = await this.client.createNamespace(
                liveContext,
                resourceGroupName,
                namespaceName,
                {
                    location: target.region,
                    identity: { type: 'SystemAssigned' },
                    properties: {},
                },
                { cancellationToken },
            );
        } catch (error) {
            // Creation uses If-None-Match, so a namespace created concurrently by another setup
            // surfaces as a conflict or failed precondition; any other failure is not recoverable.
            if (!isCreateConflict(error)) {
                throw error;
            }
            context.telemetry.properties.connectorF5NamespaceCreateConflict = 'true';
            const concurrentlyCreated = await this.client.getNamespace(
                liveContext,
                resourceGroupName,
                namespaceName,
                { cancellationToken },
            );
            if (!concurrentlyCreated) {
                throw error;
            }
            return requireReadyNamespace(concurrentlyCreated, target.region);
        }
        return requireReadyNamespace(created, target.region);
    }

    public async assertConnectorConnectionCreatable(
        context: IActionContext,
        target: ConnectorTriggerSetupTarget,
        options: ConnectorTriggerMutationOptions = {},
    ): Promise<void> {
        const { cancellationToken } = options;
        throwIfSetupCancelled(cancellationToken);
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        await this.assertConnectorAuthenticationSupported(context, liveContext, target, cancellationToken);
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
        options: ConnectorTriggerConnectionOptions,
    ): Promise<ConnectorTriggerConnection> {
        const { cancellationToken, ownerWorkspaceId } = options;
        addValuesToMask(context, ownerWorkspaceId);
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        throwIfSetupCancelled(cancellationToken);
        const getConnection = async (name: string): Promise<ConnectorTriggerConnection | undefined> => {
            const resource = await this.client.getConnection(
                liveContext,
                namespace.resourceGroupName,
                namespace.name,
                name,
                { cancellationToken },
            );
            return resource ? requireConnection(resource) : undefined;
        };
        if (plan.kind === 'existing') {
            const existing = await getConnection(plan.connection.name);
            if (!existing) {
                throw new Error(localize(
                    'connectorConnectionNoLongerExists',
                    'The selected connector connection no longer exists.',
                ));
            }
            if (!equalsIgnoreCase(existing.connectorId, target.connectorId)) {
                throw new Error(localize(
                    'connectorConnectionTypeMismatch',
                    'The selected connector connection belongs to a different connector.',
                ));
            }
            return existing;
        }

        const isOwned = (connection: ConnectorTriggerConnection): boolean =>
            connection.ownerWorkspaceId === ownerWorkspaceId &&
            equalsIgnoreCase(connection.connectorId, target.connectorId);
        let connectionName = plan.connectionName;
        const planned = await getConnection(connectionName);
        if (planned && isOwned(planned)) {
            return planned;
        }
        if (planned) {
            // Another connection already has the planned name. Never adopt it: reuse a suffixed
            // connection an earlier setup for this workspace created, or create one with a new suffix.
            context.telemetry.properties.connectorF5ConnectionNameSuffixed = 'true';
            const owned = (await this.client.listConnections(
                liveContext,
                namespace.resourceGroupName,
                namespace.name,
                { cancellationToken },
            ))
                .map(resource => tryRequireConnection(resource))
                .find(connection =>
                    !!connection &&
                    isSuffixedConnectorResourceName(connection.name, plan.connectionName) &&
                    isOwned(connection));
            if (owned) {
                return owned;
            }
            connectionName = await this.findUnusedName(plan.connectionName, getConnection);
        }

        await this.assertConnectorAuthenticationSupported(context, liveContext, target, cancellationToken);
        throwIfSetupCancelled(cancellationToken);
        try {
            return requireConnection(await this.client.createOrUpdateConnection(
                liveContext,
                namespace.resourceGroupName,
                namespace.name,
                connectionName,
                {
                    location: namespace.location,
                    tags: { [connectorTriggerOwnerTagKey]: ownerWorkspaceId },
                    properties: {
                        connectorName: target.connectorId,
                        displayName: connectionName,
                    },
                },
                { cancellationToken, createOnly: true },
            ));
        } catch (error) {
            if (!isCreateConflict(error)) {
                throw error;
            }
            // Another setup created this name after the existence check. Reuse it only if this workspace owns it.
            const raced = await getConnection(connectionName);
            if (raced && isOwned(raced)) {
                return raced;
            }
            throw new Error(localize(
                'connectorConnectionCreateRaced',
                'Another connection with the same name was created while setting up. Retry F5. The existing connection was not changed.',
            ), { cause: error });
        }
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
        addValuesToMask(
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
        options: ConnectorTriggerMutationOptions = {},
    ): Promise<void> {
        const { cancellationToken } = options;
        const liveContext = await this.subscriptionResolver.resolve(context, target);
        for (const policy of policies) {
            throwIfSetupCancelled(cancellationToken);
            const existing = await this.client.getConnectionAccessPolicy(
                liveContext,
                namespace.resourceGroupName,
                namespace.name,
                connection.name,
                policy.name,
                { cancellationToken },
            );
            if (accessPoliciesEqual(existing, policy)) {
                continue;
            }
            if (existing) {
                throw new ConnectorTriggerF5SetupError(undefined, localize(
                    'connectorAccessPolicyPrincipalConflict',
                    'The connection already has an access policy named "{0}" for a different identity. It was not changed. No connection access was granted.',
                    policy.name,
                ));
            }
            throwIfSetupCancelled(cancellationToken);
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
                { cancellationToken },
            );
        }
    }

    public async createOrUpdateTriggerConfig(
        context: IActionContext,
        request: ConnectorTriggerConfigRequest,
        options: ConnectorTriggerConfigWriteOptions = {},
    ): Promise<ConnectorTriggerConfig> {
        const { cancellationToken, createOnly } = options;
        for (const parameter of request.parameters) {
            maskJsonValue(context, parameter.value);
        }
        const liveContext = await this.subscriptionResolver.resolve(context, request.target);
        throwIfSetupCancelled(cancellationToken);
        let resource: ConnectorTriggerConfigResource;
        try {
            resource = await this.client.createOrUpdateTriggerConfig(
                liveContext,
                request.namespace.resourceGroupName,
                request.namespace.name,
                request.triggerConfigName,
                {
                    location: request.namespace.location,
                    tags: { [connectorTriggerOwnerTagKey]: request.ownerWorkspaceId },
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
                { cancellationToken, createOnly },
            );
        } catch (error) {
            if (createOnly && isCreateConflict(error)) {
                throw new Error(localize(
                    'connectorTriggerConfigCreateRaced',
                    'Another Trigger Config with the same name was created while setting up. Retry F5. The existing Trigger Config was not changed.',
                ), { cause: error });
            }
            throw error;
        }
        if (!resource.properties?.pollingEndpoints?.receiveUri) {
            resource = await this.client.getTriggerConfig(
                liveContext,
                request.namespace.resourceGroupName,
                request.namespace.name,
                request.triggerConfigName,
                { cancellationToken },
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
        const namespaceSwagger = await tryGetArmJson(context, client, namespaceUrl);
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
        const locationSwagger = await tryGetArmJson(context, client, locationUrl);
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
        cancellationToken: CancellationToken | undefined,
    ): Promise<void> {
        const client = await this.resourceGroupsClientFactory(context);
        try {
            await client.get(resourceGroupName);
        } catch (error) {
            if (getStatusCode(error) !== 404) {
                throw error;
            }
            throwIfSetupCancelled(cancellationToken);
            await client.createOrUpdate(resourceGroupName, { location });
        }
    }

    private async findUnusedName(
        baseName: string,
        getConnection: (name: string) => Promise<ConnectorTriggerConnection | undefined>,
    ): Promise<string> {
        for (let attempt = 0; attempt < connectorResourceNameSuffixAttempts; attempt++) {
            const name = this.createSuffixedName(baseName);
            if (!await getConnection(name)) {
                return name;
            }
        }
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorConnectionNameUnavailable',
            'Could not find an unused connector connection name. Retry F5. No connection was created.',
        ));
    }

    /**
     * Setup creates connections with only connectorName and authorizes them through the OAuth
     * consent link, so it cannot collect API keys, connection strings, gateway settings or a choice
     * of authentication type. Reject such connectors before creating anything.
     */
    private async assertConnectorAuthenticationSupported(
        context: IActionContext,
        liveContext: ConnectorGatewayClientContext,
        target: ConnectorTriggerSetupTarget,
        cancellationToken: CancellationToken | undefined,
    ): Promise<void> {
        throwIfSetupCancelled(cancellationToken);
        const client = await this.swaggerClientFactory(liveContext);
        const endpoint = liveContext.environment.resourceManagerEndpointUrl.replace(/\/+$/, '');
        const url = requestUtils.createRequestUrl(
            `${endpoint}/subscriptions/${encodeURIComponent(liveContext.subscriptionId)}` +
            `/providers/Microsoft.Web/locations/${encodeURIComponent(normalizeLocation(target.region))}` +
            `/managedApis/${encodeURIComponent(target.connectorId)}`,
            { 'api-version': managedApiMetadataApiVersion },
        );
        const metadata = await tryGetArmJson(context, client, url);
        throwIfSetupCancelled(cancellationToken);
        const support = getConnectorAuthenticationSupport(metadata);
        context.telemetry.properties.connectorF5ConnectionAuthentication = support;
        if (support === 'unknown') {
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorAuthenticationUnknown',
                'Could not load the authentication settings for this connector from Azure. Retry F5, or create and authorize the connection in the Azure portal and select it as an existing connection. No connection was created.',
            ));
        }
        if (support === 'unsupported') {
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorAuthenticationUnsupported',
                'This connector needs connection settings that VS Code cannot collect, such as an API key, connection string or authentication type. Create and authorize the connection in the Azure portal, then select it as an existing connection and retry F5. No connection was created.',
            ));
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

async function tryGetArmJson(
    context: IActionContext,
    client: ConnectorSwaggerArmClient,
    url: string,
): Promise<unknown | undefined> {
    addValuesToMask(context, url);
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

function requireReadyNamespace(resource: ConnectorGatewayResource, region: string): ConnectorTriggerNamespace {
    const provisioningState = resource.properties?.provisioningState;
    if (provisioningState !== undefined && !equalsIgnoreCase(provisioningState, 'Succeeded')) {
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorNamespaceNotReady',
            'The Connector Namespace is not ready (provisioning state "{0}"). Wait for provisioning to finish, or choose a different namespace, then retry F5.',
            provisioningState,
        ));
    }
    return requireNamespaceInRegion(resource, region);
}

function isCreateConflict(error: unknown): boolean {
    const statusCode = getStatusCode(error);
    return statusCode === 409 || statusCode === 412;
}

function throwIfSetupCancelled(cancellationToken: CancellationToken | undefined): void {
    if (cancellationToken?.isCancellationRequested) {
        throw new UserCancelledError('connectorF5Setup');
    }
}

function getAccountId(subscription: ISubscriptionContext): string | undefined {
    const account = (subscription as { account?: unknown }).account;
    return isRecord(account) && typeof account.id === 'string' ? account.id : undefined;
}

type ConnectorAuthenticationSupport = 'none' | 'oauth' | 'unsupported' | 'unknown';

/**
 * Classifies managed API connection parameters. Only connectors whose required parameters are all
 * OAuth settings can be created without parameter values and authorized through a consent link.
 */
export function getConnectorAuthenticationSupport(metadata: unknown): ConnectorAuthenticationSupport {
    const properties = isRecord(metadata) && isRecord(metadata.properties) ? metadata.properties : undefined;
    if (!properties) {
        return 'unknown';
    }
    const parameterSets = properties.connectionParameterSets;
    if (parameterSets !== undefined && parameterSets !== null) {
        // Multiple authentication types require choosing a parameter set, which setup cannot do.
        if (!isRecord(parameterSets) || !Array.isArray(parameterSets.values) || parameterSets.values.length > 0) {
            return 'unsupported';
        }
    }
    const parameters = properties.connectionParameters;
    if (parameters === undefined || parameters === null) {
        return 'none';
    }
    if (!isRecord(parameters)) {
        return 'unknown';
    }
    let oauth = false;
    for (const parameter of Object.values(parameters)) {
        if (!isRecord(parameter)) {
            return 'unknown';
        }
        if (parameter.type === 'oauthSetting') {
            oauth = true;
            continue;
        }
        const uiDefinition = isRecord(parameter.uiDefinition) ? parameter.uiDefinition : undefined;
        const constraints = uiDefinition && isRecord(uiDefinition.constraints) ? uiDefinition.constraints : undefined;
        const required = constraints?.required;
        // Treat a parameter without an explicit optional marker as required.
        if (required !== false && required !== 'false') {
            return 'unsupported';
        }
    }
    return oauth ? 'oauth' : 'none';
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
        ownerWorkspaceId: resource.tags?.[connectorTriggerOwnerTagKey],
    };
}

function tryRequireConnection(resource: ConnectorConnectionResource): ConnectorTriggerConnection | undefined {
    try {
        return requireConnection(resource);
    } catch {
        return undefined;
    }
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
        ownerWorkspaceId: resource.tags?.[connectorTriggerOwnerTagKey],
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

function maskJsonValue(
    context: IActionContext,
    value: ConnectorTriggerDynamicInvokeRequest['request']['body'] | undefined,
): void {
    if (value !== undefined) {
        addValuesToMask(context, typeof value === 'string' ? value : JSON.stringify(value));
    }
}
