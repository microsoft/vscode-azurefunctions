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
import { isFeaturedConnectorId } from '../../../webview/connectorTriggerPicker/connectorTriggerGroups';
import { requestUtils } from '../../../utils/requestUtils';

const managedApiCatalogApiVersion = '2016-06-01';
const managedApiOperationsApiVersion = '2016-06-01';
const catalogRequestConcurrency = 8;

export interface ConnectorTriggerCatalog {
    connectors: ConnectorTriggerOption[];
    operations: ConnectorTriggerOperationOption[];
}

export interface ConnectorTriggerCatalogResult {
    catalog: ConnectorTriggerCatalog;
    failedConnectorCount: number;
    source: 'live';
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

export type ConnectorSubscriptionsProvider = () => Promise<ConnectorSubscription[]>;
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
    private _subscriptions: ConnectorSubscription[] | undefined;
    private subscriptionsGeneration = 0;
    private subscriptionsPromise: Promise<ConnectorSubscription[]> | undefined;

    public constructor(
        private readonly subscriptionsProvider: ConnectorSubscriptionsProvider = getSubscriptions,
        private readonly armClientFactory: ConnectorArmClientFactory = createArmClient,
        private readonly locationsProvider: ConnectorLocationsProvider =
            getConnectorLocations,
    ) { }

    public async listSubscriptions(): Promise<ConnectorTriggerSubscriptionOption[]> {
        try {
            return (await this.getSubscriptions())
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
        const subscriptions = await this.getSubscriptions();
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
        context.telemetry.properties.connectorCatalogPartial =
            String(result.failedConnectorCount > 0);
        return {
            ...result,
            source: 'live',
        };
    }

    public async listCatalog(
        context: IActionContext,
        namespace: ConnectorNamespaceOption,
    ): Promise<ConnectorTriggerCatalog> {
        const subscription = (await this.getSubscriptions())
            .find(item => item.subscriptionId === namespace.subscriptionId);
        if (!subscription) {
            throw new Error(localize(
                'connectorSubscriptionUnavailable',
                'The subscription for Connector Namespace "{0}" is no longer available.',
                namespace.name,
            ));
        }

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
        failedConnectorCount: number;
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
        const availableApis = managedApis.filter(
            (api): api is ManagedApiDefinition & { name: string } =>
                typeof api.name === 'string' &&
                !!api.name.trim() &&
                isFeaturedConnectorId(api.name),
        );
        const results = await mapInBatches(
            availableApis,
            catalogRequestConcurrency,
            async api => {
                const connectorId = api.name;
                const operationsUrl = requestUtils.createRequestUrl(
                    `${locationUrl}/managedApis/${encodeURIComponent(connectorId)}/apiOperations`,
                    {
                        'api-version': managedApiOperationsApiVersion,
                    },
                );
                try {
                    const operations = await listAll<ManagedApiOperation>(
                        client,
                        operationsUrl,
                    );
                    const connectorInformation = api.properties?.generalInformation;
                    const connectorLabel = api.properties?.displayName?.trim() ||
                        connectorInformation?.displayName?.trim() ||
                        connectorId;
                    const connectorDescription = api.properties?.description?.trim() ||
                        connectorInformation?.description?.trim();
                    const connectorIconUrl = getConnectorIconUrl(
                        api.properties?.iconUri,
                        connectorInformation?.iconUri,
                        api.properties?.iconUrl,
                        connectorInformation?.iconUrl,
                    );
                    const triggerOperations = operations
                        .filter(isTriggerOperation)
                        .map(operation => ({
                            ...operation,
                            properties: {
                                ...operation.properties,
                                api: {
                                    ...operation.properties?.api,
                                    name: connectorId,
                                    displayName: connectorLabel,
                                    description: connectorDescription,
                                    iconUri: connectorIconUrl,
                                },
                            },
                        }));
                    return createCatalog([api], triggerOperations);
                } catch {
                    return undefined;
                }
            },
        );
        const catalogs = results.filter(
            (catalog): catalog is ConnectorTriggerCatalog => !!catalog,
        );
        const failedConnectorCount = results.length - catalogs.length;
        if (availableApis.length > 0 && catalogs.length === 0) {
            throw new Error(localize(
                'connectorCatalogOperationsUnavailable',
                'Connector event metadata is unavailable in the selected Azure subscription and region.',
            ));
        }

        return {
            catalog: {
                connectors: catalogs
                .flatMap(catalog => catalog.connectors)
                .sort((left, right) =>
                    left.label.localeCompare(right.label) ||
                    left.id.localeCompare(right.id)),
                operations: catalogs
                .flatMap(catalog => catalog.operations)
                .sort((left, right) =>
                    left.connectorId.localeCompare(right.connectorId) ||
                    left.label.localeCompare(right.label) ||
                    left.id.localeCompare(right.id)),
            },
            failedConnectorCount,
        };
    }

    public registerSubscription(context: ISubscriptionContext): void {
        this.subscriptionsGeneration += 1;
        this.subscriptionsPromise = undefined;
        const subscription: ConnectorSubscription = {
            subscriptionId: context.subscriptionId,
            subscriptionDisplayName: context.subscriptionDisplayName,
            context,
        };
        const subscriptions = this._subscriptions ?? [];
        this._subscriptions = [
            ...subscriptions.filter(item => item.subscriptionId !== context.subscriptionId),
            subscription,
        ];
    }

    public invalidateSubscriptions(): void {
        this.subscriptionsGeneration += 1;
        this._subscriptions = undefined;
        this.subscriptionsPromise = undefined;
    }

    private async getSubscriptions(): Promise<ConnectorSubscription[]> {
        if (this._subscriptions) {
            return this._subscriptions;
        }

        const generation = this.subscriptionsGeneration;
        const promise = this.subscriptionsPromise ??= this.subscriptionsProvider();
        try {
            const subscriptions = await promise;
            if (generation !== this.subscriptionsGeneration) {
                return await this.getSubscriptions();
            }

            this._subscriptions = subscriptions;
            this.subscriptionsPromise = undefined;
            return subscriptions;
        } catch (error) {
            if (generation === this.subscriptionsGeneration &&
                this.subscriptionsPromise === promise) {
                this.subscriptionsPromise = undefined;
            }
            throw error;
        }
    }

    private async getSubscription(
        subscriptionId: string,
    ): Promise<ConnectorSubscription> {
        const subscription = (await this.getSubscriptions())
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

function createCatalog(
    managedApis: ManagedApiDefinition[],
    managedApiOperations: ManagedApiOperation[],
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
            isWebhook) {
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

async function mapInBatches<T, TResult>(
    values: readonly T[],
    batchSize: number,
    mapper: (value: T) => Promise<TResult>,
): Promise<TResult[]> {
    const results: TResult[] = [];
    for (let index = 0; index < values.length; index += batchSize) {
        results.push(...await Promise.all(
            values.slice(index, index + batchSize).map(mapper),
        ));
    }
    return results;
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

async function getSubscriptions(): Promise<ConnectorSubscription[]> {
    return (await ext.rgApi.getSubscriptions(true)).map(subscription => {
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
