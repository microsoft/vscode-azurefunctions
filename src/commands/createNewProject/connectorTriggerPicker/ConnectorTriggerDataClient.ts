/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ServiceClient } from '@azure/core-client';
import { createPipelineRequest } from '@azure/core-rest-pipeline';
import { createGenericClient, parseAzureResourceId, type AzExtPipelineResponse } from '@microsoft/vscode-azext-azureutils';
import { createSubscriptionContext, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { ConnectorNamespaceApiVersion } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import {
    type ConnectorNamespaceOption,
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { requestUtils } from '../../../utils/requestUtils';
import {
    parseConnectorInputsDefinition,
    parseConnectorSwaggerInputs,
} from './connectorTriggerInputs';
import {
    ConnectorCatalogError,
    ConnectorCatalogLiveLoadError,
    ConnectorTriggerCatalogProvider,
    type ConnectorCatalogBaseline,
    type ConnectorTriggerCatalog,
    type ConnectorTriggerCatalogResult,
    type IConnectorTriggerCatalogProvider,
} from './ConnectorTriggerCatalogProvider';

const managedApiSwaggerApiVersion = '2022-09-01-preview';

export type {
    ConnectorCatalogConnector,
    ConnectorCatalogItemAvailability,
    ConnectorCatalogLiveRefresh,
    ConnectorCatalogOperation,
    ConnectorCatalogSource,
    ConnectorTriggerCatalog,
    ConnectorTriggerCatalogResult,
} from './ConnectorTriggerCatalogProvider';

export interface ConnectorNamespaceResult {
    namespaces: ConnectorNamespaceOption[];
    failedSubscriptionCount: number;
}

export interface ConnectorSubscription {
    subscriptionId: string;
    subscriptionDisplayName: string;
    context: ISubscriptionContext;
}

export interface ConnectorArmClient {
    get(url: string): Promise<unknown>;
}

export type ConnectorSubscriptionsProvider = () => Promise<ConnectorSubscription[]>;
export type ConnectorAuthenticationProvider = () => Promise<boolean>;
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
        private readonly catalogProvider: IConnectorTriggerCatalogProvider =
            new ConnectorTriggerCatalogProvider(),
        private readonly authenticationProvider: ConnectorAuthenticationProvider =
            getIsSignedIn,
    ) { }

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
        namespace?: ConnectorNamespaceOption,
    ): Promise<ConnectorTriggerCatalogResult> {
        return await this.catalogProvider.getCatalog(
            context,
            namespace ?
                () => this.listCatalog(context, namespace) :
                baseline => this.listAuthenticatedCatalog(context, baseline),
        );
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

    private async listAuthenticatedCatalog(
        context: IActionContext,
        baseline: ConnectorCatalogBaseline | undefined,
    ): Promise<ConnectorTriggerCatalog | undefined> {
        if (!baseline || !await this.authenticationProvider()) {
            return undefined;
        }

        const subscriptions = await this.getSubscriptions();
        if (subscriptions.length === 0) {
            throw new ConnectorCatalogLiveLoadError(
                ConnectorCatalogError.LiveSubscriptionUnavailable,
            );
        }

        const subscription = subscriptions.find(item =>
            isCloudCompatible(baseline.snapshotSource.cloud, item.context));
        if (!subscription) {
            throw new ConnectorCatalogLiveLoadError(
                ConnectorCatalogError.LiveCloudMismatch,
            );
        }

        return await this.listLocationCatalog(context, subscription, baseline);
    }

    private async listLocationCatalog(
        context: IActionContext,
        subscription: ConnectorSubscription,
        baseline: ConnectorCatalogBaseline,
    ): Promise<ConnectorTriggerCatalog> {
        const location = normalizeLocation(baseline.snapshotSource.region);
        if (!location) {
            throw new ConnectorCatalogLiveLoadError(
                ConnectorCatalogError.LiveCatalogUnavailable,
            );
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
                'api-version':
                    baseline.snapshotSource.catalogApiVersion,
            },
        );
        const managedApis = await listAll<ManagedApiDefinition>(
            client,
            managedApisUrl,
        );
        const baselineConnectorIds = new Set(
            baseline.catalog.connectors.map(connector =>
                connector.id.toLowerCase()),
        );
        const matchingApis = managedApis.filter((api): api is ManagedApiDefinition & { name: string } =>
            typeof api.name === 'string' &&
            baselineConnectorIds.has(api.name.toLowerCase()),
        );

        let swaggerFailureCount = 0;
        const catalogs = await Promise.all(matchingApis.map(async api => {
            const connectorId = api.name;
            const operationsUrl = requestUtils.createRequestUrl(
                `${locationUrl}/managedApis/${encodeURIComponent(connectorId)}/apiOperations`,
                {
                    'api-version':
                        baseline.snapshotSource.operationsApiVersion,
                },
            );
            const swaggerUrl = requestUtils.createRequestUrl(
                `${locationUrl}/managedApis/${encodeURIComponent(connectorId)}`,
                {
                    'api-version':
                        baseline.snapshotSource.swaggerApiVersion,
                    export: 'true',
                },
            );
            const [operations, swagger] = await Promise.all([
                listAll<ManagedApiOperation>(client, operationsUrl),
                client.get(swaggerUrl).catch(() => {
                    swaggerFailureCount += 1;
                    return undefined;
                }),
            ]);
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
            const catalog = createCatalog([api], triggerOperations);
            if (swagger !== undefined) {
                catalog.operations = catalog.operations.map(operation => {
                    const inputDefinitions = parseConnectorSwaggerInputs(
                        swagger,
                        operation.id,
                    );
                    return inputDefinitions === undefined ?
                        operation :
                        { ...operation, inputDefinitions };
                });
            }
            return catalog;
        }));

        context.telemetry.properties.connectorCatalogSwaggerRefresh =
            matchingApis.length === 0 ?
                'NotRequested' :
                swaggerFailureCount > 0 ?
                    'Partial' :
                    'Succeeded';
        return {
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

    public async listOperationInputs(
        context: IActionContext,
        namespace: ConnectorNamespaceOption,
        connectorId: string,
        operationId: string,
    ): Promise<ConnectorTriggerInputDefinition[]> {
        const subscription = (await this.getSubscriptions())
            .find(item => item.subscriptionId === namespace.subscriptionId);
        if (!subscription) {
            throw new Error(localize(
                'connectorSubscriptionUnavailable',
                'The subscription for Connector Namespace "{0}" is no longer available.',
                namespace.name,
            ));
        }

        const location = namespace.location.replace(/\s+/g, '').toLowerCase();
        if (!location) {
            throw new Error(localize(
                'connectorNamespaceLocationUnavailable',
                'The Connector Namespace location is unavailable.',
            ));
        }

        const clientContext = Object.assign({}, context, subscription.context);
        const client = await this.armClientFactory(clientContext);
        const endpoint = getResourceManagerEndpoint(subscription.context);
        const url = requestUtils.createRequestUrl(
            `${endpoint}/subscriptions/${subscription.subscriptionId}/providers/Microsoft.Web/locations/${location}/managedApis/${encodeURIComponent(connectorId)}`,
            {
                'api-version': managedApiSwaggerApiVersion,
                export: 'true',
            },
        );
        const swagger = await client.get(url);
        const inputDefinitions = parseConnectorSwaggerInputs(swagger, operationId);
        if (!inputDefinitions) {
            throw new Error(localize(
                'connectorOperationInputsUnavailable',
                'The selected connector event input schema could not be loaded.',
            ));
        }

        return inputDefinitions;
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

        const inputDefinitions = operation.properties?.inputsDefinition === undefined ?
            undefined :
            parseConnectorInputsDefinition(operation.properties.inputsDefinition);
        operations.push({
            id,
            connectorId,
            label: operation.properties?.summary?.trim() || id,
            description: operation.properties?.triggerHint?.trim() ||
                operation.properties?.description?.trim(),
            isWebhook,
            isNotification,
            ...(inputDefinitions === undefined ? {} : { inputDefinitions }),
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
    let nextUrl: string | undefined = initialUrl;
    while (nextUrl) {
        const currentUrl = nextUrl;
        if (visited.has(currentUrl)) {
            throw new Error(localize('connectorApiPagingLoop', 'The Connector Namespace API returned an invalid paging link.'));
        }
        visited.add(currentUrl);

        const response = await client.get(currentUrl) as ArmListResult<T>;
        items.push(...response.value ?? []);
        nextUrl = response.nextLink ? new URL(response.nextLink, currentUrl).toString() : undefined;
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

function isCloudCompatible(
    sourceCloud: string,
    context: ISubscriptionContext,
): boolean {
    const source = normalizeCloud(sourceCloud);
    const environmentName = normalizeCloud(context.environment.name);
    if (environmentName) {
        return source === environmentName;
    }

    const endpointHost = new URL(
        context.environment.resourceManagerEndpointUrl,
    ).hostname.toLowerCase();
    const endpointCloud =
        endpointHost === 'management.azure.com' ?
            'azurecloud' :
            endpointHost === 'management.usgovcloudapi.net' ?
                'azureusgovernment' :
                endpointHost === 'management.chinacloudapi.cn' ?
                    'azurechinacloud' :
                    endpointHost === 'management.microsoftazure.de' ?
                        'azuregermancloud' :
                        undefined;
    return source === endpointCloud;
}

function normalizeCloud(value: string | undefined): string | undefined {
    const normalized = value?.replace(/[^a-z\d]/gi, '').toLowerCase();
    if (!normalized) {
        return undefined;
    }

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

async function getIsSignedIn(): Promise<boolean> {
    return await ext.azureAccountTreeItem.getIsLoggedIn();
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
