/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ServiceClient } from '@azure/core-client';
import { createPipelineRequest } from '@azure/core-rest-pipeline';
import {
    createGenericClient,
    LocationListStep,
    parseAzureResourceId,
    type AzExtLocation,
    type AzExtPipelineResponse,
    type ILocationWizardContext,
} from '@microsoft/vscode-azext-azureutils';
import { createSubscriptionContext, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import {
    ConnectorNamespaceApiVersion,
    ConnectorNamespaceResourceType,
    webProvider,
} from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import {
    type ConnectorNamespaceOption,
    type ConnectorTriggerLocationOption,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerSubscriptionOption,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { requestUtils } from '../../../utils/requestUtils';

const managedApiCatalogApiVersion = '2016-06-01';
const managedApiOperationsApiVersion = '2016-06-01';

export interface ConnectorTriggerCatalog {
    connectors: ConnectorTriggerOption[];
    operations: ConnectorTriggerOperationOption[];
}

export interface ConnectorTriggerCatalogResult {
    catalog: ConnectorTriggerCatalog;
    source: 'live';
}

export interface ConnectorTriggerOperationMetadataResult {
    pollOperations: ConnectorTriggerOperationOption[];
    webhookOperations: ConnectorTriggerOperationOption[];
}

export interface ConnectorNamespaceResult {
    namespaces: ConnectorNamespaceOption[];
    failedSubscriptionCount: number;
}

export interface ConnectorSubscription {
    subscriptionId: string;
    subscriptionDisplayName: string;
    context: ISubscriptionContext;
}

export interface ConnectorTriggerAzureContext {
    subscriptionId: string;
    subscriptionName: string;
    region: string;
    regionDisplayName: string;
}

export interface ConnectorArmClient {
    get(url: string): Promise<unknown>;
}

export type ConnectorSubscriptionsProvider =
    (filter: boolean) => Promise<ConnectorSubscription[]>;
export type ConnectorLocationsProvider = (
    context: IActionContext & ISubscriptionContext,
) => Promise<AzExtLocation[]>;
export type ConnectorArmClientFactory = (
    context: IActionContext & ISubscriptionContext,
) => Promise<ConnectorArmClient>;

interface ArmListResult<T> {
    value?: T[];
    nextLink?: string | null;
}

interface ConnectorGatewayDefinition {
    id?: string;
    name?: string;
    location?: string;
}

interface ManagedApiDefinition {
    name?: string;
    properties?: {
        displayName?: string;
        description?: string;
        iconUri?: string;
        iconUrl?: string;
        generalInformation?: {
            displayName?: string;
            description?: string;
            iconUri?: string;
            iconUrl?: string;
        };
    };
}

interface ManagedApiOperation {
    name?: string;
    properties?: {
        summary?: string;
        description?: string;
        visibility?: string;
        isTrigger?: boolean;
        operationRole?: string;
        trigger?: unknown;
        triggerHint?: string;
        isWebhook?: boolean;
        isNotification?: boolean;
        api?: {
            name?: string;
            displayName?: string;
            description?: string;
            iconUri?: string;
        };
        annotation?: {
            family?: string;
            revision?: number;
        };
        inputsDefinition?: unknown;
    };
}

export class ConnectorTriggerDataClient {
    private readonly registeredSubscriptions =
        new Map<string, ConnectorSubscription>();
    private readonly subscriptions = new Map<boolean, ConnectorSubscription[]>();
    private readonly subscriptionPromises =
        new Map<boolean, Promise<ConnectorSubscription[]>>();
    private subscriptionsGeneration = 0;

    public constructor(
        private readonly subscriptionsProvider: ConnectorSubscriptionsProvider = getSubscriptions,
        private readonly armClientFactory: ConnectorArmClientFactory = createArmClient,
        private readonly locationsProvider: ConnectorLocationsProvider =
            getConnectorLocations,
    ) { }

    public async listSubscriptions(
        showAll = false,
    ): Promise<ConnectorTriggerSubscriptionOption[]> {
        try {
            return (await this.getSubscriptions(!showAll))
                .map(subscription => ({
                    id: subscription.subscriptionId,
                    label: subscription.subscriptionDisplayName,
                }))
                .sort((left, right) => left.label.localeCompare(right.label));
        } catch (error) {
            throw new Error(localize(
                'connectorSubscriptionsLoadFailed',
                'Unable to load Azure subscriptions for Connector Triggers.',
            ), { cause: error });
        }
    }

    public async listLocations(
        context: IActionContext,
        subscriptionId: string,
    ): Promise<ConnectorTriggerLocationOption[]> {
        const subscription = await this.getSubscription(subscriptionId);
        maskSubscriptionContext(context, subscription.context);
        let locations: AzExtLocation[];
        try {
            locations = await this.locationsProvider(
                Object.assign({}, context, subscription.context),
            );
        } catch (error) {
            throw new Error(localize(
                'connectorRegionsLoadFailed',
                'Unable to load Connector Trigger regions for the selected subscription.',
            ), { cause: error });
        }
        const unique = new Map<string, ConnectorTriggerLocationOption>();
        for (const location of locations) {
            const name = location.name?.trim();
            if (!name) {
                continue;
            }
            unique.set(name.toLowerCase(), {
                name,
                label: location.displayName?.trim() || name,
                regionCategory: location.metadata?.regionCategory,
            });
        }
        return [...unique.values()].sort((left, right) =>
            left.label.localeCompare(right.label));
    }

    public async getSubscriptionContext(
        subscriptionId: string,
    ): Promise<ISubscriptionContext> {
        return (await this.getSubscription(subscriptionId)).context;
    }

    public async listNamespaces(context: IActionContext): Promise<ConnectorNamespaceResult> {
        const subscriptions = await this.getSubscriptions(true);
        const results = await Promise.allSettled(subscriptions.map(async subscription => {
            const clientContext = Object.assign({}, context, subscription.context);
            const client = await this.armClientFactory(clientContext);
            const endpoint = getResourceManagerEndpoint(subscription.context);
            const url = requestUtils.createRequestUrl(
                `${endpoint}/subscriptions/${subscription.subscriptionId}/providers/Microsoft.Web/connectorGateways`,
                { 'api-version': ConnectorNamespaceApiVersion },
            );
            const resources = await listAll<ConnectorGatewayDefinition>(client, url);
            return resources.flatMap(resource => {
                if (!resource.id || !resource.name) {
                    return [];
                }

                const parsedId = parseAzureResourceId(resource.id);
                return [{
                    id: resource.id,
                    name: resource.name,
                    label: resource.name,
                    location: resource.location ?? '',
                    resourceGroup: parsedId.resourceGroup,
                    subscriptionId: subscription.subscriptionId,
                    subscriptionName: subscription.subscriptionDisplayName,
                }];
            });
        }));

        const namespaces: ConnectorNamespaceOption[] = [];
        let failedSubscriptionCount = 0;
        for (const result of results) {
            if (result.status === 'fulfilled') {
                namespaces.push(...result.value);
            } else {
                failedSubscriptionCount += 1;
            }
        }

        if (subscriptions.length > 0 && failedSubscriptionCount === subscriptions.length) {
            throw new Error(localize(
                'connectorNamespacesLoadFailed',
                'Unable to load Connector Namespaces from your Azure subscriptions.',
            ));
        }

        namespaces.sort((left, right) =>
            left.name.localeCompare(right.name) ||
            left.subscriptionName.localeCompare(right.subscriptionName));

        return { namespaces, failedSubscriptionCount };
    }

    public async getCatalog(
        context: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
    ): Promise<ConnectorTriggerCatalogResult> {
        maskValues(
            context,
            azureContext.subscriptionId,
            azureContext.subscriptionName,
            azureContext.region,
            azureContext.regionDisplayName,
        );
        let result: Awaited<ReturnType<ConnectorTriggerDataClient['listLocationCatalog']>>;
        try {
            result = await this.listLocationCatalog(context, azureContext);
        } catch (error) {
            throw new Error(localize(
                'connectorCatalogLiveLoadFailed',
                'Unable to load Connector Triggers from the selected Azure subscription and region.',
            ), { cause: error });
        }
        context.telemetry.properties.connectorCatalogSource = 'live';
        return {
            ...result,
            source: 'live',
        };
    }

    public async listCatalog(
        context: IActionContext,
        namespace: ConnectorNamespaceOption,
    ): Promise<ConnectorTriggerCatalog> {
        const subscription = await this.getSubscription(namespace.subscriptionId);

        const clientContext = Object.assign({}, context, subscription.context);
        const client = await this.armClientFactory(clientContext);
        const endpoint = getResourceManagerEndpoint(subscription.context);
        const namespaceUrl = `${endpoint}${namespace.id}`;
        const managedApisUrl = requestUtils.createRequestUrl(
            `${namespaceUrl}/managedApis`,
            { 'api-version': ConnectorNamespaceApiVersion },
        );
        const operationsUrl = requestUtils.createRequestUrl(
            `${namespaceUrl}/managedApiOperations`,
            {
                'api-version': ConnectorNamespaceApiVersion,
                '$filter': "operationRole eq 'Trigger'",
                '$top': '250',
            },
        );

        const [managedApis, managedApiOperations] = await Promise.all([
            listAll<ManagedApiDefinition>(client, managedApisUrl),
            listAll<ManagedApiOperation>(client, operationsUrl),
        ]);

        return createCatalog(managedApis, managedApiOperations);
    }

    private async listLocationCatalog(
        context: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
    ): Promise<{
        catalog: ConnectorTriggerCatalog;
    }> {
        const subscription = await this.getSubscription(azureContext.subscriptionId);
        maskSubscriptionContext(context, subscription.context);

        const location = normalizeLocation(azureContext.region);
        if (!location) {
            throw new Error(localize(
                'connectorRegionUnavailable',
                'Select a valid Azure region for Connector Triggers.',
            ));
        }

        const clientContext = Object.assign({}, context, subscription.context);
        const client = await this.armClientFactory(clientContext);
        const endpoint = getResourceManagerEndpoint(subscription.context);
        const locationUrl =
            `${endpoint}/subscriptions/${subscription.subscriptionId}` +
            `/providers/Microsoft.Web/locations/${encodeURIComponent(location)}`;
        const managedApisUrl = requestUtils.createRequestUrl(
            `${locationUrl}/managedApis`,
            {
                'api-version': managedApiCatalogApiVersion,
            },
        );
        const managedApis = await listAll<ManagedApiDefinition>(
            client,
            managedApisUrl,
        );

        return {
            catalog: {
                connectors: createConnectorOptions(managedApis),
                operations: [],
            },
        };
    }

    public async listConnectorOperations(
        context: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
        connectorId: string,
    ): Promise<ConnectorTriggerOperationOption[]> {
        return (await this.listConnectorOperationMetadata(
            context,
            azureContext,
            connectorId,
        )).pollOperations;
    }

    public async listConnectorOperationMetadata(
        context: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
        connectorId: string,
    ): Promise<ConnectorTriggerOperationMetadataResult> {
        const subscription = await this.getSubscription(azureContext.subscriptionId);
        maskSubscriptionContext(context, subscription.context);
        maskValues(
            context,
            azureContext.region,
            azureContext.regionDisplayName,
        );
        const location = normalizeLocation(azureContext.region);
        if (!location) {
            throw new Error(localize(
                'connectorRegionUnavailable',
                'Select a valid Azure region for Connector Triggers.',
            ));
        }

        const clientContext = Object.assign({}, context, subscription.context);
        const client = await this.armClientFactory(clientContext);
        const endpoint = getResourceManagerEndpoint(subscription.context);
        const operationsUrl = requestUtils.createRequestUrl(
            `${endpoint}/subscriptions/${subscription.subscriptionId}` +
            `/providers/Microsoft.Web/locations/${encodeURIComponent(location)}` +
            `/managedApis/${encodeURIComponent(connectorId)}/apiOperations`,
            {
                'api-version': managedApiOperationsApiVersion,
            },
        );
        try {
            const rawOperations = await listAll<ManagedApiOperation>(
                client,
                operationsUrl,
            );
            const operations = createCatalog(
                [],
                rawOperations
                    .filter(isTriggerOperation)
                    .map(operation => ({
                        ...operation,
                        properties: {
                            ...operation.properties,
                            api: {
                                ...operation.properties?.api,
                                name: connectorId,
                            },
                        },
                    })),
                true,
            ).operations;
            return {
                pollOperations: operations.filter(operation => !operation.isWebhook),
                webhookOperations: operations.filter(operation => operation.isWebhook),
            };
        } catch (error) {
            throw new Error(localize(
                'connectorEventsLoadFailed',
                'Unable to load events for the selected connector.',
            ), { cause: error });
        }
    }

    public registerSubscription(context: ISubscriptionContext): void {
        this.subscriptionsGeneration += 1;
        const subscription: ConnectorSubscription = {
            subscriptionId: context.subscriptionId,
            subscriptionDisplayName: context.subscriptionDisplayName,
            context,
        };
        this.subscriptionPromises.clear();
        this.registeredSubscriptions.set(context.subscriptionId, subscription);
    }

    public invalidateSubscriptions(): void {
        this.subscriptionsGeneration += 1;
        this.registeredSubscriptions.clear();
        this.subscriptions.clear();
        this.subscriptionPromises.clear();
    }

    private async getSubscriptions(filter: boolean): Promise<ConnectorSubscription[]> {
        const cached = this.subscriptions.get(filter);
        if (cached) {
            return cached;
        }

        const generation = this.subscriptionsGeneration;
        const promise = this.subscriptionPromises.get(filter) ??
            this.subscriptionsProvider(filter);
        this.subscriptionPromises.set(filter, promise);
        try {
            const subscriptions = await promise;
            if (generation !== this.subscriptionsGeneration) {
                return await this.getSubscriptions(filter);
            }

            this.subscriptions.set(filter, subscriptions);
            this.subscriptionPromises.delete(filter);
            return subscriptions;
        } catch (error) {
            if (generation === this.subscriptionsGeneration &&
                this.subscriptionPromises.get(filter) === promise) {
                this.subscriptionPromises.delete(filter);
            }
            throw error;
        }
    }

    private async getSubscription(
        subscriptionId: string,
    ): Promise<ConnectorSubscription> {
        const subscription = this.registeredSubscriptions.get(subscriptionId) ??
            [...this.subscriptions.values()]
            .flat()
            .find(item => item.subscriptionId === subscriptionId) ??
            (await this.getSubscriptions(false))
                .find(item => item.subscriptionId === subscriptionId);
        if (!subscription) {
            throw new Error(localize(
                'connectorSubscriptionUnavailable',
                'The selected Azure subscription is no longer available.',
            ));
        }
        return subscription;
    }
}

function createConnectorOptions(
    managedApis: readonly ManagedApiDefinition[],
): ConnectorTriggerOption[] {
    const connectors = new Map<string, ConnectorTriggerOption>();
    for (const api of managedApis) {
        const id = api.name?.trim();
        if (!id) {
            continue;
        }
        const properties = api.properties;
        const information = properties?.generalInformation;
        connectors.set(id.toLowerCase(), {
            id,
            label: properties?.displayName?.trim() ||
                information?.displayName?.trim() ||
                id,
            description: properties?.description?.trim() ||
                information?.description?.trim(),
            iconUrl: getConnectorIconUrl(
                properties?.iconUri,
                information?.iconUri,
                properties?.iconUrl,
                information?.iconUrl,
            ),
        });
    }
    return [...connectors.values()].sort((left, right) =>
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id));
}

function createCatalog(
    managedApis: ManagedApiDefinition[],
    managedApiOperations: ManagedApiOperation[],
    includeWebhooks = false,
): ConnectorTriggerCatalog {
    const connectors = new Map<string, ConnectorTriggerOption>();
    for (const api of managedApis) {
        const id = api.name?.trim();
        if (!id) {
            continue;
        }

        const properties = api.properties;
        const information = properties?.generalInformation;
        const label = properties?.displayName?.trim() ||
            information?.displayName?.trim() ||
            id;
        connectors.set(id.toLowerCase(), {
            id,
            label,
            description: properties?.description?.trim() ||
                information?.description?.trim(),
            iconUrl: getConnectorIconUrl(
                properties?.iconUri,
                information?.iconUri,
                properties?.iconUrl,
                information?.iconUrl,
            ),
        });
    }

    const operations: ConnectorTriggerOperationOption[] = [];
    for (const operation of managedApiOperations) {
        const id = operation.name?.trim();
        const api = operation.properties?.api;
        const connectorId = api?.name?.trim();
        const visibility = operation.properties?.visibility?.toLowerCase();
        const isWebhook = operation.properties?.isWebhook === true;
        const isNotification = operation.properties?.isNotification === true;
        if (!id ||
            !connectorId ||
            visibility === 'internal' ||
            visibility === 'hideinui' ||
            (!includeWebhooks && isWebhook)) {
            continue;
        }

        const connectorKey = connectorId.toLowerCase();
        const connectorLabel = api?.displayName?.trim() || connectorId;
        const operationIconUrl = getConnectorIconUrl(api?.iconUri);
        const existingConnector = connectors.get(connectorKey);
        if (!existingConnector) {
            connectors.set(connectorKey, {
                id: connectorId,
                label: connectorLabel,
                description: api?.description?.trim(),
                iconUrl: operationIconUrl,
            });
        } else {
            const label = existingConnector.label === existingConnector.id ?
                connectorLabel :
                existingConnector.label;
            connectors.set(connectorKey, {
                ...existingConnector,
                label,
                description: existingConnector.description || api?.description?.trim(),
                iconUrl: existingConnector.iconUrl || operationIconUrl,
            });
        }

        operations.push({
            id,
            connectorId,
            label: operation.properties?.summary?.trim() || id,
            description: operation.properties?.triggerHint?.trim() ||
                operation.properties?.description?.trim(),
            isWebhook,
            isNotification,
        });
    }

    const connectorIdsWithTriggers = new Set(operations.map(operation => operation.connectorId.toLowerCase()));
    const connectorOptions = [...connectors.entries()]
        .filter(([connectorId]) => connectorIdsWithTriggers.has(connectorId))
        .map(([, connector]) => connector)
        .sort((left, right) => left.label.localeCompare(right.label));
    operations.sort((left, right) =>
        left.connectorId.localeCompare(right.connectorId) ||
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id));

    return { connectors: connectorOptions, operations };
}

