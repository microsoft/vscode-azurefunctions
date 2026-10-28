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
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { requestUtils } from '../../../utils/requestUtils';

export interface ConnectorTriggerCatalog {
    connectors: ConnectorTriggerOption[];
    operations: ConnectorTriggerOperationOption[];
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

export interface ConnectorArmClient {
    get(url: string): Promise<unknown>;
}

export type ConnectorSubscriptionsProvider = () => Promise<ConnectorSubscription[]>;
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
        generalInformation?: {
            displayName?: string;
            description?: string;
            iconUri?: string;
        };
    };
}

interface ManagedApiOperation {
    name?: string;
    properties?: {
        summary?: string;
        description?: string;
        visibility?: string;
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
    };
}

export class ConnectorTriggerDataClient {
    private _subscriptions: ConnectorSubscription[] | undefined;

    public constructor(
        private readonly subscriptionsProvider: ConnectorSubscriptionsProvider = getSubscriptions,
        private readonly armClientFactory: ConnectorArmClientFactory = createArmClient,
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

    public registerSubscription(context: ISubscriptionContext): void {
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

    private async getSubscriptions(): Promise<ConnectorSubscription[]> {
        this._subscriptions ??= await this.subscriptionsProvider();
        return this._subscriptions;
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

        const information = api.properties?.generalInformation;
        const label = information?.displayName?.trim() || id;
        connectors.set(id.toLowerCase(), {
            id,
            label,
            description: information?.description?.trim(),
            iconUrl: getHttpsUrl(information?.iconUri),
            templateSearch: label,
        });
    }

    const operationCandidates = new Map<string, {
        operation: ConnectorTriggerOperationOption;
        revision: number;
    }>();
    for (const operation of managedApiOperations) {
        const id = operation.name?.trim();
        const api = operation.properties?.api;
        const connectorId = api?.name?.trim();
        const visibility = operation.properties?.visibility?.toLowerCase();
        if (!id || !connectorId || visibility === 'internal' || visibility === 'hideinui') {
            continue;
        }

        const connectorKey = connectorId.toLowerCase();
        const connectorLabel = api?.displayName?.trim() || connectorId;
        if (!connectors.has(connectorKey)) {
            connectors.set(connectorKey, {
                id: connectorId,
                label: connectorLabel,
                description: api?.description?.trim(),
                iconUrl: getHttpsUrl(api?.iconUri),
                templateSearch: connectorLabel,
            });
        }

        const candidate: ConnectorTriggerOperationOption = {
            id,
            connectorId,
            label: operation.properties?.summary?.trim() || id,
            description: operation.properties?.triggerHint?.trim() ||
                operation.properties?.description?.trim(),
            isWebhook: operation.properties?.isWebhook === true,
            isNotification: operation.properties?.isNotification === true,
        };
        const family = operation.properties?.annotation?.family?.trim().toLowerCase();
        const key = `${connectorKey}:${family || id.toLowerCase()}`;
        const revision = operation.properties?.annotation?.revision ?? 0;
        const existing = operationCandidates.get(key);
        if (!existing || revision > existing.revision) {
            operationCandidates.set(key, { operation: candidate, revision });
        }
    }

    const operations = [...operationCandidates.values()].map(candidate => candidate.operation);
    const connectorIdsWithTriggers = new Set(operations.map(operation => operation.connectorId.toLowerCase()));
    const connectorOptions = [...connectors.entries()]
        .filter(([connectorId]) => connectorIdsWithTriggers.has(connectorId))
        .map(([, connector]) => connector)
        .sort((left, right) => left.label.localeCompare(right.label));
    operations.sort((left, right) =>
        left.connectorId.localeCompare(right.connectorId) ||
        left.label.localeCompare(right.label));

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

function getHttpsUrl(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    try {
        const url = new URL(value);
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
