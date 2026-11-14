/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ServiceClient } from '@azure/core-client';
import { createPipelineRequest } from '@azure/core-rest-pipeline';
import {
    createGenericClient,
    LocationListStep,
    type AzExtLocation,
    type AzExtPipelineResponse,
    type ILocationWizardContext,
} from '@microsoft/vscode-azext-azureutils';
import { createSubscriptionContext, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { ConnectorNamespaceResourceType, webProvider } from '../../../constants';
import { createManagedApiExportUrl, createManagedApisUrl, listArmPages, normalizeConnectorLocation, type ArmListResult } from '../../../connectorTrigger/connectorTriggerArm';
import {
    parseConnectorTriggerOutputMetadata,
    type ConnectorTriggerOutputMetadata,
} from '../../../connectorTrigger/connectorTriggerOutputSchema';
import { listSwaggerOperations, unwrapConnectorSwagger } from '../../../connectorTrigger/connectorTriggerSwagger';
import { asRecord, maskValues } from '../../../connectorTrigger/connectorTriggerUtils';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import {
    type ConnectorTriggerLocationOption,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerSubscriptionOption,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
const maxCachedConnectorDefinitions = 4;

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

export interface ConnectorSubscription {
    subscriptionId: string;
    subscriptionDisplayName: string;
    context: ISubscriptionContext;
}

export interface ConnectorSubscriptionScopeOption {
    id: string;
    label: string;
    accountId?: string;
    accountLabel?: string;
}

export interface ConnectorTriggerAzureContext {
    subscriptionId: string;
    /** Azure Resources account the subscription was selected under; when set, only that account's subscription is used. */
    accountId?: string;
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

export class ConnectorTriggerDataClient {
    private readonly registeredSubscriptions =
        new Map<string, ConnectorSubscription>();
    private readonly subscriptions = new Map<boolean, ConnectorSubscription[]>();
    private readonly subscriptionPromises =
        new Map<boolean, Promise<ConnectorSubscription[]>>();
    private subscriptionsGeneration = 0;
    private readonly connectorDefinitions = new Map<string, Promise<unknown>>();

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

    /** Lists subscriptions with their Azure Resources account, so the same subscription under several accounts stays distinct. */
    public async listSubscriptionScopes(
        showAll = false,
    ): Promise<ConnectorSubscriptionScopeOption[]> {
        try {
            return (await this.getSubscriptions(!showAll))
                .map(subscription => {
                    const account = getSubscriptionAccount(subscription.context);
                    return {
                        id: subscription.subscriptionId,
                        label: subscription.subscriptionDisplayName,
                        accountId: account.id,
                        accountLabel: account.label,
                    };
                })
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
        accountId?: string,
    ): Promise<ConnectorTriggerLocationOption[]> {
        const subscription = await this.getSubscription(subscriptionId, accountId);
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
        accountId?: string,
    ): Promise<ISubscriptionContext> {
        return (await this.getSubscription(subscriptionId, accountId)).context;
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

    private async listLocationCatalog(
        context: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
    ): Promise<{
        catalog: ConnectorTriggerCatalog;
    }> {
        const subscription = await this.getSubscription(azureContext.subscriptionId, azureContext.accountId);
        maskSubscriptionContext(context, subscription.context);

        const location = normalizeConnectorLocation(azureContext.region);
        if (!location) {
            throw new Error(localize(
                'connectorRegionUnavailable',
                'Select a valid Azure region for Connector Triggers.',
            ));
        }

        const clientContext = Object.assign({}, context, subscription.context);
        const client = await this.armClientFactory(clientContext);
        const managedApisUrl = createManagedApisUrl(subscription.context, location);
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
        const metadata = await this.listConnectorOperationMetadata(
            context,
            azureContext,
            connectorId,
        );
        return [...metadata.pollOperations, ...metadata.webhookOperations].sort((left, right) =>
            left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
    }

    public async listConnectorOperationMetadata(
        context: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
        connectorId: string,
    ): Promise<ConnectorTriggerOperationMetadataResult> {
        const subscription = await this.getSubscription(azureContext.subscriptionId, azureContext.accountId);
        maskSubscriptionContext(context, subscription.context);
        maskValues(
            context,
            azureContext.region,
            azureContext.regionDisplayName,
        );
        const location = normalizeConnectorLocation(azureContext.region);
        if (!location) {
            throw new Error(localize(
                'connectorRegionUnavailable',
                'Select a valid Azure region for Connector Triggers.',
            ));
        }

        const swaggerUrl = createManagedApiExportUrl(subscription.context, location, connectorId);
        const client = await this.armClientFactory(Object.assign({}, context, subscription.context));
        try {
            const definition = await client.get(swaggerUrl);
            const operations = createOperationOptions(definition, connectorId);
            this.cacheConnectorDefinition(swaggerUrl, Promise.resolve(definition));
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

    public async getConnectorOperationOutputMetadata(
        context: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
        connectorId: string,
        operationId: string,
    ): Promise<ConnectorTriggerOutputMetadata> {
        const subscription = await this.getSubscription(azureContext.subscriptionId, azureContext.accountId);
        maskSubscriptionContext(context, subscription.context);
        maskValues(
            context,
            azureContext.region,
            azureContext.regionDisplayName,
        );
        const location = normalizeConnectorLocation(azureContext.region);
        if (!location) {
            throw new Error(localize(
                'connectorRegionUnavailable',
                'Select a valid Azure region for Connector Triggers.',
            ));
        }

        const swaggerUrl = createManagedApiExportUrl(subscription.context, location, connectorId);
        const cacheKey = swaggerUrl.toLowerCase();
        let request = this.connectorDefinitions.get(cacheKey);
        if (!request) {
            request = (async () => {
                const client = await this.armClientFactory(Object.assign({}, context, subscription.context));
                return await client.get(swaggerUrl);
            })();
            this.cacheConnectorDefinition(swaggerUrl, request);
        }
        try {
            let definition: unknown;
            try {
                definition = await request;
            } catch (error) {
                if (this.connectorDefinitions.get(cacheKey) === request) {
                    this.connectorDefinitions.delete(cacheKey);
                }
                throw error;
            }
            return parseConnectorTriggerOutputMetadata(definition, operationId);
        } catch (error) {
            throw new Error(localize(
                'connectorOutputSchemaLoadFailed',
                'Unable to load the selected connector event output definition.',
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
        this.connectorDefinitions.clear();
    }

    private cacheConnectorDefinition(url: string, definition: Promise<unknown>): void {
        const key = url.toLowerCase();
        this.connectorDefinitions.delete(key);
        this.connectorDefinitions.set(key, definition);
        // Exported definitions can be large; keep only recently selected connectors.
        while (this.connectorDefinitions.size > maxCachedConnectorDefinitions) {
            const oldest = this.connectorDefinitions.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.connectorDefinitions.delete(oldest);
        }
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
        accountId?: string,
    ): Promise<ConnectorSubscription> {
        // The same subscription ID can be listed under several accounts; a selected account must match exactly.
        const matches = (item: ConnectorSubscription | undefined): item is ConnectorSubscription =>
            item?.subscriptionId === subscriptionId &&
            (accountId === undefined || getSubscriptionAccount(item.context).id === accountId);
        const registered = this.registeredSubscriptions.get(subscriptionId);
        const subscription = (matches(registered) ? registered : undefined) ??
            [...this.subscriptions.values()]
            .flat()
            .find(matches) ??
            (await this.getSubscriptions(false))
                .find(matches);
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

function createOperationOptions(
    definition: unknown,
    connectorId: string,
): ConnectorTriggerOperationOption[] {
    const swagger = unwrapConnectorSwagger(definition);
    // Mirrors the Connector Namespace portal: only `paths` triggers, minus internal ones, one revision per family,
    // and text-marked deprecated triggers. The Swagger `deprecated` flag is intentionally ignored because some
    // flagged triggers remain valid for Connector Namespaces.
    const swaggerOperations = swagger && listSwaggerOperations(swagger, false);
    if (!swaggerOperations) {
        throw new Error(localize(
            'connectorEventDefinitionInvalid',
            'The selected connector did not return a valid event definition.',
        ));
    }

    const operations = new Map<string, ConnectorTriggerOperationOption>();
    const families = new Map<string, { id: string; revision: number }>();
    const deprecatedIds = new Set<string>();
    for (const { pathItem, operation } of swaggerOperations) {
        if (operation['x-ms-trigger'] === undefined || operation['x-ms-trigger'] === null) {
            continue;
        }

        const id = readString(operation.operationId);
        const summary = readString(operation.summary);
        const description = readString(operation.description);
        if (!id || readString(operation['x-ms-visibility'])?.toLowerCase() === 'internal') {
            continue;
        }

        const annotation = asRecord(operation['x-ms-api-annotation']);
        const family = readString(annotation?.family)?.toLowerCase();
        if (family) {
            const revision = Number(annotation?.revision);
            const normalizedRevision = Number.isFinite(revision) ? revision : 0;
            const current = families.get(family);
            if (current && current.revision >= normalizedRevision) {
                continue;
            }
            if (current) {
                operations.delete(current.id.toLowerCase());
            }
            families.set(family, { id, revision: normalizedRevision });
        }

        const isWebhook = !!asRecord(pathItem['x-ms-notification-content']);
        if ([summary, id, description].some(text => /deprecated/i.test(text ?? ''))) {
            deprecatedIds.add(id.toLowerCase());
        }
        operations.set(id.toLowerCase(), {
            id,
            connectorId,
            label: summary || id,
            description: readString(operation['x-ms-trigger-hint']) || description,
            isWebhook,
            isNotification: operation['x-ms-notification'] === true,
        });
    }
    for (const id of deprecatedIds) {
        operations.delete(id);
    }
    return [...operations.values()].sort((left, right) =>
        left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
}

async function listAll<T>(client: ConnectorArmClient, initialUrl: string): Promise<T[]> {
    return await listArmPages(initialUrl, async url => await client.get(url) as ArmListResult<T>, {
        pagingLoop: () => new Error(localize('connectorApiPagingLoop', 'The Connector Namespace API returned an invalid paging link.')),
        invalidNextLink: () => new Error(localize('connectorApiPagingLoop', 'The Connector Namespace API returned an invalid paging link.')),
        invalidOrigin: () => new Error(localize('connectorApiPagingOrigin', 'Azure returned an invalid paging host for Connector Trigger metadata.')),
    });
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value.trim() : undefined;
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
        getSubscriptionAccount(subscription).id,
        getSubscriptionAccount(subscription).label,
    );
}

/** Azure Resources subscriptions carry their account at runtime; ISubscriptionContext does not type it. */
export function getSubscriptionAccount(subscription: ISubscriptionContext): { id?: string; label?: string } {
    const account = (subscription as { account?: unknown }).account;
    if (!account || typeof account !== 'object') {
        return {};
    }
    const { id, label } = account as { id?: unknown; label?: unknown };
    return {
        id: typeof id === 'string' && id ? id : undefined,
        label: typeof label === 'string' && label ? label : undefined,
    };
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