async function listAll<T>(client: ConnectorArmClient, initialUrl: string): Promise<T[]> {
    const items: T[] = [];
    const visited = new Set<string>();
    const expectedOrigin = new URL(initialUrl).origin;
    let nextUrl: string | undefined = initialUrl;
    while (nextUrl) {
        const currentUrl = nextUrl;
        if (visited.has(currentUrl)) {
            throw new Error(localize('connectorApiPagingLoop', 'The Connector Namespace API returned an invalid paging link.'));
        }
        visited.add(currentUrl);

        const response = await client.get(currentUrl) as ArmListResult<T>;
        items.push(...response.value ?? []);
        if (response.nextLink) {
            const resolved = new URL(response.nextLink, currentUrl);
            if (resolved.origin !== expectedOrigin) {
                throw new Error(localize(
                    'connectorApiPagingOrigin',
                    'Azure returned an invalid paging host for Connector Trigger metadata.',
                ));
            }
            nextUrl = resolved.toString();
        } else {
            nextUrl = undefined;
        }
    }

    return items;
}

function getResourceManagerEndpoint(context: ISubscriptionContext): string {
    return context.environment.resourceManagerEndpointUrl.replace(/\/$/, '');
}

function isTriggerOperation(operation: ManagedApiOperation): boolean {
    const operationRole = operation.properties?.operationRole?.toLowerCase();
    return operation.properties?.isTrigger === true ||
        operationRole === 'trigger' ||
        (operation.properties?.trigger !== undefined &&
            operation.properties.trigger !== false) ||
        operation.properties?.isWebhook === true ||
        operation.properties?.isNotification === true;
}

