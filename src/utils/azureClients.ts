/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApplicationInsightsManagementClient } from '@azure/arm-appinsights';
import { WebSiteManagementClient } from '@azure/arm-appservice';
import { CosmosDBManagementClient } from '@azure/arm-cosmosdb';
import { EventHubManagementClient } from '@azure/arm-eventhub';
import { ServiceBusManagementClient } from '@azure/arm-servicebus';
import { StorageManagementClient } from '@azure/arm-storage';
import { createAzureClient, ISubscriptionContext } from 'vscode-azureextensionui';

// Lazy-load @azure packages to improve startup performance.
// NOTE: The client is the only import that matters, the rest of the types disappear when compiled to JavaScript

export async function createStorageClient<T extends ISubscriptionContext>(context: T): Promise<StorageManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-storage')).StorageManagementClient);
}

export async function createCosmosDBClient<T extends ISubscriptionContext>(context: T): Promise<CosmosDBManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-cosmosdb')).CosmosDBManagementClient);
}

export async function createEventHubClient<T extends ISubscriptionContext>(context: T): Promise<EventHubManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-eventhub')).EventHubManagementClient);
}

export async function createServiceBusClient<T extends ISubscriptionContext>(context: T): Promise<ServiceBusManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-servicebus')).ServiceBusManagementClient);
}

export async function createWebSiteClient<T extends ISubscriptionContext>(context: T): Promise<WebSiteManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-appservice')).WebSiteManagementClient);
}

export async function createAppInsightsClient<T extends ISubscriptionContext>(context: T): Promise<ApplicationInsightsManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-appinsights')).ApplicationInsightsManagementClient);
}
