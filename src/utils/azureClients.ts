/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApplicationInsightsManagementClient } from '@azure/arm-appinsights';
import { WebSiteManagementClient } from '@azure/arm-appservice';
import { CosmosDBManagementClient } from '@azure/arm-cosmosdb';
import { EventHubManagementClient } from '@azure/arm-eventhub';
import { ServiceBusManagementClient } from '@azure/arm-servicebus';
import { SqlManagementClient } from '@azure/arm-sql';
import { StorageManagementClient } from '@azure/arm-storage';
import { AzExtClientContext, createAzureClient } from '@microsoft/vscode-azext-azureutils';

// Lazy-load @azure packages to improve startup performance.
// NOTE: The client is the only import that matters, the rest of the types disappear when compiled to JavaScript

export async function createStorageClient(context: AzExtClientContext): Promise<StorageManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-storage')).StorageManagementClient);
}

export async function createCosmosDBClient(context: AzExtClientContext): Promise<CosmosDBManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-cosmosdb')).CosmosDBManagementClient);
}

export async function createEventHubClient(context: AzExtClientContext): Promise<EventHubManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-eventhub')).EventHubManagementClient);
}

export async function createServiceBusClient(context: AzExtClientContext): Promise<ServiceBusManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-servicebus')).ServiceBusManagementClient);
}

export async function createSqlClient(context: AzExtClientContext): Promise<SqlManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-sql')).SqlManagementClient);
}

export async function createWebSiteClient(context: AzExtClientContext): Promise<WebSiteManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-appservice')).WebSiteManagementClient);
}

export async function createAppInsightsClient(context: AzExtClientContext): Promise<ApplicationInsightsManagementClient> {
    return createAzureClient(context, (await import('@azure/arm-appinsights')).ApplicationInsightsManagementClient);
}