function normalizeLocation(value: string): string {
    return value.replace(/\s+/g, '').toLowerCase();
}

function getConnectorIconUrl(...values: (string | undefined)[]): string | undefined {
    for (const value of values) {
        const normalized = normalizeIconUrl(value);
        if (normalized) {
            return normalized;
        }
    }

    return undefined;
}

function normalizeIconUrl(value: string | undefined): string | undefined {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
        return undefined;
    }

    const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmedValue) ?
        trimmedValue :
        `https://${trimmedValue.replace(/^\/\//, '')}`;
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

async function getSubscriptions(filter: boolean): Promise<ConnectorSubscription[]> {
    return (await ext.rgApi.getSubscriptions(filter)).map(subscription => {
        const context = createSubscriptionContext(subscription);
        return {
            subscriptionId: context.subscriptionId,
            subscriptionDisplayName: context.subscriptionDisplayName,
            context,
        };
    });
}

async function getConnectorLocations(
    context: IActionContext & ISubscriptionContext,
): Promise<AzExtLocation[]> {
    const wizardContext = context as IActionContext & ILocationWizardContext;
    LocationListStep.addProviderForFiltering(
        wizardContext,
        webProvider,
        ConnectorNamespaceResourceType,
    );
    return await LocationListStep.getLocations(wizardContext);
}

function maskSubscriptionContext(
    context: IActionContext,
    subscription: ISubscriptionContext,
): void {
    maskValues(
        context,
        subscription.subscriptionId,
        subscription.subscriptionDisplayName,
        subscription.tenantId,
        subscription.environment.name,
        subscription.environment.resourceManagerEndpointUrl,
    );
}

function maskValues(
    context: IActionContext,
    ...values: (string | undefined)[]
): void {
    for (const value of values) {
        if (value && !context.valuesToMask.includes(value)) {
            context.valuesToMask.push(value);
        }
    }
}

async function createArmClient(
    context: IActionContext & ISubscriptionContext,
): Promise<ConnectorArmClient> {
    const client: ServiceClient = await createGenericClient(context, context);
    return {
        async get(url: string): Promise<unknown> {
            const response = await client.sendRequest(createPipelineRequest({
                method: 'GET',
                url,
            })) as AzExtPipelineResponse;
            return response.parsedBody;
        },
    };
}
